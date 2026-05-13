#!/usr/bin/env node
// SPDX-FileCopyrightText: Copyright (c) 2026, NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

const uiRoot = path.resolve(__dirname, '..')
const defaultOutputPath = path.join(uiRoot, 'docs', 'research-ui-state-matrix.md')

const sourceFiles = {
  capabilityMatrix: 'src/features/jobs/state/capability-matrix.ts',
  researchUiState: 'src/features/jobs/state/research-ui-state.ts',
}

const conditionColumns = [
  ['Selected Job', 'selectedJob'],
  ['Job Status', 'jobStatus'],
  ['Report', 'reportAvailability'],
  ['Connection', 'globalConnection'],
  ['Auth', 'authState'],
  ['Data Sources', 'dataSourceState'],
  ['Upload', 'uploadState'],
  ['Request', 'activeRequestState'],
]

const capabilityColumns = [
  ['Prompt', 'prompt'],
  ['File Upload', 'fileUpload'],
  ['Data Sources', 'dataSources'],
  ['Cancel', 'cancelJob'],
  ['Retry', 'retryJob'],
  ['Fetch Report', 'fetchReport'],
  ['Talk To Report', 'talkToReport'],
]

const scenarioChecklist = [
  [
    'Anonymous user',
    'auth-anonymous',
    'All interactive research controls are disabled and recovery points to sign-in.',
    'Confirm no component keeps its own auth-only exception.',
  ],
  [
    'Prompt submitting',
    'request-in-progress',
    'Prompt, file upload, and data source edits lock while the HTTP submit is active.',
    'Confirm state is scoped to the originating conversation/job.',
  ],
  [
    'Deep report running',
    'selected-running-job',
    'Prompt is paused, stop is enabled, source/file edits are disabled, and status shows active work.',
    'Confirm concurrent jobs only affect the selected job view.',
  ],
  [
    'Heartbeat stale',
    'selected-stale-job',
    'Prompt remains locked, stop/retry are available, and a warning banner can surface recovery.',
    'Confirm stale does not silently look idle.',
  ],
  [
    'Completed report',
    'selected-completed-report',
    'Prompt stays locked until talk-to-report exists, report fetch is enabled, and job label is complete.',
    'Confirm future conversation behavior changes in the matrix first.',
  ],
  [
    'Failed report',
    'selected-failed-job',
    'Prompt stays locked, retry is enabled, report fetch is disabled, and an error banner is available.',
    'Confirm failed jobs never render as normal chat messages only.',
  ],
  [
    'Expired report',
    'selected-expired-job',
    'Prompt stays locked, report fetch is disabled, and recovery selects another job/session.',
    'Confirm retention/expiry copy is visible near the report surface.',
  ],
  [
    'Data source outage',
    'data-source-failed, data-source-unavailable',
    'Data source edits are disabled without blocking unrelated prompt readiness unless the active row says so.',
    'Confirm data source problems are visible but not confused with backend job failure.',
  ],
]

const escapeCell = (value) =>
  String(value ?? 'any')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, '<br>')

const markdownTable = (headers, rows) => {
  const header = `| ${headers.map(escapeCell).join(' | ')} |`
  const divider = `| ${headers.map(() => '---').join(' | ')} |`
  const body = rows.map((row) => `| ${row.map(escapeCell).join(' | ')} |`)
  return [header, divider, ...body].join('\n')
}

const formatCapability = (capability) => {
  if (!capability) return 'not modeled'
  if (capability.enabled) return 'enabled'
  return capability.reason ? `disabled: ${capability.reason}` : 'disabled'
}

const formatEnabled = (enabled, reason) => {
  if (enabled) return 'enabled'
  return reason ? `disabled: ${reason}` : 'disabled'
}

const formatStopControl = (state) => {
  if (state.stopResearch.enabled) return 'enabled'
  return state.stopResearch.title
}

const formatBanner = (banner) => {
  if (!banner || banner.severity === 'none') return 'none'
  return banner.category ? `${banner.severity}: ${banner.category}` : banner.severity
}

