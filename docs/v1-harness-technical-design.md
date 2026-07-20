# Delivery Workflow Harness v1 Technical Design

## 1. Purpose and Boundary

Delivery Workflow v1 turns a reviewed demand into a controlled delivery loop:

```text
PRD / confirmed function point / domain knowledge / application code context
  -> Harness assembles a bounded Agent work package
  -> Codex / Claude Code performs multi-turn work outside the console
  -> structured artifacts + quality evidence are written back
  -> human checkpoint confirms high-risk decisions
  -> archive and reusable knowledge are returned to the next demand
```

The Harness owns context assembly, workflow boundaries, Agent contracts,
quality gates, checkpoints, artifact evidence, and return-to-console behavior.
It does not become an AI chat IDE, a code editor, or a replacement for CI.

## 2. v1 Outcome

The v1 acceptance target is one real financial backend small demand or defect
fix with an existing application and test baseline that can complete this loop:

1. Import local or Feishu PRD into `prd/document.md`.
2. Identify and confirm one primary function point and optional related function points.
3. Resolve whitepaper sections, related applications, risk boundaries, and company Harness capabilities.
4. Run Requirement, Design, Implementation, Review, Test, and Archive Agents.
5. Require structured artifacts before a stage can be marked complete.
6. Preserve checkpoints and archive a reusable case card.

This matches the Q3 objective: use workflow to improve on-time delivery,
rework, quality, and reuse rather than measuring AI usage alone.

### 2.1 Current implementation status

The initial implementation now supports a hot-pluggable local checkout of the
whitepaper Git repository. After PRD material is imported, the user confirms a
function point through the console or CLI. Delivery Workflow then writes:

```text
.workflow/whitepaper.lock.json
context/whitepaper-context.md
```

The snapshot contains the whitepaper revision, function point, related
applications, risk tags, and recommended capabilities. Recommended capabilities
are marked as whitepaper-selected during step routing. Quality Review and unit
test prompts receive the same risk tags as explicit quality-gate context.

The current CLI equivalents are:

```text
dw function match <keyword>
dw context resolve --workspace <path> --function <function-id>
dw app fetch --workspace <path> --app <application-id>
dw archive propose --workspace <path>
```

Local code remains the first choice. When an indexed application is not found
locally, the user may explicitly fetch the configured Git remote through the
console or `dw app fetch`. The repository is cloned into
`<repoRoot>/.delivery-workflow-cache` by default (or a configured cache root).
The runtime never auto-clones, auto-pulls, overwrites an existing directory, or
switches a branch. An existing cached Git repository is reused as-is.

After an AI Review or unit-test handoff is marked complete, `dw done` refreshes
`.workflow/quality-summary.json`. The summary makes Review/risk/test evidence,
P0-P3 counts, whitepaper risks, and the recommended next action available to
release and archive stages. A P0 finding keeps the summary in `blocked` state.

## 3. Runtime Architecture

```text
Console + dw CLI
        |
        v
Harness Runtime
  |- Workspace and artifact store
  |- Workflow and checkpoint engine
  |- Function-point, whitepaper, and application-context resolver
  |- Capability registry and resolver
  |- Agent handoff / return contract
  |- Quality-gate coordinator
  `- Integration adapter registry
        |                         |
        v                         v
Codex / Claude Code          Feishu / knowledge / CI / archive adapters
        |
        v
Structured workspace artifacts and evidence
```

The console and `dw` are two views of the same runtime. The console is the
delivery cockpit; the CLI is the fast and automatable path. Neither owns a
second workflow definition.

## 4. Core Contracts

### 4.1 Workspace as delivery evidence

The workspace remains the stable integration boundary. v1 writes evidence to
normal, reviewable files rather than relying on chat history:

```text
prd/document.md
design/context-summary.md
design/requirement-confirmation.md
design/technical-design.md
tasks/task-confirmation.md
review/change-log.md
review/self-check.md
review/ai-review.md
review/risk-list.md
review/unit-test-plan.md
review/unit-test-result.md
delivery/release-checklist.md
delivery/delivery-summary.md
archive/knowledge-card.md
archive/knowledge-update-proposal.json
archive/knowledge-patch.md
.workflow/handoff/done.json
.workflow/capabilities.lock.json
.workflow/quality-summary.json
```

`capabilities.lock.json` records the resolved capability ids, versions,
sources, and content fingerprints used for a handoff. This makes a historical
delivery reproducible even when team skills are later updated.

### 4.2 Three configuration layers

| Layer | Owns | Must not own |
| --- | --- | --- |
| Global | local tools, team library, app index, external adapters | demand-specific material or secrets in workspace files |
| Workspace | PRD, selected apps, demand notes, selected capability ids | editable Harness core rules |
| Handoff | Agent, step, task, resolved inputs/outputs, return command | open-ended user instructions that bypass the step contract |

### 4.3 Immutable Harness policy

Built-in workflow rules remain platform-owned. A skill, rule, template, or
external adapter may add knowledge and checks, but may not skip a checkpoint,
expand write scope, mark a stage complete, or bypass required outputs.

## 5. Whitepaper and Application Index Construction

### 5.1 Role in the Harness

The PRD is always the first fact source for a demand. A user imports the PRD
first, then confirms a primary function point and optional related function
points. The whitepaper index routes that confirmed function point to the right
domain knowledge and applications. It does not redefine the scope of the PRD.

```text
PRD
  -> function-point matching and human confirmation
  -> whitepaper sections, risks, cases, and related application ids
  -> local code resolution, then controlled GitLab fallback
  -> assembled Requirement / Design Agent work package
