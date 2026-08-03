# Delivery Workflow

Delivery Workflow is a local delivery harness for AI-assisted software delivery.

It is not an AI IDE. It provides a workflow skeleton, local console, CLI commands, checkpoints, artifact review, and handoff contracts for tools such as Codex, Claude Code, Windsurf, or Cursor.

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
dw setup
dw config
dw function match <keyword>
dw context resolve --workspace <path> --function <function-id>
dw app fetch --workspace <path> --app <application-id>
dw archive propose --workspace <path>
dw domain inspect --root <domain-harness-path>
dw domain attach --workspace <path> --root <domain-harness-path>
dw doctor
dw init <demand-name> --domain <domain-harness-path>
dw status --workspace <path>
dw next --workspace <path>
dw handoff --workspace <path> --step <step-id>
dw done --workspace <path> --step <step-id> --summary "ready for review"
dw open --workspace <path> --step <step-id>
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
Delivery Workflow package
  CLI
  local console
  workflow runtime
  generic workspace templates
  example team-config

Team config repository
  real app-index
  real skills
  real rules
  real templates
  real knowledge

Whitepaper Git repository
  domains/<domain>/whitepaper.md
  domains/<domain>/function-index.json
  domains/<domain>/application-index.json
  domains/<domain>/cases/

Developer machine
  local config
  local workspaces
  local code repositories
  AI coding tools
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

## AI Handoff Loop

```text
Console creates handoff
  -> AI tool performs multi-turn work
  -> AI writes artifacts
  -> AI runs dw done
  -> dw open returns to the console
  -> human reviews and confirms
```

## Whitepaper Workflow

For a real demand, configure a local checkout of the whitepaper Git repository
once, then use this order:

```bash
dw config set --whitepaper-root <whitepaper-git-directory>
dw function match <function-keyword>
dw context resolve --workspace <workspace-path> --function <function-id>
dw app fetch --workspace <workspace-path> --app <application-id>
```

PRD material must be imported before a function point can be confirmed. The
runtime records the resolved whitepaper revision, risks, applications, and
recommended capabilities in the workspace. It never auto-clones, pulls,
overwrites, or switches a source repository. Remote source retrieval is an
explicit `dw app fetch` action only.

After test and review evidence is ready, archive produces a review-only
knowledge proposal:

```bash
dw archive propose --workspace <workspace-path>
```

This writes `archive/knowledge-update-proposal.json` and
`archive/knowledge-patch.md`. A Knowledge Owner reviews the proposal and uses
the normal Git/GitLab flow to update the whitepaper repository. Delivery
Workflow never commits, pushes, or merges whitepaper changes automatically.

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