const initialStatusForRow = (row) => {
  switch (row.match.jobStatus) {
    case 'running':
      return 'researching'
    case 'success':
      return 'complete'
    case 'failure':
      return 'error'
    default:
      return null
  }
}

const selectedJobStatusForRow = (row) => {
  const status = row.match.jobStatus
  return status && status !== 'none' ? status : undefined
}

const isAuthenticatedForRow = (row) => {
  const authState = row.match.authState
  return authState !== 'anonymous' && authState !== 'expired' && authState !== 'insufficient_scope'
}

const projectUiStateForRow = (row, deriveResearchUiState) =>
  deriveResearchUiState({
    capabilities: row.capabilities,
    isAuthenticated: isAuthenticatedForRow(row),
    isCurrentSessionBusy: false,
    isSubmitLoading: row.match.activeRequestState === 'submitting',
    selectedJobStatus: selectedJobStatusForRow(row),
    currentStatus: initialStatusForRow(row),
    todos: [],
    toolCalls: [],
    defaultPromptPlaceholder: 'Ask a research question...',
    hasStopHandler: true,
    knowledgeLayerAvailable: true,
  })

const loadPureTypescriptModule = (relativePath) => {
  const absolutePath = path.join(uiRoot, relativePath)
  const source = fs.readFileSync(absolutePath, 'utf8')
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: absolutePath,
  }).outputText
  const module = { exports: {} }
  const context = {
    exports: module.exports,
    module,
    require: (specifier) => {
      throw new Error(
        `State matrix doc generator can only load type-only modules. Unexpected runtime import: ${specifier}`
      )
    },
  }

  vm.runInNewContext(compiled, context, { filename: absolutePath })
  return module.exports
}

const loadStateMatrix = () => {
  const matrixModule = loadPureTypescriptModule(sourceFiles.capabilityMatrix)
  const uiStateModule = loadPureTypescriptModule(sourceFiles.researchUiState)

  return {
    rows: matrixModule.capabilityMatrixRows,
    deriveResearchUiState: uiStateModule.deriveResearchUiState,
  }
}

const buildConditionsTable = (rows) =>
  markdownTable(
    ['Row', ...conditionColumns.map(([label]) => label)],
    rows.map((row) => [
      row.id,
      ...conditionColumns.map(([, key]) => row.match[key] ?? 'any'),
    ])
  )

const buildCapabilitiesTable = (rows) =>
  markdownTable(
    ['Row', ...capabilityColumns.map(([label]) => label), 'Job Label', 'Selectable'],
    rows.map((row) => [
      row.id,
      ...capabilityColumns.map(([, key]) => formatCapability(row.capabilities[key])),
      row.capabilities.jobCard.statusLabel,
      row.capabilities.jobCard.selectable ? 'yes' : 'no',
    ])
  )

const buildPromptProjectionTable = ({ rows, deriveResearchUiState }) =>
  markdownTable(
    ['Row', 'Status Strip', 'Icon', 'Prompt', 'Placeholder', 'Send Mode', 'Stop'],
    rows.map((row) => {
      const state = projectUiStateForRow(row, deriveResearchUiState)
      return [
        row.id,
        state.statusStrip.text,
        state.statusStrip.icon,
        formatEnabled(!state.prompt.disabled, state.prompt.disabledReason),
        state.prompt.placeholder,
        state.prompt.sendControl,
        formatStopControl(state),
      ]
    })
  )

const buildSidePanelProjectionTable = ({ rows, deriveResearchUiState }) =>
  markdownTable(
    ['Row', 'Source Counter', 'File Counter', 'Banner', 'Recovery', 'Job Card'],
    rows.map((row) => {
      const state = projectUiStateForRow(row, deriveResearchUiState)
      return [
        row.id,
        state.sourceCounter.enabled ? 'enabled' : 'disabled',
        state.fileCounter.enabled ? 'enabled' : 'disabled',
        formatBanner(state.banner),
        state.banner.recoveryAction,
        `${row.capabilities.jobCard.statusLabel} / ${
          row.capabilities.jobCard.selectable ? 'selectable' : 'not selectable'
        }`,
      ]
    })
  )

