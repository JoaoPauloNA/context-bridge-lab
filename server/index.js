#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { spawn, execFile } from 'child_process'
import { writeFile, mkdir, appendFile } from 'fs/promises'
import { existsSync } from 'fs'
import { dirname, resolve, relative, isAbsolute, join, delimiter, basename } from 'path'
import { promisify } from 'util'
import process from 'process'

const execFileAsync = promisify(execFile)

const INLINE_CAP = 4000
const PREVIEW_CAP = 600
const DEFAULT_TIMEOUT_MS = 300_000

const ALLOWED_APPROVAL_MODES = new Set(['plan', 'default', 'auto_edit', 'yolo'])

// O modo "yolo" (Gemini executa sem confirmacao) so e liberado com ALLOW_GEMINI_YOLO=1.
const YOLO_ALLOWED = process.env.ALLOW_GEMINI_YOLO === '1'

function stripAnsi(str) {
  return String(str || '')
    .replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '')
    .replace(/\x1B\][^\x07\x1B]*[\x07\x1B]/g, '')
    .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '')
}

function getProjectDir(cwd) {
  return cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd()
}

function ensurePathInsideRoot(root, targetPath) {
  const absRoot = resolve(root)
  const absTarget = resolve(absRoot, targetPath)
  const rel = relative(absRoot, absTarget)

  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`Caminho fora do projeto bloqueado: ${targetPath}`)
  }

  return absTarget
}

const METRICS_RELATIVE_PATH = 'docs/gemini-output/_metrics/gemini-runs.jsonl'

// Gravacao automatica de metricas (v3.1). Best-effort: nunca derruba a tool.
async function recordMetrics(workDir, record) {
  try {
    const file = resolve(workDir, METRICS_RELATIVE_PATH)
    await mkdir(dirname(file), { recursive: true })
    await appendFile(file, JSON.stringify(record) + '\n', 'utf8')
    return file
  } catch {
    return null
  }
}

function makeTaskId(mode, task_type, startedAt) {
  const stamp = startedAt
    .toISOString()
    .replace(/[-:T]/g, '')
    .replace(/\.\d+Z$/, '')
  return `${mode}-${task_type}-${stamp}`
}

function deriveChangedFiles(briefing) {
  const changed = Array.isArray(briefing?.files_changed) ? briefing.files_changed : []
  const created = []
  const modified = []
  for (const f of changed) {
    if (!f || !f.path) continue
    if (f.action === 'modified') modified.push(f.path)
    else created.push(f.path)
  }
  return { created, modified }
}

function uniq(arr) {
  return [...new Set((arr || []).filter(Boolean))]
}

// Evidencia real de mudancas via git (best-effort). Retorna null se nao for repo git.
async function gitPorcelain(cwd) {
  try {
    const { stdout } = await execFileAsync('git', ['status', '--porcelain'], {
      cwd,
      windowsHide: true,
      maxBuffer: 4 * 1024 * 1024
    })
    return parsePorcelain(stdout)
  } catch {
    return null
  }
}

function parsePorcelain(stdout) {
  const map = new Map()
  for (const line of String(stdout || '').split('\n')) {
    if (!line.trim()) continue
    const code = line.slice(0, 2)
    let p = line.slice(3).trim()
    if (p.includes(' -> ')) p = p.split(' -> ').pop().trim() // renomeado
    map.set(p, code)
  }
  return map
}

// Compara dois snapshots porcelain e classifica os arquivos realmente alterados.
function diffPorcelain(before, after) {
  const created = []
  const modified = []
  const deleted = []
  if (!after) return { created, modified, deleted }
  for (const [p, code] of after) {
    if (before && before.get(p) === code) continue // sem mudanca desde o snapshot inicial
    if (code.includes('?') || code.includes('A')) created.push(p)
    else if (code.includes('D')) deleted.push(p)
    else if (code.includes('M') || code.includes('R')) modified.push(p)
    else created.push(p)
  }
  return { created: uniq(created), modified: uniq(modified), deleted: uniq(deleted) }
}