```

The whitepaper is not a large Skill and it is not a machine-local path map. It
is a Git-maintained, reviewable domain knowledge source that contains business
rules, function relationships, and structured references to applications.

### 5.2 Git-maintained knowledge repository

The team maintains the following in a dedicated Git repository. Ordinary
developers consume a checked-out version through global configuration; the
Knowledge Owner reviews changes through the normal Git review process.

```text
finance-harness-knowledge/
  domains/
    settlement/
      whitepaper.md
      function-index.json
      application-index.json
      cases/
  capabilities/
    financial-review/
    financial-unit-test/
  profiles/default.json
```

- `whitepaper.md`: domain definition, business chain, terminology, state and
  rule definitions, high-risk points, examples, and change history.
- `function-index.json`: a searchable function-point directory that maps a
  function to whitepaper sections, related applications, risks, and cases.
- `application-index.json`: application identifiers, repository identity,
  GitLab source, default branch, technology, and test entry. It contains no
  user-specific local paths or credentials.
- `cases/`: archived, reviewable demand case cards. Cases become whitepaper or
  index updates only after owner approval.

### 5.3 Application Index and source resolution

The whitepaper repository owns portable application relationships and Git
source configuration. Each developer machine owns local code roots and an
optional managed Git cache root.

```json
{
  "apps": [
    {
      "id": "settlement-service",
      "name": "Settlement Service",
      "repoKey": "settlement-service",
      "relatedFunctions": ["settlement.bill-adjustment"],
      "localDiscovery": {
        "repoNames": ["settlement-service"],
        "remoteMatch": "git@gitlab.company.com:finance/settlement-service.git"
      },
      "remote": {
        "provider": "gitlab",
        "url": "git@gitlab.company.com:finance/settlement-service.git",
        "baseBranch": "master"
      },
      "tech": {
        "type": "java-backend",
        "testCommand": "mvn test"
      }
    }
  ]
}
```

Resolution order is deterministic:

1. Use the explicitly selected workspace application directory when it exists.
2. Search configured local code roots using `repoKey` and `repoNames`.
3. Verify a matched local Git repository against `remoteMatch` when possible.
4. If no local source is found, offer the configured GitLab repository as a
   managed clone candidate.
5. Clone only after explicit user confirmation, or an explicit CLI
   `--fetch-missing` option, into the configured managed cache. Never clone
   into a user's generic code root.
6. Use the resolved source path in the workspace snapshot. Do not automatically
   switch branches, pull a dirty repository, or store Git credentials.

Requirement analysis can proceed with PRD and domain knowledge when source is
unavailable. Technical design, implementation, test execution, and code review
must block until the relevant application source is resolved.

### 5.4 Function index example

```json
{
  "functions": [
    {
      "id": "settlement.bill-adjustment",
      "name": "Bill Adjustment",
      "aliases": ["bill correction", "settlement adjustment"],
      "domain": "settlement",
      "whitepaperRefs": [
        "domains/settlement/whitepaper.md#bill-adjustment",
        "domains/settlement/whitepaper.md#financial-risk"
      ],
      "relatedAppIds": ["settlement-service", "billing-service"],
      "riskTags": ["amount", "settlement", "cross-app"],
      "recommendedCapabilities": [
        "company-java-unit-test",
        "company-code-review",
        "financial-settlement-review"
      ]
    }
  ]
}
```

An unmatched function point is allowed, but is marked as a knowledge gap. It
may enter requirement analysis after the user selects candidate applications;
it may not silently claim whitepaper coverage or bypass a high-risk checkpoint.
Archive generates an index/whitepaper update suggestion for owner review.

### 5.5 Knowledge lifecycle

```text
approved PRD -> function point -> whitepaper/app context -> delivery evidence
  -> archive case card + knowledge update proposal -> owner review -> Git merge
  -> next demand resolves the approved Git revision
