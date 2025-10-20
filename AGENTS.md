# Agent Instructions

Before committing any changes that touch the `web/` project or its workflows, always run the following commands from the `web` directory:

1. `bun install`
2. `bun run lint`
3. `bun run test --if-present`
4. `bun run build`

These checks ensure the frontend dependencies install correctly and the project linting, tests (when present), and build succeed.