async function gitDiffEvidence(cwd) {
  const evidence = { name_only: [], stat: null }
  try {
    const { stdout } = await execFileAsync('git', ['diff', '--name-only'], {
      cwd,
      windowsHide: true,
      maxBuffer: 4 * 1024 * 1024
    })
    evidence.name_only = stdout
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
  } catch {}
  try {
    const { stdout } = await execFileAsync('git', ['diff', '--stat'], {
      cwd,
      windowsHide: true,
      maxBuffer: 4 * 1024 * 1024
    })
    evidence.stat = stdout.trim().slice(0, 4000) || null
  } catch {}
  return evidence
}

function resolveGeminiInvocation() {
  if (process.platform !== 'win32') {
    return { command: 'gemini', prefixArgs: [], useShell: false }
  }

  // No Windows, Node >=18.20/20.12/22 bloqueia spawn de .cmd com shell:false (EINVAL).
  // Em vez do gemini.cmd, rodamos o node diretamente contra o bundle gemini.js,
  // mantendo shell:false para preservar o prompt (aspas, |, <<<, quebras de linha) sem risco de injeção.
  const jsCandidates = []
  if (process.env.GEMINI_CLI_JS) jsCandidates.push(process.env.GEMINI_CLI_JS)
  if (process.env.APPDATA) {
    jsCandidates.push(
      join(
        process.env.APPDATA,
        'npm',
        'node_modules',
        '@google',
        'gemini-cli',
        'bundle',
        'gemini.js'
      )
    )
  }
  for (const dir of (process.env.PATH || '').split(delimiter)) {
    if (!dir) continue
    jsCandidates.push(join(dir, 'node_modules', '@google', 'gemini-cli', 'bundle', 'gemini.js'))
  }

  for (const candidate of jsCandidates) {
    try {
      if (candidate && existsSync(candidate)) {
        return { command: process.execPath, prefixArgs: [candidate], useShell: false }
      }
    } catch {}
  }

  // Fallback: shim .cmd via shell (menos seguro, último recurso).
  return { command: 'gemini.cmd', prefixArgs: [], useShell: true }
}

function buildResearchPrompt({ prompt, task_type, user_language }) {
  return `
You are Gemini CLI assisting with a software project in read-only mode.

Operational rules:
1. Read-only: do not edit files, apply patches, make commits, or run destructive commands.
2. For bug tasks, identify likely causes and the files that should be inspected.
3. For research tasks, bring concise conclusions and mention sources/keywords consulted when available.
4. Write the report and briefing text in ${user_language}.
5. Respond in pure Markdown.
6. Start the answer with a compact JSON briefing between the markers below.

Required opening block:

<<<CLAUDE_BRIEFING_JSON>>>
{
  "mode": "research",
  "task_type": "${task_type}",
  "summary": ["max 5 concise bullets"],
  "key_findings": ["max 8 concise bullets"],
  "files_to_inspect": ["relative/path.ext"],
  "files_changed": [],
  "likely_causes": [
    {
      "cause": "short cause",
      "evidence": "short evidence",
      "confidence": "low | medium | high"
    }
  ],
  "research_notes": ["max 5 bullets when applicable"],
  "risks": ["max 5 bullets"],
  "next_action_for_claude": "one clear next action",
  "confidence": "low | medium | high"
}
<<<END_CLAUDE_BRIEFING_JSON>>>

After the JSON block, write the complete detailed report in Markdown.

User task:
${prompt}
`.trim()
}

