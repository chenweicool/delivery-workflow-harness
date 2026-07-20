# Delivery Workflow Project Summary

## Current State

Delivery Workflow has evolved from a local workflow prototype into a command-driven delivery harness skeleton.

Current priority status:

- P0: completed.
- P1: minimum viable version completed.
- P2: minimum viable version completed.
- P3: not started.
- P4: not started.

## Product Positioning

Delivery Workflow is a local delivery harness, not an AI IDE.

It provides:

- workflow runtime
- local console
- CLI commands
- workspace skeleton
- checkpoint and progress tracking
- handoff contract for AI tools
- hot-pluggable team capabilities

AI IDEs and CLI agents such as Codex, Claude Code, Windsurf, and Cursor remain responsible for multi-turn coding and document revision.

Delivery Workflow is responsible for:

- assembling context
- defining stage boundaries
- controlling checkpoint entry and exit
- showing final artifacts
- preserving delivery evidence
- guiding users back from AI tools to the delivery page

## Completed Scope

### 2026-07-19: v1 Whitepaper Delivery Loop

- Added a hot-pluggable whitepaper Git root to global configuration.
- Added PRD-first function-point matching and confirmation, then persisted the
  resolved whitepaper revision, risks, applications, and capability selection
  to the workspace lock/context files.
- Added local-code-first application resolution and explicit remote Git cache
  fetch. The runtime never auto-clones, pulls, overwrites, or changes branches.
- Added whitepaper-selected capability routing and passed financial risk tags
  into Test and independent Review handoffs.
- Added `.workflow/quality-summary.json` to consolidate review, risk, and test
  evidence with P0-P3 severity state.
- Added archive knowledge proposals: `archive/knowledge-update-proposal.json`
  and `archive/knowledge-patch.md`. They are review-only; Knowledge Owners use
  normal Git/GitLab review to update the whitepaper repository.
- Added CLI commands: `dw function match`, `dw context resolve`, `dw app fetch`,
  and `dw archive propose`.
- Added whitepaper catalog and archive-proposal API regression coverage.

### P0: AI CLI Return Loop

- Added `delivery-workflow open --workspace <path> --step <step-id>`.
- Added URL routing for `?workspace=...&step=...`.
- Enhanced AI handoff instructions.
- Added `.workflow/handoff/done.json` as the AI completion marker.
- The console detects `done.json`.
- The console shows an AI working / ready-for-review panel.
- Added manual refresh review action.
- Added action to enter the review step after AI completion.

The intended loop is:

```text
Console creates handoff
  -> Codex / Claude handles multi-turn work
  -> AI writes artifacts
  -> AI writes .workflow/handoff/done.json
  -> AI runs delivery-workflow open
  -> Console returns to the review/checkpoint step
```

### P1: Product Skeleton

- Added npm-compatible package skeleton under `delivery-workflow/`.
- Added CLI entry `bin/delivery-workflow.js`.
- Added commands:
  - `delivery-workflow start`
  - `delivery-workflow setup`
  - `delivery-workflow doctor`
  - `delivery-workflow init <demand-name>`
  - `delivery-workflow open`
- Refactored the local server so it can be run directly or started by the CLI.
- CLI mode stores local config in the user directory.
- Source mode still uses `console/.data`.
- Added team config example.
- Added capability schema example.
- Enhanced `doctor` to check local tools and team config references.

### P2: Console Usability

- Kept homepage lighter.
- Folded advanced panels by default.
- Kept next-step recommendation visible.
- Added current-step assembled capability display.
- Added semantic artifact shortcuts.
- Kept AI interaction outside the page while making return-to-console explicit.

### 2026-06-30 Trial Pain Point Improvements

- Added CLI commands:
  - `delivery-workflow config`
  - `delivery-workflow status`
  - `delivery-workflow next`
  - `delivery-workflow handoff`
  - `delivery-workflow done`
- Changed the AI return contract so AI tools can run `delivery-workflow done` instead of hand-writing `.workflow/handoff/done.json`.
- Added team capability metadata support through `capabilities`, while keeping existing `skills` and `rules` compatible.
- Added step-aware capability routing with `appliesToSteps` and `capabilityTypes`.
- Made the next-step panel more obvious: status, step id, blocker count, and manual-confirmation action text.
- Changed requirement and technical confirmation guidance to table-based human review.
- Changed task confirmation to a table and made execution opt-in; tasks are not treated as approved by default.
- Added a 06 implementation gate: a task must be explicitly marked as allowed in `tasks/task-confirmation.md` before AI implementation can start.
- Added local file/directory pickers for workspace creation, existing workspace selection, local tools, team config roots, repo roots, skills, rules, app paths, and knowledge paths.

