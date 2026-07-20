# Delivery Workflow Next Stage Task Breakdown

## Core Product Invariant

Delivery Workflow is a delivery quality harness, not an AI IDE.

The product must keep these responsibilities stable:

- assemble workspace, team capability, application, and demand context
- define stage boundaries and role Agent contracts
- package bounded work to Codex, Claude Code, or other executors
- require structured artifact writeback before a stage is considered complete
- preserve checkpoint evidence and human confirmation
- guide the user back from AI tools through `dw done` and `dw open`

The console should improve delivery control and review clarity. It should not become a replacement for Codex, Claude Code, Cursor, Windsurf, or other AI coding environments.

## v1 Product Focus: PRD -> Function -> Whitepaper -> Code Context

Status on 2026-07-19: the next initial business version is defined around one
real financial backend small demand or defect fix with an existing application
and test baseline. It is not a generic Skill configuration platform.

The user flow is PRD-first:

```text
import PRD -> confirm function point -> resolve whitepaper/application context
-> create Agent work package -> implementation/test/review -> checkpoint
-> archive case card -> propose knowledge update
```

Product roles:

- Company Harness: supplies generic function-oriented Skills, Rules, and Tools.
- Delivery Workflow: owns financial demand routing, stage contracts, quality
  evidence, checkpoints, and archive feedback.
- Whitepaper repository: Git-maintained domain knowledge, function index, and
  portable application/Git source index.
- Codex / Claude Code: execute bounded role-Agent work packages.

Implementation tasks for the next phase:

1. Whitepaper repository baseline.
   - Create a Git-maintained `domains/<domain>/whitepaper.md`,
     `function-index.json`, `application-index.json`, and `cases/` layout.
   - Seed one pilot financial domain with 3-5 high-frequency function points.
   - Keep machine-local paths and credentials out of this repository.

2. PRD-first function routing.
   - Import PRD before any function or application decision.
   - Propose function-point candidates from PRD text; let users confirm a
     primary function and optional related functions.
   - Allow unmatched functions as knowledge gaps, never as implicit coverage.

3. Local-code-first application resolution.
   - Resolve application ids through workspace selection and configured local
     code roots before attempting a remote source.
   - Validate local Git remote identity when available.
   - Offer a configured GitLab repository as a managed clone only after user
     confirmation or explicit CLI `--fetch-missing`.
   - Block technical design, coding, test execution, and code review until
     required source code is resolved; allow requirement analysis with a clear
     source-context warning.

4. Context package and capability lock.
   - Package PRD, confirmed function points, whitepaper references, resolved
     applications, risk tags, and company Harness capabilities.
   - Write `.workflow/capabilities.lock.json` and a source-resolution record
     for every Agent handoff.
   - Keep ordinary Skill selection out of the main user flow; show it as a
     resolved result, with advanced overrides only.

5. Quality evidence loop.
   - Create test plan after requirement/design confirmation.
   - Require implementation test results, independent Review output, and a
     risk-driven rerun where review finds gaps.
   - Summarize deterministic checks, Review findings, and human checkpoints in
     `.workflow/quality-summary.json`.

6. CLI and trial.
   - Add `dw function match`, `dw context resolve`, `dw app resolve`, and
     `dw quality verify` with `--dry-run`; retain `dw handoff` and `dw done`.
   - Run one real demand end-to-end and turn its archive into the first case
     card plus a Git-reviewable whitepaper/index update proposal.

V1 exit criteria:

- A PRD can be routed to a confirmed function point and domain context.
- The related application is resolved from local code or a confirmed managed
  GitLab clone.
- Handoff includes whitepaper, application, risk, and capability evidence.
- A real demand returns test, Review, checkpoint, and archive evidence.
- Archive produces a case card, knowledge update proposal, and human-readable
  patch proposal; only a Knowledge Owner-reviewed Git merge becomes reusable
  domain truth.

## Direction 1: Architecture Split