function buildDevelopmentPrompt({ prompt, task_type, user_language }) {
  return `
You are Gemini CLI assisting with a software project. You may implement the requested task.

Operational rules:
1. You may create and edit files strictly needed for this task.
2. Keep changes scoped to the task. Do not refactor or touch unrelated code.
3. Do not run destructive commands (no rm -rf, no DB drops, no force operations).
4. Do not make commits or push unless explicitly asked.
5. Do not create or modify secrets / .env values.
6. Prefer simple, readable solutions over clever ones.
7. Add basic tests and update docs only when relevant to the task.
8. Write the report and briefing text in ${user_language}.
9. Respond in pure Markdown.
10. Start the answer with a compact JSON briefing between the markers below, listing every file you created or modified.

Required opening block:

<<<CLAUDE_BRIEFING_JSON>>>
{
  "mode": "development",
  "task_type": "${task_type}",
  "summary": ["max 5 concise bullets describing what you implemented"],
  "key_findings": ["max 8 concise bullets: decisions, assumptions, trade-offs"],
  "files_to_inspect": ["relative/path.ext that Claude should review first"],
  "files_changed": [
    {
      "path": "relative/path.ext",
      "action": "created | modified",
      "summary": "short description of the change"
    }
  ],
  "likely_causes": [],
  "research_notes": ["max 5 bullets when applicable"],
  "risks": ["max 5 bullets: things Claude must verify"],
  "next_action_for_claude": "one clear next action for review",
  "confidence": "low | medium | high"
}
<<<END_CLAUDE_BRIEFING_JSON>>>

After the JSON block, write a concise implementation report in Markdown (what changed and why).

User task:
${prompt}
`.trim()
}

function buildPrompt({
  prompt,
  task_type = 'analysis',
  mode = 'research',
  user_language = 'pt-BR'
}) {
  if (mode === 'development') {
    return buildDevelopmentPrompt({ prompt, task_type, user_language })
  }
  return buildResearchPrompt({ prompt, task_type, user_language })
}

function extractBriefing(output) {
  const match = output.match(
    /<<<CLAUDE_BRIEFING_JSON>>>\s*([\s\S]*?)\s*<<<END_CLAUDE_BRIEFING_JSON>>>/
  )
  if (!match) return null

  const raw = match[1].trim()

  try {
    return JSON.parse(raw)
  } catch {
    return {
      parse_error: true,
      raw: raw.slice(0, 2000)
    }
  }
}