### 2026-06-30 Configuration UX Finding

The current picker work is a useful access improvement, but it is still a transitional design.

What improved:

- Users no longer need to manually type most local paths.
- Single-path fields can use file or directory pickers.
- Multi-line path fields can append selected files or directories.
- Candidate apps and knowledge paths can be appended with `name=path` style entries.

Remaining problem:

- The configuration area is still too form-heavy.
- New users must understand too many concepts at once: local tools, team config, profile, app index, skills, rules, knowledge, app paths, and per-demand overrides.
- Adding more pickers reduces typing cost but does not solve the mental-model cost.
- Some fields should not be free-form path text in the long term. They should be selected from resolved team-config/app-index/capability metadata.

Next UX direction:

- Split configuration into a first-run setup wizard and a per-demand setup wizard.
- Keep local machine settings separate from demand-specific context.
- Let team-config expose selectable capabilities, apps, templates, and knowledge entries.
- Let users choose candidate apps from `app-index` instead of typing paths.
- Let users choose skills/rules from a capability list instead of editing raw path lists.
- Keep raw path/text override fields under an advanced section only.
- Add validation badges next to each configured item: exists, missing, inherited, local override, or disabled for current step.
- Provide a clear "ready to start" state after setup, with the next workflow action highlighted.

### 2026-07-01 Console and Global Configuration Direction

The console should now move from "workspace-first form page" to "central delivery cockpit".

Confirmed product direction:

- The left side should always show discovered workspaces.
- Selecting a workspace should switch the main area into that workspace's delivery flow.
- The homepage should act as a central console, not as a long configuration form.
- Global configuration should be configured once and inherited by new workspaces.
- Workspace configuration should only contain demand-specific overrides.
- Profile remains an internal/team-config concept. Ordinary users should see "team capability library" or "capability scheme", not "profile".

Configuration layers:

```text
Global config
  local tools
  workspace root
  team capability library
  business repo root
  app index
  common knowledge
  integrations

Workspace config
  demand name
  selected apps
  PRD/materials
  local knowledge overrides
  per-demand extra skills/rules
  branch/release notes

Single AI handoff
  current step
  task id
  assembled context
  routed capabilities
  return contract
```

Global configuration must stay extensible and loosely coupled. The persisted model now has an open `integrations` object so later capabilities can add Feishu, internal Dev platform, archive platform, database metadata, quality service, or release platform settings without changing the core workspace model.

Current implementation step:

- Added a persistent left workspace sidebar.
- Added a global configuration status block.
- Added `workspaceRoot` as a global config field.
- Added an open `integrations` object for future pluggable integrations.
- Moved the team profile field into an advanced "capability scheme" section.
- Reduced default console text density. The main screen now prioritizes workspace, next action, flow position, status, and artifact actions; explanatory copy should live in expanded or advanced areas.
- Simplified the workbench hierarchy further: AI handoff is a compact action row, capability diagnostics/template tools are hidden by default, and empty preview panels do not occupy the main page.
- Moved global configuration into a modal-style configuration center. The main workspace page should not expose a separate "delivery config" surface by default.
- Added the first version of globally discovered candidate apps: workspaces can select apps from team `app-index` and the globally configured business repo root instead of typing every path manually.
- Simplified the global configuration center boundary: it now exposes global access sources only. Demand-specific fields such as selected apps, extra knowledge, extra skills/rules, delivery notes, and branch naming should live in the selected workspace flow, not in global setup.

Next UX target:

- Replace the remaining raw global form with a first-run setup wizard.
- Replace raw skills/rules path fields with capability selection from team-config metadata.
- Replace manually typed app paths with app-index selection.
- Add extension cards for integrations such as Feishu, internal Dev platform, database, archive target, and quality gate.
- Keep raw JSON/path override fields under advanced settings only.

### 2026-07-01 Global Configuration Boundary

The global configuration center should answer one question: "What capabilities can this machine and team provide to any workspace?"

It should contain:

- local AI tools and IDE paths
- default workspace root
- team capability library root
- application index JSON
- business code root
- discovered application index
- common skills/rules/templates through team capability metadata
- extension integration config such as Feishu, Dev platform, database, archive, quality gate, and release platform

It should not contain:

