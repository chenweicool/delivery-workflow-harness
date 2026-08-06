# Delivery Workflow

Delivery Workflow is a directory-native, model-agnostic delivery control plane for AI-assisted software delivery.

It is not an AI IDE or an AI chat manager. It organizes a demand Workspace around PRD, Domain Harness context, evidence, quality gates and human approval. Developers enter that directory with their own Codex, Claude Code, IDE or another AI tool.

## Install And Run

```bash
npx delivery-workflow-harness start
```

Or install globally:

```bash
npm i -g delivery-workflow-harness
dw start
```

The command starts a local console in the background, usually at:

```text
http://127.0.0.1:3040
```

## CLI

```bash
dw start
dw stop
dw restart
dw status
dw logs
dw domain inspect --root <domain-harness-path>
dw domain attach --workspace <path> --root <domain-harness-path>
dw init <demand-name> --domain <domain-harness-path>
dw prd import <file-or-directory> --workspace <path>
dw status --workspace <path>
dw next --workspace <path>
dw gate check --workspace <path>
dw gate approve <gate-id> --workspace <path> --note "..."
dw gate reject <gate-id> --workspace <path> --note "..."
```

`delivery-workflow` remains available as the full command name. `dw` is the short daily alias.

Use foreground mode for local development:

```bash
dw start --foreground
```

For a step-by-step trial guide, see [docs/quick-start.md](docs/quick-start.md).

## Local Development

```bash
cd delivery-workflow-harness
npm run check
npm run test:regression
npm run start
```

The local console source lives in:

```text
console/
```

The workflow templates live in:

```text
templates/
```

## Product Model

```text
Domain Harness + team policy
  -> demand Workspace
  -> developer uses Codex / Claude / IDE in that directory
  -> evidence files + human quality gates
  -> delivery and knowledge-update proposal
```

The npm package should contain only generic workflow mechanics and examples. Team-specific assets should live in a separate private Git repository.

## Domain Harness Mount

A workspace may mount exactly one local Domain Harness. The mount is read-only:
the workflow records its manifest revision, exposes the Harness root to the AI
tool, writes `context/domain-summary.md`, and keeps a lock at
`.workflow/domain.lock.json`. It never changes `docs/domain/` or pulls source
repositories.

```bash
dw init <demand-name> --domain <domain-harness-path>
# or attach after initialization
dw domain attach --workspace <workspace-path> --root <domain-harness-path>
```

The agent must treat PRD and human confirmation as the target behavior, current
code as the source of current behavior, and Domain Harness material as domain
background and risk evidence. Conflicts are recorded for human confirmation.

## Quality Gates

Each Workspace contains `.workflow/quality-policy.yaml`. It defines required
evidence for demand confirmation, technical-design readiness, and delivery
verification. `dw gate check` writes the auditable state to
`.workflow/gates.json`; only an evidence-ready gate can be approved.

Technical design must freeze `design/unit-test-design.md` and
`design/smoke-test-design.md`. Later implementation is verified against those
baselines rather than adding tests only at the end.

## Workspace Artifact Layout

New Workspaces keep final artifacts separate from process records:

```text
prd/document.md                    parsed PRD
prd/source/                        original PRD material
design/*.md                        approved design and test baselines
design/process/                    context, confirmations and revision history
design/approvals/                  checkpoint records
tasks/task-list.md                 approved task plan
tasks/process/                     task confirmation and execution progress
review/quality-report.md           independent review conclusion
review/evidence/                   test, smoke, risk and traceability evidence
review/process/                    change log and self-check
archive/                           knowledge proposal and case card
.workflow/                         commands, locks and runtime state
```

After the technical-design checkpoint is approved, Workflow generates
`context/current-context.md`. A new Codex or Claude session reads it through
the Workspace instructions, then follows its links to the approved design and
test baselines. Skills remain external capabilities: the Workflow routes and
locks selected skills, but does not hard-code team or integration-specific
Skill implementations.

## PRD Ingestion

Local PRD imports are first copied to `prd/source/`. The built-in ingestion
adapter immediately normalizes Markdown and plain-text files into
`prd/document.md`, and records every source plus its parser status in
`prd/metadata/ingestion.json`. DOCX, PDF, and legacy DOC sources remain safely
archived and are marked `needs-parser` until a later parser adapter or an Agent
produces the normalized Markdown; this does not require a team Skill to be
installed.

The detailed architecture and connector model are in
[docs/control-plane-refactor-plan.md](docs/control-plane-refactor-plan.md).

## Public npm Publishing

The package is published to the public npm registry. Only the publishing
computer needs an npm account login; other computers can run the published
package without logging in:

```bash
npx -y delivery-workflow-harness@beta start
```

For a beta release from the publishing computer, run:

```bash
npm login --registry=https://registry.npmjs.org/
npm whoami
npm publish --tag beta --registry=https://registry.npmjs.org/
```

`npm publish` runs `prepublishOnly`, which executes syntax checks, regression
tests, and `npm pack --dry-run` before the package is uploaded.

Each published version must be new. After the beta trial is accepted, update
the package version and publish without `--tag beta` to release `latest`.
Never commit npm tokens, recovery codes, or `.npmrc` credentials to this
repository.

## Status

This project is in v1 trial stage. It is suitable for a real small demand with
an existing code and test baseline; the first completed demand should become a
whitepaper case and a Knowledge Owner-reviewed Git update.
