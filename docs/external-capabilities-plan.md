# External Capabilities Plan

## Product Boundary

Delivery Workflow remains a delivery quality Harness.

External capabilities should do two things:

- bring external evidence into the workspace as local artifacts
- package bounded work for role Agents and require structured writeback

They should not turn the console into a general Feishu editor, test platform, or AI IDE.

## Capability 1: Feishu Document Intake

### Goal

Given a Feishu document link, Delivery Workflow should read the document, convert it into Markdown, and save it into the current workspace as PRD material.

Expected artifacts:

- `prd/source-feishu.json`
- `prd/document.md`
- `prd/assets/**` if images or attachments are exported later

### Current Status - 2026-07-10

The first usable Feishu intake path has been implemented through the approved CLI-adapter model.

Implemented:

- Global Feishu/Lark config under `tools.integrations.feishu`.
- Official `@larksuite/cli` adapter mode using `npm exec --yes --package=@larksuite/cli`.
- Self-owned Feishu app initialization flow through terminal, with App Secret entered only in the terminal prompt.
- CLI login flow through Feishu device authorization / QR login.
- Feishu wiki/document link import into the current workspace.
- Workspace artifacts:
  - `prd/document.md`
  - `prd/source-feishu.json`
- Material modal action `读取到本地`.
- Success/failure feedback dialog after import, including the local artifact paths on success.
- Requirement handoff blocker when Feishu links exist but no readable local PRD Markdown has been produced.

Verified:

- `lark-cli auth status` returns the authorized Feishu user after login.
- `lark-cli docs +fetch --doc <url> --doc-format markdown --jq .data.document.content` can read a company Feishu wiki document and return Markdown.
- `POST /api/workspace/import-feishu-prd` imports the Feishu document into a local workspace.
- `npm run check` passes.
- `npm run check:feishu` passes.
- `npm run smoke` passes.
- Local console at `http://127.0.0.1:3040/` loads the Feishu import UI and result dialog.

Operational notes:

- Stopping or restarting the Delivery Workflow local service does not require Feishu re-authorization. The CLI authorization is stored in the user's local Lark CLI credential/config area, not in the `3040` server process.
- Re-authorization may be required if the local CLI credential is deleted, the Feishu application scopes change, the user revokes authorization, or token refresh fails.
- Raw App Secret must not be stored in workspace files or UI fields. It should only be pasted into the terminal when the CLI initialization command asks for it.

Open follow-up:

- Reduce the default requested CLI permissions. The current `--recommend` login requests a broad recommended set; next iteration should prefer explicit `--scope` and/or `--exclude` values for the minimum document read/export capability.
- Show more precise per-link import states in the material modal instead of a single aggregate status.
- Add asset export once image and attachment handling is needed.

### Recommended Access Model

Do not require ordinary users to create a Feishu application.

The recommended enterprise model is:

1. The company, platform team, or tool maintainer creates and approves one Feishu connector application.
2. Delivery Workflow stores only connector configuration in global user-level config.
3. Ordinary users click "Authorize Feishu" or provide an approved token reference.
4. Delivery Workflow imports readable documents into local workspace artifacts.

If the company cannot provide an approved application, API-based automatic import is not possible in a clean way. In that case, the product should fall back to:

- local file upload
- manual Feishu export and upload
- an approved internal proxy
- an approved Feishu CLI / MCP adapter, if the company allows it

The Harness should still own the artifact contract. Even when an external CLI is used, the result must be copied into `prd/document.md` and `prd/source-feishu.json`.

### Authorization and Token Configuration

Global config should add a Feishu integration card under `tools.integrations.feishu`.

Recommended schema:

```json
{
  "feishu": {
    "enabled": true,
    "mode": "oauth|tokenRef|cli|proxy",
    "baseUrl": "https://open.feishu.cn",
    "appId": "",
    "appSecretRef": "env:FEISHU_APP_SECRET",
    "authMode": "user_access_token",
    "tenantAccessTokenRef": "",
    "userAccessTokenRef": "",
    "refreshTokenRef": "",
    "cliCommand": "",
    "proxyBaseUrl": ""
  }
}
```

Rules:

- Do not store raw secrets in `.workflow/workspace.json`.
- Prefer environment variables or user-level local config.
- Workspace config stores only links and imported metadata, not long-lived secrets.
- The UI should show readiness only: configured, missing secret, token expired, no document permission.

### Token Choice

Use `user_access_token` first for company documents where the current user already has read permission.

Important constraint:

- Feishu OAuth still requires an application/client to exist.
- If the user cannot create an app, the company or tool maintainer must provide the connector application.
- The end user should only authorize that connector.

`tenant_access_token` remains useful for service-account or bot-style team documents, but it should not be the default assumption for ordinary users.

First implementation modes:

1. `tokenRef`: advanced mode, use a user-level token reference provided by an approved internal process.
2. `proxy`: call an approved internal Feishu document proxy that already handles OAuth.
3. `cli`: call an approved Feishu CLI/MCP adapter and import its Markdown output.
4. `oauth`: later, if the organization provides app id, app secret, redirect URI, and scopes.