- branch naming for a specific demand
- selected apps for a specific demand
- per-demand knowledge paths
- per-demand extra skills/rules
- one-off delivery notes

Those fields belong to the selected workspace context and should be introduced near the step that needs them.

Application index should be maintained as JSON when possible. The UI now supports an explicit `appIndexPath`; runtime resolution order is:

1. configured `appIndexPath`
2. `teamConfigRoot/apps/app-index.json`
3. `teamConfigRoot/app-index.json`
4. shallow directory discovery under `repoRoot`

Recommended `app-index.json` shape:

```json
{
  "apps": [
    {
      "name": "settlement-service",
      "repoKey": "settlement-service",
      "sourcePath": "settlement/settlement-service",
      "type": "java-backend",
      "role": "settlement domain service",
      "baseBranch": "master"
    }
  ]
}
```

`sourcePath` may be absolute, or relative to the configured business code root. Skills such as Word PRD to Markdown should be maintained in the team capability library, not added manually in the global configuration UI.

### 2026-07-01 Stage Cockpit Direction

The workspace page should be organized around business delivery stages, not raw internal steps.

Current UI direction:

- Hide `Workspace 准备` from the top flow because it is system initialization, not a business delivery stage.
- Show only business stages in the top flow:
  - PRD 到技术方案
  - 技术方案到代码实现
  - 质量检查
  - 上线准备与归档
- Replace the separate "next step" and "handoff AI" blocks with one current-stage action card.
- Move stage materials into a modal so PRD sources, technical design inputs, stage inputs, and outputs do not occupy the main page.
- Keep internal step cards out of the default main page. They remain execution details for command routing and can later return as a checklist or timeline.

For the PRD stage, the user-facing model should be one AI work package:

```text
Import PRD
  -> AI converts PRD to Markdown
  -> AI loads application/team context
  -> AI clarifies requirements
  -> Human confirms requirement scope
  -> Continue to technical design
```

The page should expose start, handoff, materials, and review actions. Codex or Claude Code should handle the multi-turn reasoning inside the AI tool.

### 2026-07-02 AI Prompt Boundary

The current design treats prompts as a layered contract, not as one large editable text area.

Layers:

- Harness built-in rules: workflow boundaries, allowed read/write scope, manual checkpoints, progress updates, and required file writeback. These are platform-owned and should not be edited by ordinary users.
- Team capabilities: rules, skills, templates, knowledge, and app-index from the team capability library. These are hot-pluggable and can enhance a step, but they cannot expand the step beyond its allowed scope.
- User supplements: PRD materials, business context, technical positioning input, and manual confirmation results. These should enter workspace artifacts instead of modifying system workflow definitions.

For the PRD stage, the user-facing interaction remains simple:

```text
Supplement PRD
  -> hand off to Codex / Claude
  -> AI writes prd/document.md, design/context-summary.md, design/requirement-confirmation.md
  -> user reviews and confirms requirement scope
  -> only then generate technical design
```

Prompt optimization principle:

- Do not embed a full chat into the console in the short term.
- Keep multi-turn discussion in Codex / Claude.
- Make the console show the stage handoff prompt, expected writeback files, and checkpoint state clearly.
- Chat conclusions are not delivery evidence until they are written back to workspace artifacts.

### 2026-07-02 Role Agent Direction

Delivery Workflow should expose role Agents as the main user model. Codex, Claude Code, and future multiple Claude Code instances are executors behind those Agents.

Initial role contracts:

- Requirement Analysis Agent: writes `prd/document.md`, `design/context-summary.md`, and `design/requirement-confirmation.md`.
- Technical Design Agent: writes `design/technical-design.md`, `design/technical-confirmation.md`, and `design/technical-design.changelog.md`.
- Coding Implementation Agent: writes `tasks/task-progress.md`, `review/change-log.md`, and `review/self-check.md`.
- Review Agent: writes `review/ai-review.md` and `review/risk-list.md`.
- Test Agent: writes `review/unit-test-plan.md` and `review/unit-test-result.md`.
- Archive Agent: writes `delivery/release-checklist.md`, `delivery/delivery-summary.md`, and `archive/knowledge-card.md`.

Both session modes should be supported:

- continuous session for context continuity
- role session for cleaner responsibility boundaries

The invariant is that Agent-to-Agent handoff uses structured workspace artifacts, not chat memory.

### 2026-07-02 Demand Context Entry

The console must not hide per-demand context while simplifying the homepage.

Restored the demand-context entry into the stage materials modal:

