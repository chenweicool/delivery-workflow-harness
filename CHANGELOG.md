# Changelog

## Unreleased

- Fixed CI branch filters to run on the public `main` branch.
- Included the API regression script in the npm package and made
  `prepublishOnly` run the full regression suite.
- Updated local development and beta publishing instructions.

## V0.2.0-beta.0

- Added the PRD-first whitepaper loop: function-point routing, whitepaper
  context snapshots, local-code-first application resolution, and explicit
  managed Git source fetch.
- Added whitepaper-routed capabilities, financial risk context for test/review,
  quality evidence summaries, and review-only archive knowledge proposals.
- Added public npm and GitHub project metadata, contribution guidance, security
  reporting guidance, and CI verification.

## V0.2

- Added a central-console layout with a persistent workspace sidebar.
- Added global setup readiness status for workspace root, team capability library, and local AI tools.
- Added `workspaceRoot` to global local configuration so new workspaces can inherit a default root.
- Added an open `integrations` object to global configuration for future Feishu, Dev platform, database, archive, and quality-gate connectors.
- Moved team profile toward an advanced capability-scheme concept in the UI.
- Reduced default console copy density: flow cards, setup panels, next-step panel, and local initialization artifacts now show concise action/status information by default.
- Simplified the workspace workbench: AI handoff is now a compact action row, capability diagnostics and template tools are hidden by default, and empty preview panels no longer take vertical space.
- Changed global configuration into a modal-style configuration center and removed the duplicated delivery-config entry from the main workspace page.
- Added available-app discovery from team app-index and the configured business repo root so workspaces can choose candidate apps from global configuration.
- Simplified the global configuration center so it only exposes global access sources by default: local tools, workspace root, team capability library, business repo root, discovered apps, and extension integration config.
- Hid demand/workspace-scoped overrides from the global configuration center, including candidate app overrides, per-demand knowledge, extra skills/rules, delivery notes, and branch naming rules.
- Added an explicit application index JSON path to global configuration. The runtime now prefers the configured app-index file, then falls back to `team-config/apps/app-index.json`, then to shallow business repo discovery.
- Removed visible team-name/manual Word PRD skill controls from the global configuration center; those capabilities should be maintained in the team capability library.
- Removed the duplicated workspace switch bar from the main workspace page and promoted the flow unit list to an always-expanded top section above the next-step recommendation.
- Changed the workspace page toward a stage cockpit: the top flow now shows only business delivery stages, the current stage action card combines status, material entry, AI handoff, and artifact actions, and internal step cards are no longer shown on the main page by default.
- Moved stage materials into a modal entry point so PRD sources, technical-design inputs, stage inputs, and outputs are available without occupying the main delivery page.
- Added CLI return-loop commands: `status`, `next`, `handoff`, `done`, and `config`.
- Added `delivery-workflow done` so AI tools can write the handoff completion marker without hand-writing `done.json`.
- Added capability metadata support for team-config profiles while keeping legacy `skills` and `rules` fields compatible.
- Added step-aware capability routing with `appliesToSteps` and `capabilityTypes`.
- Made the next-step panel more explicit with status, step id, blocker count, and manual-confirmation actions.
- Added local directory picker buttons for creating or opening workspaces.
- Added file/directory picker buttons for local tools, team config roots, repo roots, skills, rules, app paths, and knowledge paths.
- Converted requirement, technical, and task confirmation guidance toward table-based human review.
- Added a task execution gate so `06-implement-task` requires explicit approval in `tasks/task-confirmation.md`.
- Renamed the workspace PRD material directory from `requirement/prd/` to `prd/`.
- Moved phase commands from `commands/` to `.workflow/commands/` to keep demand workspaces focused on delivery artifacts.
- Removed initialized `requirement/` and `implementation/` process directories from the workspace template.
- Consolidated requirement-stage outputs into `design/requirement-confirmation.md`.
- Consolidated technical-design-stage outputs into `design/technical-design.md` and `design/technical-confirmation.md`.
- Kept implementation check and AI review under `review/`, and delivery summary / knowledge improvement under `delivery/`.
- Updated initialization scripts to create PRD material subdirectories and copy both `rules/` and `skills/` into the context snapshot.

## V0.1

- Added `delivery-workflow/` as the AI demand delivery workflow template source.
- Added workspace template with `AGENTS.md`, `CLAUDE.md`, process directories, and phase commands.
- Added command templates from context loading to delivery summary.
- Added lightweight business glossary and system index placeholders.
- Added `scripts/init-workspace.sh` to create isolated demand workspaces.
- Kept existing `rules/` and `skills/` untouched.
