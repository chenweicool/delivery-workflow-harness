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
dw init <demand-name> --domain <local-path-or-git-url> [--domain <source-2>]
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

A workspace may mount one primary Domain Harness and multiple read-only
reference Harnesses. Each source can be a local directory or a Git URL. Remote
sources are cloned only into `context/domain-sources/` of the current workspace;
the workflow records each manifest revision, code entry point and source in
`context/domain-summary.md` and `.workflow/domain.lock.json`. It never changes
the original local Harness or its source repositories.

```bash
dw init <demand-name> --domain <local-harness> --domain <reference-harness-git-url>
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

Technical design freezes `design/unit-test-design.md`. Its test cases must be
recorded in a table. Smoke cases are not designed by the workflow: development
provides `review/evidence/smoke-test-case.md` before test submission, and QA
records execution in `review/evidence/smoke-test-result.md`.

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
adapter immediately normalizes Markdown, plain-text and DOCX files into
`prd/document.md`, including readable Word tables. Every source and parser
result is recorded in `prd/metadata/ingestion.json`; a failed DOCX parse is
explicitly recorded as `parse-failed` together with its reason. PDF and legacy
DOC files remain safely archived and are marked `needs-parser` until a later
adapter or an Agent produces normalized Markdown.

The detailed architecture and connector model are in
[docs/control-plane-refactor-plan.md](docs/control-plane-refactor-plan.md).

## Public npm Publishing

The package is published to the public npm registry. Users do not need an npm
account; they can run the released `latest` package directly:

```bash
npx -y delivery-workflow-harness@latest start
```

The repository maintains two automated release paths:

- Dependabot opens weekly pull requests for npm dependencies and GitHub
  Actions updates. It never merges or publishes automatically.
- Pushing a Git tag named `v<package-version>` runs checks and publishes the
  package. Stable versions use the npm `latest` tag; prerelease versions use
  `beta`.

For current publishing restrictions, repository maintenance locations, and
the activation checklist, see [npm release and maintenance](docs/npm-release-and-maintenance.md).

Before enabling the release workflow, configure npm **Trusted Publishing** for
this GitHub repository and the `Publish npm package` workflow. This lets npm
verify GitHub's short-lived OIDC identity; do not add an npm token or `.npmrc`
credential to this repository.

To release, first commit the intended package version, then create and push a
matching annotated tag:

```bash
npm version prerelease --preid beta
git push origin main --follow-tags

# After beta verification:
npm version 0.2.0
git push origin main --follow-tags
```

Published npm versions are immutable. If the workflow fails, fix the issue,
create a new version, and tag that version; never try to republish the same
version.

Globally installed users can upgrade after a release with:

```bash
npm update -g delivery-workflow-harness
```

Do not schedule this command as a silent background update: it may interrupt a
running local console. Prefer showing an update notice and letting the user
restart when ready.

## Status

This project is in v1 trial stage. It is suitable for a real small demand with
an existing code and test baseline; the first completed demand should become a
whitepaper case and a Knowledge Owner-reviewed Git update.
