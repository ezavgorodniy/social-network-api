# social-network-api

A REST API for managing comments across multiple social media platforms, part of
a social media scheduling product. It provides a unified way to retrieve and
reply to comments on published posts regardless of the underlying platform.

## Features

- Retrieve comments for a published post
- Reply to a comment
- Pluggable support for multiple social platforms (Facebook, with more to come)
- REST API over a PostgreSQL-backed data model

## Tech stack

- **NestJS** + TypeScript
- **PostgreSQL** with **Prisma**
- **Jest** for unit, integration, and e2e tests

## Documentation

Architecture, data model, API reference, and design decisions live in
[`docs/`](./docs) — see [`docs/README.md`](./docs/README.md) and the
Architecture Decision Records in [`docs/adrs/`](./docs/adrs).

## Getting started

```bash
npm install
cp .env.example .env        # configure DATABASE_URL and platform credentials
docker compose up -d db     # local PostgreSQL
npm run prisma:migrate      # apply the schema
npm run start:dev           # start the API
```

## Contributing

Full setup, the test suites, and the Facebook token / live-smoke-test walkthrough
are in [`CONTRIBUTING.md`](./CONTRIBUTING.md).

```bash
npm test                    # unit + integration + e2e
```
