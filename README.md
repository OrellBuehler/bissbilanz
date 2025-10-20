# bissbilanz

## Requirements

- Go 1.25

## Project Structure

- `backend/`: Server-side application code, APIs, and integration services.
- `database/`: Database schemas, migrations, seed scripts, and related tooling.
- `web/`: Web frontend application sources, static assets, and build configuration.
- `ios/`: Native iOS application projects and shared resources.
- `android/`: Native Android application projects and shared resources.

Each directory currently contains a placeholder README to keep the folder tracked until platform-specific code is added.

## API documentation and client generation

The backend ships with an embedded OpenAPI description that powers Swagger UI at `http://localhost:3000/swagger`. Regenerate API clients from the repository root with the provided Makefile:

```bash
make api-client-web   # TypeScript client (web/src/api/generated)
make api-client-ios   # Swift client (ios/Generated/API)
```

Both commands run the official OpenAPI Generator Docker image and require Docker to be installed locally.