const server = new Server(
  { name: 'gemini-bridge', version: '3.1.0' },
  { capabilities: { tools: {} } }
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'gemini_run',
      description: [
        'Delega tarefas ao Gemini CLI.',
        'mode=research (default): Gemini read-only para análise/pesquisa, approval_mode padrão plan.',
        'mode=development: Gemini pode criar/editar arquivos, approval_mode padrão auto_edit.',
        'Use output_file para relatórios longos; Claude recebe apenas briefing, metadados e preview.',
        'Use summary_file para salvar o briefing JSON separado.',
        'O diretório padrão vem de CLAUDE_PROJECT_DIR, com fallback para process.cwd().'
      ].join(' '),
      inputSchema: {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            description:
              'Tarefa para o Gemini. Pode referenciar arquivos e pastas relativos ao projeto.'
          },
          mode: {
            type: 'string',
            description:
              'Modo operacional: research (read-only, default) ou development (pode editar arquivos).'
          },
          task_type: {
            type: 'string',
            description:
              'Tipo da tarefa: analysis, research, bug_triage, architecture_review, docs, quick, feature, refactor, test.'
          },
          output_file: {
            type: 'string',
            description: 'Caminho relativo ao projeto para salvar o relatório completo.'
          },
          summary_file: {
            type: 'string',
            description: 'Caminho relativo ao projeto para salvar o briefing JSON.'
          },
          cwd: {
            type: 'string',
            description: 'Diretório de trabalho. Default: CLAUDE_PROJECT_DIR ou process.cwd().'
          },
          approval_mode: {
            type: 'string',
            description:
              'Modo do Gemini CLI: plan, default, auto_edit, yolo. Default: plan (research) / auto_edit (development). ' +
              'yolo só é permitido se ALLOW_GEMINI_YOLO=1 estiver no ambiente.'
          },
          timeout_ms: {
            type: 'number',
            description: 'Timeout da execução. Default: 300000.'
          },
          user_language: {
            type: 'string',
            description: 'Idioma final do usuário. Default: pt-BR.'
          },
          task_id: {
            type: 'string',
            description:
              'Identificador da tarefa para as métricas. Se omitido, é gerado automaticamente.'
          },
          project: {
            type: 'string',
            description: 'Nome do projeto para as métricas. Default: nome da pasta de trabalho.'
          },
          record_metrics: {
            type: 'boolean',
            description:
              'Grava métricas automaticamente em docs/gemini-output/_metrics/gemini-runs.jsonl. Default: true.'
          }
        },
        required: ['prompt']
      }
    },
    {
      name: 'gemini_cwd',
      description: 'Mostra o diretório de trabalho que o Gemini usará.',
      inputSchema: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  ]
}))

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params

  if (name === 'gemini_cwd') {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              cwd: getProjectDir(args.cwd),
              CLAUDE_PROJECT_DIR: process.env.CLAUDE_PROJECT_DIR || null
            },
            null,
            2
          )
        }
      ]
    }
  }

  if (name !== 'gemini_run') {
    throw new Error(`Ferramenta desconhecida: ${name}`)
  }

  const {
    prompt,
    task_type = 'analysis',
    mode = 'research',
    output_file,
    summary_file,
    cwd,
    approval_mode,
    timeout_ms = DEFAULT_TIMEOUT_MS,
    user_language = 'pt-BR',
    task_id,
    project,
    record_metrics = true
  } = args

  if (!prompt || typeof prompt !== 'string') {
    throw new Error('prompt é obrigatório')
  }

  if (mode !== 'research' && mode !== 'development') {
    throw new Error(`mode inválido: ${mode} (use research ou development)`)
  }

  const effectiveApprovalMode = approval_mode || (mode === 'development' ? 'auto_edit' : 'plan')

  if (!ALLOWED_APPROVAL_MODES.has(effectiveApprovalMode)) {
    throw new Error(`approval_mode inválido: ${effectiveApprovalMode}`)
  }

  if (effectiveApprovalMode === 'yolo' && !YOLO_ALLOWED) {
    throw new Error(
      'approval_mode "yolo" está desabilitado por segurança. ' +
        'Defina a variável de ambiente ALLOW_GEMINI_YOLO=1 para habilitá-lo.'
    )
  }

  const workDir = getProjectDir(cwd)
  const finalPrompt = buildPrompt({ prompt, task_type, mode, user_language })

  const startedAt = new Date()
  const finalTaskId = task_id || makeTaskId(mode, task_type, startedAt)
  const projectName = project || basename(resolve(workDir))

  // Snapshot do git ANTES da execucao (evidencia real de mudancas).
  const gitBefore = await gitPorcelain(workDir)

  let output
  try {
    output = await runGemini(finalPrompt, workDir, effectiveApprovalMode, timeout_ms)
  } catch (err) {
    const finishedAt = new Date()
    let metricsPath = null
    if (record_metrics) {
      metricsPath = await recordMetrics(workDir, {
        task_id: finalTaskId,
        project: projectName,
        task_type,
        mode,
        approval_mode: effectiveApprovalMode,
        status: 'failed',
        started_at: startedAt.toISOString(),
        finished_at: finishedAt.toISOString(),
        duration_seconds: Math.round((finishedAt - startedAt) / 1000),
        files_created: [],
        files_modified: [],
        review_required: true,
        unsafe_case: false,
        error: String(err.message).slice(0, 500)
      })
    }
    return {
      content: [
        {
          type: 'text',
          text: `[gemini-bridge ERROR] ${err.message}${metricsPath ? `\n[metrics] registrado em ${metricsPath}` : ''}`
        }
      ],
      isError: true
    }
  }

  const briefing = extractBriefing(output)

  let outputAbsPath = null
  let summaryAbsPath = null

  if (output_file) {
    outputAbsPath = ensurePathInsideRoot(workDir, output_file)
    await mkdir(dirname(outputAbsPath), { recursive: true })
    await writeFile(outputAbsPath, output, 'utf8')
  }

  if (summary_file && briefing) {
    summaryAbsPath = ensurePathInsideRoot(workDir, summary_file)
    await mkdir(dirname(summaryAbsPath), { recursive: true })
    await writeFile(summaryAbsPath, JSON.stringify(briefing, null, 2), 'utf8')
  }

  const finishedAt = new Date()
  const durationSeconds = Math.round((finishedAt - startedAt) / 1000)

  // Evidencia real de mudancas via git (preferida); briefing do Gemini como complemento.
  const gitAfter = await gitPorcelain(workDir)
  const gitChanges = diffPorcelain(gitBefore, gitAfter)
  const gitAvailable = gitAfter !== null
  const gitDiff = gitAvailable ? await gitDiffEvidence(workDir) : { name_only: [], stat: null }

  const declared = deriveChangedFiles(briefing)
  const filesCreated = uniq([...gitChanges.created, ...declared.created])
  const filesModified = uniq([...gitChanges.modified, ...declared.modified])
  const filesDeleted = uniq(gitChanges.deleted)
  const status = briefing && !briefing.parse_error ? 'success' : 'partial'

  const gitEvidence = {
    available: gitAvailable,
    created: gitChanges.created,
    modified: gitChanges.modified,
    deleted: gitChanges.deleted,
    diff_name_only: gitDiff.name_only,
    diff_stat: gitDiff.stat
  }

  let metricsPath = null
  if (record_metrics) {
    metricsPath = await recordMetrics(workDir, {
      task_id: finalTaskId,
      project: projectName,
      task_type,
      mode,
      approval_mode: effectiveApprovalMode,
      status,
      started_at: startedAt.toISOString(),
      finished_at: finishedAt.toISOString(),
      duration_seconds: durationSeconds,
      files_created: filesCreated,
      files_modified: filesModified,
      files_deleted: filesDeleted,
      files_declared_by_gemini: {
        created: declared.created,
        modified: declared.modified
      },
      git_evidence: gitEvidence,
      review_required: true,
      output_file: output_file || null,
      summary_file: summary_file || null,
      confidence: briefing?.confidence || null,
      total_chars: output.length,
      unsafe_case: false
    })
  }

  const envelope = {
    ok: true,
    task_id: finalTaskId,
    mode,
    task_type,
    cwd: workDir,
    approval_mode: effectiveApprovalMode,
    status,
    duration_seconds: durationSeconds,
    output_file: outputAbsPath,
    summary_file: summaryAbsPath,
    metrics_file: metricsPath,
    total_chars: output.length,
    files_created: filesCreated,
    files_modified: filesModified,
    files_deleted: filesDeleted,
    git_evidence: gitEvidence,
    briefing,
    preview: output.slice(0, PREVIEW_CAP)
  }

  if (output_file) {
    return {
      content: [{ type: 'text', text: JSON.stringify(envelope, null, 2) }]
    }
  }

  const safe =
    output.length > INLINE_CAP
      ? output.slice(0, INLINE_CAP) +
        `\n\n...[${output.length - INLINE_CAP} chars omitidos — use output_file]`
      : output

  return {
    content: [{ type: 'text', text: safe }]
  }
})

function runGemini(prompt, cwd, approvalMode, timeoutMs) {
  return new Promise((resolvePromise, reject) => {
    const { command, prefixArgs, useShell } = resolveGeminiInvocation()
    const geminiArgs = [...prefixArgs, '-p', prompt, '--approval-mode', approvalMode]

    const child = spawn(command, geminiArgs, {
      cwd,
      env: { ...process.env },
      shell: useShell,
      windowsHide: true
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (d) => {
      stdout += d.toString()
    })
    child.stderr.on('data', (d) => {
      stderr += d.toString()
    })

    const timer = setTimeout(() => {
      child.kill()
      reject(new Error(`Timeout após ${Math.round(timeoutMs / 1000)}s`))
    }, timeoutMs)

    child.on('close', (code) => {
      clearTimeout(timer)

      const cleanStdout = stripAnsi(stdout)
      const cleanStderr = stripAnsi(stderr)

      if (code !== 0 && !cleanStdout.trim()) {
        reject(new Error(`Gemini saiu com código ${code}: ${cleanStderr.slice(0, 1000)}`))
        return
      }

      resolvePromise(cleanStdout || cleanStderr)
    })

    child.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
  })
}

const transport = new StdioServerTransport()
await server.connect(transport)
