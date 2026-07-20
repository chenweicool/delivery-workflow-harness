# Delivery Workflow Product Architecture and Roadmap

## 1. Product Positioning

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

## 2. Layered Architecture

```text
NPM package / public repo
  CLI commands
  local console
  workflow runtime
  generic workspace templates
  example team-config

Team config repo
  profiles
  app-index
  capabilities
  rules
  skills
  templates
  knowledge

Developer machine
  local config
  local workspaces
  local business repositories
  Codex / Claude / IDE

Workspace snapshot
  resolved config
  handoff files
  progress
  checkpoint artifacts
  final delivery evidence
```

## 3. Runtime Responsibilities

The runtime owns stable mechanics:

- create and open workspace
- read workflow definition
- route steps
- maintain `.workflow/progress.md`
- maintain `.workflow/progress.json`
- generate AI handoff
- detect `.workflow/handoff/done.json`
- read artifacts
- manage manual checkpoints

The runtime should not contain company-specific business rules.

## 4. Console Responsibilities

The console should be a delivery cockpit, not a configuration form collection.

The first screen should be organized as:

```text
Left sidebar
  workspace list
  global configuration status
  create/open workspace entry

Main area
  selected workspace flow
  next recommended action
  artifacts and checkpoints

Global configuration center
  local tools
  workspace root
  team capability library
  application index JSON
  business code root
  discovered app index
  extension integrations
```

The first screen should answer:

- Which workspace am I in?
- What is the next step?
- Which artifact should I review?
- Is AI still working or ready for review?
- Is global setup ready enough to start?

Advanced details should remain available but folded:

- workflow graph
- delivery config
- stage materials
- templates
- run logs

Global configuration is not a closed schema. It should keep a small stable core and expose extension slots:

- `workspaceRoot`: where new workspaces are created and where the sidebar discovers existing workspaces.
- `teamConfigRoot`: team-maintained capability library, including apps, capabilities, skills, rules, templates, and knowledge.
- `appIndexPath`: optional explicit JSON file for application metadata. When present, it is preferred over the default app-index files inside the team capability library.
- `repoRoot`: local business code root used for path mapping.
- `integrations`: open object for Feishu, internal Dev platform, database metadata, archive targets, quality services, release platforms, or other company-specific connectors.

Workspaces inherit global configuration by default. They should only store demand-specific overrides such as selected apps, PRD sources, extra knowledge, extra skills/rules, and branch/release notes.

The global configuration center should not expose branch naming, one-off demand notes, per-demand skills/rules, or candidate app overrides as first-class fields. Those controls belong near the selected workspace and the workflow step that consumes them. This keeps the first-run setup focused on global access sources instead of turning it into a demand-delivery form.

Application metadata should be maintained as structured JSON instead of inferred only from folders. Recommended shape:

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

`sourcePath` may be absolute, or relative to `repoRoot`. Folder scanning under `repoRoot` should remain a fallback only.

## 5. CLI Responsibilities

The CLI turns the product into a command-driven tool.

Current commands:

```bash
dw start
dw stop
dw restart
dw status
dw logs
dw open
dw setup
dw config
dw doctor
dw init <demand-name>
dw next --workspace <path>
dw handoff --workspace <path> --step <step-id>
dw done --workspace <path> --step <step-id> --summary "ready for review"
```

Recommended usage:

```bash
npx delivery-workflow-harness start
```

`start` launches the local console in daemon mode by default. The terminal can be closed without stopping the service.

`setup` stores local path mappings.

`doctor` checks local tools and team config.

`init` creates a workspace from the skeleton.

`open` returns from an AI terminal to the delivery page.

`handoff` generates `.workflow/handoff/current.md` for a role Agent.

`done` writes `.workflow/handoff/done.json` after the Agent has produced structured artifacts.

`delivery-workflow` remains the full command name. `dw` is the short daily alias.

## 6. AI Multi-Turn Loop

The product should not embed a full AI chat in P0.

The console should present AI work as role Agents, not as raw Codex / Claude buttons. Codex, Claude Code, and future executors are execution backends.

Recommended role model:

- Requirement Analysis Agent
- Technical Design Agent
- Coding Implementation Agent
- Review Agent
- Test Agent
- Archive Agent

Each Agent owns an input/output contract. The user may have many rounds of conversation inside the AI tool, but the Agent is not complete until it writes the required structured artifacts and returns through `dw done`.

Session modes:

- Continuous session: multiple Agents can continue in the same Codex / Claude context when continuity is valuable.
- Role session: each Agent can use an independent session to reduce context pollution, especially for Review, Test, and Archive.

Regardless of session mode, Agent-to-Agent handoff must happen through workspace artifacts, not chat memory.

Instead, every AI step uses a handoff loop with a small session index:

```text
Console
  -> generate .workflow/handoff/current.md
  -> open or resume Codex / Claude
  -> user performs multi-turn conversation in AI tool
  -> AI writes final artifacts
  -> AI runs dw done
  -> AI runs dw open
  -> Console detects done.json
  -> user reviews and confirms
```

