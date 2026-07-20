# Capabilities

`capabilities/` stores hot-pluggable delivery capabilities.

The first version keeps compatibility with existing `profiles/default.json` fields:

- `skills`
- `rules`
- `templates`
- `knowledge`
- `apps/app-index.json`

Future capability folders can follow this shape:

```text
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

Each capability should follow `capability.schema.json`.

Recommended profile shape:

```json
{
  "capabilities": [
    {
      "id": "prd-word-to-md",
      "type": "skill",
      "name": "Word PRD to Markdown",
      "path": "skills/prd-word-to-md",
      "capabilityTypes": ["prd-convert"],
      "appliesToSteps": ["import-prd", "01-clarify-requirement"]
    }
  ]
}
```

Use relative paths in the team-config repository. Each developer only maps `teamConfigRoot` locally; new workspaces resolve those relative paths into a workspace snapshot.