### OAuth Permission Boundary

User authorization does not automatically mean Delivery Workflow can read or download every Feishu document.

Actual access is the intersection of:

- connector application scopes approved by the company
- scopes requested during user authorization
- the current user's permission on the target document
- document-level security controls, such as external sharing, copy, export, or download restrictions
- API-specific requirements, such as document read scope or export scope

Therefore the UI should not say "Feishu authorized" as if all documents are available. It should show:

- Feishu account authorized
- document read permission verified
- export or Markdown conversion available
- permission denied with a clear remediation hint

Recommended copy:

```text
已授权飞书账号。仍需确认你对该文档有阅读权限，且公司连接器具备云文档读取/导出权限。
```

If authorization succeeds but a document cannot be read, keep the link in `prd/source-feishu.json` with status `permission_denied` or `unsupported_policy`, and block PRD Agent handoff until the user imports a readable source.

### QR Login / Authorization Page

The normal user experience should be:

```text
Delivery Workflow
  -> open Feishu/Lark official OAuth authorize URL
  -> Feishu/Lark shows QR login and consent page
  -> user scans and approves
  -> Feishu/Lark redirects to the registered redirect URI with an authorization code
  -> company connector exchanges the code for user token
  -> Delivery Workflow can import documents that the user and app are allowed to read
```

Delivery Workflow can construct the official authorize URL when these values are configured:

- application App ID
- registered redirect URI
- target region, such as Feishu China or Lark global
- requested scopes

This still requires a company-approved application. Without an approved app and registered redirect URI, the QR login page cannot complete authorization safely.

### Link Parsing

The importer should normalize links into:

```json
{
  "url": "",
  "docType": "docx|docs|sheet|unknown",
  "token": "",
  "documentId": "",
  "source": "feishu"
}
```

First implementation should support Feishu Docs / Docx links only.

Unsupported links should be saved with an actionable status instead of silently failing.

### Markdown Conversion

Preferred path:

1. Parse Feishu URL and extract document token.
2. Query document metadata.
3. Query document blocks.
4. Convert supported blocks to Markdown.
5. Save raw block JSON for traceability.
6. Save Markdown to `prd/document.md`.

Initial supported block types:

- headings
- paragraphs
- ordered and unordered lists
- code blocks
- tables as Markdown tables where possible
- images as placeholder references until asset download is implemented

### Console UX

In "本次需求材料":

- Keep local file upload and Feishu links side by side.
- Add a "读取飞书" action.
- Show per-link state: waiting, imported, permission denied, unsupported, failed.
- If only Feishu links exist and import failed, block Requirement Agent handoff with a concrete reason.

## Capability 2: Quality Gate

### Goal

Quality gate should verify implementation evidence before release, not just generate generic suggestions.

It should produce:

- `review/ai-review.md`
- `review/risk-list.md`
- `review/unit-test-plan.md`
- `review/unit-test-result.md`
- later: `review/integration-test-plan.md` and `review/integration-test-result.md`

## Recommended Agent Split

Keep code review and test generation separate.

### Review Agent

Responsibility:

- read requirement, technical design, task list, change-log, self-check, and diff
- identify correctness, compatibility, regression, data, permission, and operational risks
- write findings first
- never modify code unless the user explicitly chooses a fix step

Outputs:

- `review/ai-review.md`
- `review/risk-list.md`

### Test Agent

Responsibility:

- generate or adjust tests based on current implementation and review findings
- prefer unit tests first
- run tests when possible
- record exact commands and results
- only make minimal production-code seam changes if necessary and explain them

Outputs:

- `review/unit-test-plan.md`
- `review/unit-test-result.md`

### Integration Test Agent

Do not include this in the first quality gate implementation unless the target repo has an existing integration test harness.

Integration tests should be a later capability because they often need:

- service dependencies
- database or middleware fixtures
- environment variables
- platform-specific launch commands
- longer execution time

First implementation should generate an integration test plan and only execute when existing project conventions are detectable.

## Quality Gate Flow

Recommended order:

```text
implementation evidence
  -> Review Agent
  -> human triage for P0/P1 risks
  -> Test Agent for unit tests
  -> optional Integration Test Agent
  -> release checklist
```

Do not merge test generation into the implementation Agent by default.

Implementation Agent may write `review/self-check.md`, but Review Agent and Test Agent should run independently so the Harness can catch blind spots from the implementation conversation.

## Next Implementation Tasks

1. Add Feishu integration config model.
2. Add token resolver and token cache.
3. Add Feishu link parser.
4. Add Feishu document block reader.
5. Add block-to-Markdown converter.
6. Add workspace API: import Feishu links into `prd/document.md`.
7. Update material modal states and blockers.
8. Split quality UI labels into Review Agent and Test Agent.
9. Add separate handoff contracts for review, unit test, and optional integration test.
10. Add smoke tests using mocked Feishu API responses.
