# Contributing

## Scope

This repository contains the generic Delivery Workflow Harness. Keep company
whitepapers, real application indexes, credentials, production links, and
customer demand artifacts out of contributions.

## Before Opening a Pull Request

1. Keep behavior changes focused and document any workflow contract change.
2. Run the local checks:

   ```bash
   npm run check
   npm run test:regression
   npm pack --dry-run
   ```

3. Do not commit `.npmrc`, tokens, generated local workspaces, or terminal
   logs containing private information.

## Pull Request Expectations

- Explain the user-facing workflow impact.
- Add or update regression coverage for runtime behavior changes.
- Keep whitepaper and team capability examples synthetic.