Goal: reduce risk before adding more product behavior. This phase should preserve existing behavior.

Status on 2026-07-13:

- Server utilities and runtime responsibilities have been split out of `console/server.js` without changing public API shapes.
- Frontend state, configuration, run execution, checkpoints, artifact preview, and workspace lifecycle have been moved out of `console/public/app.js`.
- `scripts/regression-api.js` now starts the real local server and verifies workspace initialization, config, definition, handoff, static frontend modules, simulated Agent execution, run metadata, and run logs.
- `npm run check` and `npm run test:regression` passed after the split.

Completed work:

1. Server and runtime domains.
   - Completed: HTTP, Git, filesystem, state, workspace files/status/runtime, workflow progress, checkpoints, capability routing, run store, and Agent session/prompt/handoff/launcher/execution/runner/adjustment modules.
   - Public API responses remain unchanged.

2. Frontend domains.
   - Completed foundation: `api`, `format`, and `app-state`.
   - Completed interaction domains: `app-config`, `app-runs`, `app-checkpoint`, `app-artifacts`, and `app-workspace`.
   - `app.js` is now the integration layer for those modules plus the remaining workflow-render and Agent-facing behavior.

3. Regression checks.
   - Completed: `npm run check` covers all split modules.
   - Completed: `npm run test:regression` combines API regression and the existing `init -> next -> handoff -> done` smoke loop.
   - The API regression includes a simulated Agent command so runner process output, status transition, and log retrieval are covered without requiring a real Codex or Claude session.

Next resume point:

1. Extract the remaining workflow-render domain: flow, step detail, current/next action panels, task selectors, and render orchestration.
2. Extract the remaining Agent-facing domain: prompt assembly/preview, handoff review, session continuation, and completion return handling.
3. Keep each move behavior-preserving and run `npm run check` plus `npm run test:regression` after every domain extraction.

Exit criteria:

- CLI commands still work.
- Console APIs still return the same shapes.
- Existing smoke test passes.
- No product behavior changes are introduced by this phase unless explicitly documented.

## Direction 2: Product Model Solidification

Goal: make the Harness concepts explicit in code and UI language.

Tasks:

1. Stabilize the three configuration layers.
   - Global config: machine and team access sources.
   - Workspace config: demand-specific selected apps, PRD sources, notes, overrides.
   - Handoff config: current Agent, step, task, routed capabilities, required outputs, return command.

2. Promote role Agent contracts.
   - Requirement Analysis Agent
   - Technical Design Agent
   - Coding Implementation Agent
   - Review Agent
   - Test Agent
   - Archive Agent

3. Keep packaged AI handoff immutable in principle.
   - The console packages the work.
   - The executor performs multi-turn reasoning.
   - Completion requires structured files and `dw done`.
   - Chat conclusions are not delivery evidence until written back.

4. Clarify capability routing.
   - Team capabilities enhance a step.
   - They cannot skip stage boundaries or manual checkpoints.
   - Capability UI should show enabled, disabled, inherited, and overridden states.

Exit criteria:

- User-facing labels describe Agents and delivery stages, not raw internal steps.
- Handoff files show required inputs, outputs, boundaries, and return commands.
- The code has a clear place for each product model.

## Direction 3: Product Experience Optimization

Goal: improve demand delivery quality and lower setup friction after the architecture can absorb changes.

Tasks:

1. First-run setup wizard.
   - Choose workspace root.
   - Choose team capability library.
   - Choose business repo root.
   - Detect local AI tools.
   - Run readiness checks.

2. Demand setup wizard.
   - Create or select workspace.
   - Import PRD files or links.
   - Select candidate applications from app-index.
   - Add natural-language demand notes and technical clues.
   - Save demand context as artifacts, not hidden UI state.

3. App and capability picker.
   - Prefer structured `app-index.json`.
   - Show app name, repo key, resolved local path, base branch, and git readiness.
   - Select skills, rules, templates, and knowledge from team metadata.
   - Keep raw path overrides in advanced settings.