- PRD source files and external document links.
- Candidate applications selected from the global app index or added by local directory.
- Per-demand notes, background knowledge, extra skills, and extra rules.
- Branch naming rule for the current demand.
- Optional "load application context during requirement clarification".
- Technical positioning input through `design/known-facts.md`.

This keeps the main page simple while preserving the information users need before handing a role Agent to Codex / Claude.

The technical positioning input should stay natural-language-first. Users should not be asked to fill technical design tables. The UI now treats it as optional "technical clues"; if needed, the Agent converts those notes into structured tables inside the technical design artifacts.

Candidate application selection should be index-first. The business code root is only used to resolve relative paths from `app-index.json`, not to expose every folder under the root as an application. In the demand context modal, applications are now selected from a dropdown and displayed as removable tags; manual directory picking remains only as a one-off fallback for the current workspace.

For the current version, `app-index.json` and integration JSON are advanced configuration only. The common path should not require users to understand a fixed JSON schema. Later, the team can standardize an application index map and integration schemas for operations platform URL, personal platform tokens, database metadata, release platform, and other connectors.

The first-run global status now only checks fields users need in the common path: workspace root, team capability library, and local AI tools. Team profile and application index are internal/advanced concepts and should not appear as blocking setup items.

### 2026-07-02 CLI Alias And Daemon Mode

The npm package now exposes both command names:

- `delivery-workflow`: full descriptive command.
- `dw`: short daily command.

`dw start` starts the local console in daemon mode by default and keeps it running after the terminal closes. `dw start --foreground` is kept for development and debugging.

New server lifecycle commands:

- `dw start`
- `dw stop`
- `dw restart`
- `dw status`
- `dw logs`

Workspace commands continue to share the same runtime:

- `dw init`
- `dw next`
- `dw handoff`
- `dw done`
- `dw open`

The page and CLI are two entry points for the same local runtime:

- The page is the delivery cockpit. It is used for workspace selection, current stage overview, material review, checkpoint confirmation, and artifact inspection.
- The CLI is the fast path. It is used to start or stop the local service, reopen the page, initialize workspaces, hand off context to AI tools, and return from Codex / Claude Code.
- `dw done` is the standard AI-to-page return command. It records completion metadata and lets the console detect that structured artifacts are ready for review.
- `dw open` is the standard "bring the page back" command after AI work.
- Future executor launch commands should package workspace, Agent role, selected applications, required output files, and return command together before opening Codex / Claude Code.

Added `docs/quick-start.md` as the trial guide for new users. It covers install, background startup, first-time setup, workspace creation, Agent handoff, `dw done`, `dw open`, and the current Git/context-aware launch roadmap.

## Public npm Readiness

The npm package boundary is now `delivery-workflow/`.

Recommended publish flow:

```bash
cd delivery-workflow
npm login
npm whoami
npm run check
npm pack --dry-run
npm publish
```

Published public package:

```json
"name": "delivery-workflow-harness"
```

Current published version:

```text
0.1.0
```

Current status: published to the public npm registry. Package metadata, README, CLI help, package contents, and tarball install smoke have been checked.

Current local beta candidate:

```text
0.2.0-beta.0
```

The local `0.2.0-beta.0` candidate focuses on the first real-trial pain points: command-line return loop, global config visibility, team capability routing, clearer next-step/blocker prompts, structured confirmation documents, task execution gating, role-Agent handoff, simplified demand context, and `dw` daemon commands.

Pre-publish cleanup completed:

- Internal context files are not included in the package.
- Internal discussion docs are not included in the package.
- Example app names are generic.
- The package README is public-safe.
- `npm pack --dry-run` package contents were checked.
- Tarball install smoke passed with `npx delivery-workflow help`.

Post-publish install smoke:

```bash
npx delivery-workflow-harness start
```

The command can install the published package and start the local console.

## npm Version Iteration

Published npm versions are immutable. `0.1.0` cannot be overwritten, so every future release must bump `package.json` version before publishing.

Recommended release flow:

```bash
cd delivery-workflow
npm run check
npm version patch
npm publish
```

Version bump guidance:

- `patch`: bug fixes, copy changes, small UI or CLI adjustments, for example `0.1.0` -> `0.1.1`.
- `minor`: compatible new capabilities, for example homepage simplification, handoff loop improvements, team-config plug-in features, `0.1.0` -> `0.2.0`.
- `major`: breaking command, config, workspace, or package behavior changes, or the first stable product release, for example `0.x` -> `1.0.0`.

