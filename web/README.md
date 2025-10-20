# Bissbilanz Web Frontend

This package contains the Next.js frontend for Bissbilanz. The project is built with the App Router, Tailwind CSS, and [shadcn/ui](https://ui.shadcn.com/) components. Bun is used for dependency management and scripts.

## Getting started

```bash
bun install
bun run dev
```

The development server runs on [http://localhost:3000](http://localhost:3000) by default.

## Available scripts

| Command         | Description                |
| --------------- | -------------------------- |
| `bun run dev`   | Start the development app. |
| `bun run build` | Create a production build. |
| `bun run start` | Run the production server. |
| `bun run lint`  | Lint the codebase.         |

## Docker

A `Dockerfile` is provided for building the frontend with the official Bun image:

```bash
docker build -t bissbilanz-web .
```

The resulting image runs the production build with `bun run start`.