```

The Archive stage is the required closure point for whitepaper construction.
It produces three distinct artifacts:

```text
archive/cases/<demand-id>.md
  - confirmed function scope, affected applications, implementation summary,
    test/review/checkpoint evidence, and reusable conclusions

archive/knowledge-update-proposal.json
  - suggested whitepaper sections, function-index changes, application-index
    changes, risk/checklist changes, and the evidence that supports each change

archive/knowledge-patch.md
  - a human-readable Git change proposal for the knowledge repository
```

The first v1 implementation is intentionally review-first:

1. Archive Agent writes the case card to the workspace.
2. Delivery Workflow creates `archive/knowledge-update-proposal.json` and
   `archive/knowledge-patch.md`, containing the resolved knowledge Git revision,
   quality evidence, and suggested case/index targets.
3. The Knowledge Owner reviews the proposal, then creates the whitepaper Git
   branch, commit, and merge request through the normal Git/GitLab flow.
4. Delivery Workflow never commits, pushes, or merges the whitepaper Git
   repository automatically in v1.
5. The next workspace resolves the merged revision; an existing workspace keeps
   its locked whitepaper/index revision for reproducibility.

This keeps the Loop governed: agents may propose reusable knowledge but never
publish domain truth without an accountable reviewer.

## 6. Company Harness Integration and Dynamic Capability Model

The company Harness currently acts as a source of function-oriented generic
Skills. Delivery Workflow consumes those Skills as capabilities; it does not
need a separate company Harness Agent before a stable executor protocol exists.
Delivery Workflow contributes financial function context, delivery stages,
quality gates, and the evidence contract.

Dynamic configuration means resolving versioned capability packages from the
confirmed function point, not asking ordinary users to paste prompt fragments
or understand Skills.

Recommended team-library layout:

```text
team-config/
  capabilities/
    financial-unit-test/
      capability.json
      SKILL.md
      templates/
    financial-review/
      capability.json
      rules.md
    settlement-knowledge/
      capability.json
      knowledge/
  profiles/default.json
  apps/app-index.json