4. Git and code-context preflight.
   - Show branch, dirty files, diff summary, and worktree state for selected apps.
   - Warn before implementation when unrelated changes exist.
   - Keep branch creation and destructive operations user-confirmed.

5. Quality and archive capabilities.
   - Add quality gate capability runtime.
   - Add archive target capability runtime.
   - Keep upload/archive actions dry-run and manually confirmed first.

6. Executor adapters.
   - Standardize Codex, Claude Code, Windsurf, and Cursor launch contracts.
   - Support continue-session and role-session modes.
   - Keep `.workflow/agent-sessions.json` as a pointer index, not chat storage.

Exit criteria:

- A new user can complete setup without understanding raw JSON/path internals.
- A demand can move from PRD to implementation with visible checkpoints.
- The Harness improves delivery quality through boundaries, evidence, and review, while AI coding remains outside the console.

## Direction 4: External Capabilities

Goal: connect external systems while keeping the Harness artifact contract stable.

Reference: `docs/external-capabilities-plan.md`.

Status on 2026-07-10:

- Feishu/Lark CLI adapter path is now usable for local validation.
- A Feishu wiki/document link can be imported into `prd/document.md` and `prd/source-feishu.json`.
- The material modal has a `读取到本地` action and a success/failure result dialog.
- The Requirement Agent handoff now blocks when only Feishu links exist but no readable local PRD artifact has been produced.
- Quality gate split has been designed and the first artifacts are represented in the workflow contract.

Tasks:

1. Feishu document intake.
   - Done: add global Feishu integration config under `tools.integrations.feishu`.
   - Do not require ordinary users to create a Feishu application.
   - Done: support user authorization through an approved Feishu/Lark CLI adapter.
   - Done: support app credentials only through terminal initialization, without storing raw secrets in workspace files.
   - Done: parse Feishu document/wiki links into type and token.
   - Done: read Feishu document content through `@larksuite/cli`.
   - Done: convert CLI output into Markdown.
   - Done: save raw import metadata to `prd/source-feishu.json`.
   - Done: save converted PRD content to `prd/document.md`.
   - Partial: show aggregate import state in the material modal and success/failure dialog after import.
   - Next: show per-link states: waiting, imported, permission denied, unsupported, failed.

2. Feishu authorization UX.
   - Partial: show configured / missing CLI / command error states in global config.
   - Partial: show import success/failure in the material modal.
   - Next: show token expired, permission denied, unsupported-link, and document-policy blocked states.
   - Prefer user authorization for ordinary company documents.
   - Use tenant/app token only when a team connector application or service account is officially available.
   - Done: keep Feishu CLI as an adapter that still writes back local workspace artifacts.
   - Next: keep MCP and internal proxy as hot-pluggable adapters under the same artifact contract.
   - Next: reduce default CLI authorization scope with explicit `--scope` and/or `--exclude` instead of relying only on broad `--recommend`.

3. Quality gate split.
   - Keep Review Agent and Test Agent separate.
   - Review Agent writes `review/ai-review.md` and `review/risk-list.md`.
   - Test Agent writes `review/unit-test-plan.md` and `review/unit-test-result.md`.
   - Integration tests should be optional and only run when the target project has a detectable integration test harness.

4. Quality gate execution contract.
   - Implementation Agent may write `review/self-check.md`.
   - Review Agent must be an independent pass over diff and delivery evidence.
   - Test Agent should run after review findings are available, so tests cover both intended behavior and discovered risks.
   - Code review can be assigned to a separate Agent/session to reduce implementation-conversation bias.

Exit criteria:

- Done: Feishu links can become local PRD Markdown artifacts without manual copy/paste through the CLI adapter.
- Missing Feishu permissions block AI handoff with a clear reason.
- Review and test outputs are independently produced and visible in the quality gate.
- Integration test generation is planned but not required for the first external capability release.