`dw done` is the recommended bridge between AI tools and the console. Internally it writes `.workflow/handoff/done.json`, which remains the fallback marker when the command is unavailable.

`.workflow/agent-sessions.json` is only a session index. It records the current Codex / Claude session pointer for a workspace stage, step, task, and agent so the console can offer "continue session" instead of always opening a new CLI. It must not store chat transcripts, terminal output, or large prompt history. Conversation content remains inside the AI tool; formal delivery evidence remains in stage artifacts, progress files, checkpoints, and handoff markers.

### Prompt Contract

AI prompts are assembled from three layers:

- Built-in harness rules owned by the product runtime. They define stage boundaries, manual checkpoints, allowed reads/writes, progress maintenance, and required writeback files.
- Team capability layer owned by the team config repo. It contributes rules, skills, templates, app metadata, and knowledge entries.
- Workspace/user layer owned by the current demand. It contributes PRD materials, selected apps, technical positioning notes, manual confirmations, and review feedback.

The built-in harness layer has the highest priority and is not intended for ordinary user editing. Team capabilities can enhance a step, but cannot override the harness boundary or skip manual checkpoints. User input should be captured as artifacts such as PRD materials, `design/known-facts.md`, confirmation files, and review notes, rather than direct edits to workflow definitions.

For the PRD stage, AI should first produce `prd/document.md`, `design/context-summary.md`, and `design/requirement-confirmation.md`. Final technical design generation must wait until requirement confirmation is approved.

Example:

```json
{
  "stepId": "02-generate-technical-design",
  "taskId": "",
  "status": "ready-for-review",
  "returnStepId": "manual-technical",
  "outputs": [
    "design/technical-design.md",
    "design/technical-confirmation.md"
  ],
  "summary": "Generated the technical design and highlighted remaining risks.",
  "nextUrl": "http://127.0.0.1:3040/?workspace=...&step=manual-technical"
}
```

## 7. Capability Model

Capabilities are hot-pluggable delivery abilities.

Types:

- `prdSource`
- `template`
- `rule`
- `skill`
- `appIndex`
- `executor`
- `qualityGate`
- `archiveTarget`
- `notification`
- `knowledge`

The tool should support three levels of capability assembly:

```text
Team profile defaults
  + workspace overrides
  + step routing
  = workspace snapshot
```

Current compatibility fields:

- `skills`
- `rules`
- `templates`
- `knowledge`
- `apps/app-index.json`

Future target directory:

```text
team-config/
  profiles/default.json
  apps/app-index.json
  capabilities/
    prd/
    templates/
    rules/
    skills/
    quality/
    archive/
    executors/
    notifications/
```

## 8. Quality And Archive Plug-ins

Quality gates should be capabilities.

Examples:

- Maven test
- coverage parser
- lint
- Sonar
- AI review
- security scan

Archive targets should also be capabilities.

Examples:

- local filesystem
- Git repository
- Feishu
- Confluence
- Jira attachment
- internal delivery portal

The first implementation should support dry-run and manual confirmation before uploading.

## 9. Current Implemented Scope

- local console
- workspace initialization
- workflow step display
- progress and checkpoint files
- next-step recommendation
- team profile inheritance
- app-index example
- skills / rules / templates inheritance
- Codex / Claude handoff
- task-list parsing and task selector
- current step capability display
- semantic artifact shortcuts
- CLI commands: `dw start`, `dw stop`, `dw restart`, `dw status`, `dw logs`, `dw open`, `dw setup`, `dw config`, `dw doctor`, `dw init`, `dw next`, `dw handoff`, `dw done`
- AI completion bridge via `.workflow/handoff/done.json`

## 10. Roadmap

### P0: AI handoff loop

- `dw open`
- `.workflow/handoff/done.json`
- console AI working state
- refresh review button
- URL-based workspace and step routing

### P1: product skeleton

- `dw init <demand-name>`
- capability schema v1
- team-config v1 directory
- doctor validation for profile and capability references
- page display for current step assembled capabilities

### P2: console usability

- simplified home screen
- semantic artifact shortcuts
- current artifact preview
- folded advanced panels
- step-level capability explanation

### P3: quality and archive plug-ins

- `qualityGate` capability runtime
- quality result display
- `archiveTarget` capability runtime
- archive dry-run
- manual confirmation before upload

### P4: executor adapters

- Codex adapter
- Claude Code adapter
- Windsurf adapter
- Cursor adapter
- standard handoff and return contract

### P5: Git and context-aware launch

- show current branch, changed files, and diff summary for selected apps
- warn when the target app has uncommitted unrelated changes
- generate suggested branch names from workspace context, but keep branch creation as a user-confirmed action
- support context-aware launch commands that open Codex / Claude Code with workspace, Agent role, selected apps, required outputs, and return command already packaged
- keep the page and CLI as two surfaces of the same runtime: the page is for overview and review, CLI is for fast return, automation, and executor handoff