```

Minimal `capability.json`:

```json
{
  "id": "financial-unit-test",
  "version": "1.0.0",
  "type": "skill",
  "name": "Financial Java unit test",
  "appliesToSteps": ["06-generate-unit-tests"],
  "appliesToAgents": ["test"],
  "requires": ["java-backend"],
  "entryFiles": ["SKILL.md"],
  "outputs": ["review/unit-test-plan.md", "review/unit-test-result.md"]
}
```

Resolver order is fixed: Harness policy -> profile defaults -> function index
recommendations -> capability metadata matched by Agent/step/application ->
workspace-approved additions -> demand artifacts. The UI shows the matched
function point, whitepaper references, related applications, and resolved
capabilities. Raw path overrides remain advanced-only and become explicit local
additions.

## 7. Agent and Quality Contracts

| Agent | Input focus | Required writeback | Gate |
| --- | --- | --- | --- |
| Requirement | PRD, apps, knowledge | PRD Markdown, context, requirement confirmation | human scope confirmation |
| Design | confirmed requirement, code context | technical design, technical confirmation | human technical confirmation |
| Implementation | approved tasks, design | task progress, change log, self-check | explicit task permission |
| Review | diff, design, self-check, risk rules | AI review, risk list | independent Agent/session |
| Test | requirement, design, diff, review risks, test skill | unit-test plan and result | coverage/result evidence |
| Archive | final evidence, checkpoints | release checklist, delivery summary, knowledge card | archive confirmation |

Review and Test must remain separate. Test planning starts after requirement
and design confirmation, so acceptance boundaries are visible before coding.
Implementation writes and runs unit tests with the code. Review independently
examines the diff, design, self-check, and test evidence; review risks trigger
targeted test additions or reruns. Integration-test generation/execution is an
optional capability that only activates when the selected application exposes a
detectable test harness.

Hard v1 quality rules:

- New-code unit-test coverage target: at least 50%, or a recorded approved exception.
- Amount, billing, settlement, clearing, database, and cross-application changes require a human checkpoint.
- Missing test result, required review output, or checkpoint evidence blocks release preparation.

## 8. CLI Design

Existing commands stay compatible: `dw start|stop|restart|status|logs`,
`dw init`, `dw open`, `dw next`, `dw handoff`, and `dw done`.

Planned v1 command additions are deliberately small and scriptable:

```text
dw function match --workspace <path>
dw context resolve --workspace <path> [--dry-run]
dw app resolve --workspace <path> [--fetch-missing] [--dry-run]
dw capability list --workspace <path> [--step <id>]
dw quality status --workspace <path>
dw quality verify --workspace <path> [--dry-run]
dw source import feishu <url> --workspace <path>
```

Command rules:

- `dw function match` proposes candidates from PRD text; confirmation remains a
  user action in the console or through an explicit command argument;
- `dw app resolve --fetch-missing` is the only normal command that may clone a
  configured remote repository, and it must report its target before writing;
- every state-changing command requires an explicit workspace;
- `--dry-run` previews handoff, resolved capabilities, and file writes;
- `--json` is supported for CI or future platform integration;
- commands never print, persist, or pass raw third-party secrets through the workspace;
- `dw done` remains the only normal Agent completion return path.

Feishu and future integrations are adapters behind the same local-artifact
contract. A Feishu adapter may read a link, but its successful output is still
`prd/document.md` plus import metadata; the rest of the workflow never depends
on Feishu-specific logic.

## 9. v1 Delivery Sequence

1. Keep the completed architecture split behavior-preserving; only extract
   modules touched by this v1 scope before adding product behavior.
2. Create the Git-maintained whitepaper repository layout and one pilot domain
   function/application index.
3. Add PRD-first function matching, function confirmation, and application
   source resolution to the workspace runtime.
4. Build the context package from PRD, confirmed function points, whitepaper
   references, resolved applications, risks, and company Harness capabilities.
5. Add the capability lock snapshot and the quality evidence summary.
6. Make Test planning, implementation test evidence, independent Review, and
   human checkpoint a visible quality sequence.
7. Add the small `function`, `context`, `app`, and `quality` CLI commands.
8. Run a real financial demand through PRD import, context resolution,
   handoff, test, review, checkpoint, archive, and case-card return.

## 10. Current Initial Version and Next Phase

The current initial version already provides a local workspace, PRD import
including Feishu links, role-Agent handoff, structured writeback, checkpoints,
and a CLI return loop. The v1 delta is not a new AI interface. It is the
domain-context chain:

```text
PRD -> function point -> whitepaper/app index -> local or managed Git source
-> Agent work package -> quality evidence -> case-card feedback
```

The immediate next phase is therefore:

1. **Foundation**: publish the whitepaper Git repository structure and populate
   one pilot financial domain with 3-5 high-frequency function points.
2. **Resolution**: implement local-code-first and GitLab-fallback application
   resolution, with explicit confirmation for managed clones.
3. **Handoff**: include resolved domain and application context in Requirement
   and Design Agent packages, and record the lock snapshot.
4. **Quality**: surface test plan/result, independent review, risk-driven rerun,
   and financial high-risk checkpoints in one evidence summary.
5. **Archive loop**: generate a case card and knowledge-update proposal, then
   use a Knowledge Owner-reviewed Git branch to create the first whitepaper or
   index update.
6. **Trial**: use one real small demand with an existing test baseline to
   validate the entire loop and turn its archive into the first case card.

This is the v1 boundary. A generic plugin marketplace, automatic publishing to
external knowledge systems, automatic release, and a full company Harness
executor adapter stay outside this phase.

## 11. Explicit Non-goals for v1

- In-console AI chat or autonomous coding.
- Arbitrary executable JavaScript plug-ins from a team capability package.
- Automatic production release or automatic checkpoint approval.
- Mandatory integration-test execution for projects without an existing harness.
- Replacing the cloud knowledge base or review platform; v1 writes stable
  artifacts that those systems can ingest later.

## 12. Acceptance Checklist

- One new user can import a PRD, confirm a function point, resolve the related
  application context, and reach the first Agent handoff in 30 minutes.
- One real demand produces complete local evidence from PRD through archive.
- Every AI handoff has a function/app/capability snapshot and required-output
  contract.
- Review and unit-test artifacts are independently present before release preparation.
- High-risk changes cannot pass without a human checkpoint.
- The delivery summary and knowledge card can be archived or handed to the
  external knowledge/result platform without reinterpreting chat history.
- Archive produces a Git-reviewable case card and whitepaper/index update
  proposal; only an approved merge becomes reusable domain knowledge.