For experimental releases before making them the default:

```bash
npm version prerelease --preid beta
npm publish --tag beta
```

Users can try beta builds with:

```bash
npx delivery-workflow-harness@beta start
```

## Next Work

### P2.1 Architecture Split And Product Model Guardrails

The next stage has been split into three directions:

1. Architecture split with no intended behavior changes.
2. Product model solidification around Harness, role Agents, handoff contracts, checkpoints, and structured delivery evidence.
3. Product experience optimization after the runtime boundaries are clearer.

The core product invariant remains unchanged: Delivery Workflow is a delivery quality Harness, not an AI IDE. It packages bounded work and context for Codex, Claude Code, or future executors, while the console owns stage boundaries, checkpoint evidence, artifact review, and the return loop through `dw done` and `dw open`.

The detailed task breakdown is maintained in `docs/next-stage-task-breakdown.md`.

Architecture split progress on 2026-07-13:

- Server and runtime responsibilities have been extracted into focused modules for HTTP/Git/filesystem helpers, persisted state, workspace files/status/runtime, workflow progress, checkpoints, capability routing, run storage, and Agent sessions, prompts, handoff, launching, execution, runner lifecycle, and AI adjustment.
- Frontend modules now include `api.js`, `format.js`, `app-state.js`, `app-config.js`, `app-runs.js`, `app-checkpoint.js`, `app-artifacts.js`, and `app-workspace.js`.
- `console/public/app.js` has been reduced from 4166 lines to 2783 lines. It still owns the remaining workflow rendering and Agent-facing integration, which is the next extraction target.
- `scripts/regression-api.js` starts the real local server and verifies workspace initialization, workspace config, workflow definition, Agent handoff, static frontend module delivery, simulated Agent execution, run list, and run log retrieval.
- The existing CLI and console contracts remain unchanged. `npm run check` and `npm run test:regression` pass, with the latter combining API regression and the `init -> next -> handoff -> done` smoke loop.

Next architecture-split slice:

1. Move workflow rendering: flow, step detail, current/next action panels, task selectors, and render orchestration.
2. Move Agent-facing interactions: prompt preview, handoff review, session continuation, and completion return handling.
3. Keep the behavior-preserving split discipline and run the same regression commands after each slice.

### P2.1: Configuration Experience Redesign

The next practical improvement should focus on replacing the current large configuration form with guided setup.

Recommended task list:

1. First-run setup wizard:
   - choose team-config repo
   - choose business repo root
   - choose default profile
   - run doctor automatically
2. Demand setup wizard:
   - choose or create workspace
   - choose candidate apps from app-index
   - choose PRD source
   - choose optional knowledge/capabilities
3. Capability picker:
   - show capabilities from profile and team-config metadata
   - group by skill, rule, template, knowledge, quality, archive, executor
   - show which workflow steps each capability applies to
4. App picker:
   - read `apps/app-index.json`
   - show app name, repo key, local resolved path, git status
   - allow per-demand selection
5. Advanced overrides:
   - keep raw path inputs, but hide them behind advanced controls
   - make overrides explicit and reversible
6. Setup readiness summary:
   - show missing config
   - show inherited config
   - show local overrides
   - show the next step button only when required setup is ready

### P3: Quality And Archive Capabilities

Planned capability types:

- `qualityGate`
- `archiveTarget`
- `notification`

Examples:

- Maven test
- coverage parser
- lint
- Sonar
- AI review
- local archive
- Git archive
- Feishu / Confluence / Jira adapter
- webhook notification

### P4: Executor Adapters

Target executors:

- Codex
- Claude Code
- Windsurf
- Cursor

Each executor should define:

- how to open
- how to resume an existing workspace-stage session
- how to receive handoff
- how to write completion marker
- how to return to the console

The first session-continuity implementation is intentionally file-based. `.workflow/agent-sessions.json` keeps only session pointers and recent metadata for external CLI tools; it is not a database and does not store chat content.

## Trial Recommendation

For next week's trial:

1. Publish package with a real npm name, or run locally with `npm link`.
2. Prepare a private team-config repo with real app-index, skills, rules, templates, and knowledge.
3. Run:

```bash
dw setup --team-config-root <team-config-path> --repo-root <code-root> --profile default
dw doctor
dw start
```

4. Create a demand workspace.
5. Use the console to hand off steps to Codex / Claude.
6. Ask AI to run `dw done` and then `dw open` when ready for review.