const buildScenarioChecklistTable = () =>
  markdownTable(
    ['Scenario', 'Primary Row(s)', 'Expected Behavior', 'Review Focus'],
    scenarioChecklist
  )

const buildStateMatrixMarkdown = ({ rows, deriveResearchUiState }) => `${[
  '# Research UI State Matrix',
  '',
  '<!-- Generated by `node scripts/generate-state-matrix-doc.cjs`. Do not edit generated tables by hand. -->',
  '',
  'This document renders the runtime research UI state matrix into reviewable tables. The TypeScript matrix remains the source of truth; this Markdown is for PR review, agent orientation, and debugging long-running workflow edge cases.',
  '',
  '## When To Use This',
  '',
  '- Use `src/features/jobs/state/capability-matrix.ts` and `research-ui-state.ts` in runtime code.',
  '- Use this document to review expected behavior, discuss edge cases, and orient future agentic changes.',
  '- When behavior changes, update the matrix/tests first, then regenerate this file.',
  '',
  '## Update Process',
  '',
  '1. Update `src/features/jobs/state/capability-matrix.ts` for canonical capability changes.',
  '2. Update `src/features/jobs/state/research-ui-state.ts` when component-facing state, copy, icons, or banners need to change.',
  '3. Add or update focused tests in `src/features/jobs/state/*.spec.ts` before changing behavior.',
  '4. Regenerate this document with `npm run docs:state-matrix`.',
  '5. Verify the generated document is current with `npm run docs:state-matrix:check`.',
  '',
  'The local UI CI flow runs the freshness check so code and generated Markdown do not silently drift apart.',
  '',
  '## Canonical Matrix Conditions',
  '',
  buildConditionsTable(rows),
  '',
  '## Capability Outputs',
  '',
  buildCapabilitiesTable(rows),
  '',
  '## Prompt Bar Projection',
  '',
  'This table shows the prompt-area behavior derived from each canonical row through `deriveResearchUiState`.',
  '',
  buildPromptProjectionTable({ rows, deriveResearchUiState }),
  '',
  '## Side Panel Projection',
  '',
  'This table summarizes matrix outputs used by the data/files controls, session job cards, and global banner surface.',
  '',
  buildSidePanelProjectionTable({ rows, deriveResearchUiState }),
  '',
  '## Scenario Review Checklist',
  '',
  'This checklist is intentionally small and human-maintained. It highlights the flows most likely to break in long-running or concurrent agentic workflows.',
  '',
  buildScenarioChecklistTable(),
].join('\n')}\n`

const parseArgs = (argv) => {
  const options = {
    check: false,
    outputPath: defaultOutputPath,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--check') {
      options.check = true
    } else if (arg === '--output') {
      const outputPath = argv[index + 1]
      if (!outputPath) {
        throw new Error('--output requires a path')
      }
      options.outputPath = path.resolve(process.cwd(), outputPath)
      index += 1
    } else {
      throw new Error(`Unknown option: ${arg}`)
    }
  }

  return options
}

const writeOrCheckDocument = ({ check, outputPath }) => {
  const markdown = buildStateMatrixMarkdown(loadStateMatrix())

  if (check) {
    const existing = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, 'utf8') : ''
    if (existing !== markdown) {
      throw new Error(`${path.relative(process.cwd(), outputPath)} is out of date`)
    }
    return outputPath
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(outputPath, markdown)
  return outputPath
}

if (require.main === module) {
  try {
    const outputPath = writeOrCheckDocument(parseArgs(process.argv.slice(2)))
    console.log(`State matrix documentation ${process.argv.includes('--check') ? 'checked' : 'written'}: ${outputPath}`)
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  }
}

module.exports = {
  buildStateMatrixMarkdown,
  loadStateMatrix,
  writeOrCheckDocument,
}
