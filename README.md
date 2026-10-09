# Msgr

A real-time chat application built with GraphQL, React, and Prisma.

## Tech Stack

- **Backend**: Apollo GraphQL Server, Express, Prisma ORM, PostgreSQL, DataLoader
- **Frontend**: React 19, Apollo Client, React Router, [Sacred Computer](https://www.sacred.computer/) components (vendored in `apps/frontend/src/sacred`)
- **Real-time**: GraphQL Subscriptions via WebSocket
- **Auth**: JWT session in an httpOnly cookie (HTTP) and in connection params (WebSocket)
- **Build & test**: Nx monorepo, Vite, esbuild, Vitest

## Prerequisites

- Node.js 22+ and npm
- No need to install PostgreSQL separately - Prisma dev provides a local database

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Start the Database

In a separate terminal, start the Prisma development database:

```bash
npm run db:start
```

Press `h` to see the HTTP URL. Keep this running. Then create the API's env file:

```bash
cp apps/api/.env.example apps/api/.env
```

Set `DATABASE_URL` in `apps/api/.env` to the HTTP URL shown by the database process.

### 3. Set Up the Database

Run migrations, generate Prisma Client, and seed data:

```bash
npm run db:setup
```

Run `npm run db:migrate` again whenever you pull a new migration.

### 4. Start Development Servers

```bash
npm run dev
```

- **Frontend**: http://localhost:4200
- **API / GraphQL sandbox**: http://localhost:4000/graphql

### 5. Test Accounts

All seeded users have the password `password123`:

| Email               | Name          |
| ------------------- | ------------- |
| test@example.com    | Test User     |
| alice@example.com   | Alice Johnson |
| bob@example.com     | Bob Smith     |
| charlie@example.com | Charlie Brown |
| diana@example.com   | Diana Prince  |

The seed also creates 4 chats (3 direct, 1 group) with 13 messages.

## Available Scripts

| Script                | What it does                                             |
| --------------------- | -------------------------------------------------------- |
| `npm run dev`         | API and frontend in parallel (`dev:api`, `dev:frontend`) |
| `npm run test`        | All tests; no database needed                            |
| `npm run typecheck`   | Type check both apps (runs codegen first)                |
| `npm run lint`        | Lint both apps, including the API's layer rule           |
| `npm run build`       | Build both apps                                          |
| `npm run codegen`     | Generate GraphQL types for API and frontend              |
| `npm run db:start`    | Start the Prisma dev database                            |
| `npm run db:migrate`  | Apply migrations (and create one after a schema change)  |
| `npm run db:generate` | Generate Prisma Client                                   |
| `npm run db:seed`     | Reset chats and seed test data                           |
| `npm run db:setup`    | migrate + generate + seed                                |

## Project Structure

```
apps/
├── api/
│   ├── prisma/          # schema, migrations, seed
│   └── src/
│       ├── domain/          # pure types and rules (functional core)
│       ├── application/     # use cases, ports, DataLoaders
│       ├── infrastructure/  # Prisma, bcrypt, JWT, PubSub adapters
│       ├── graphql/         # schema, resolvers, context, server
│       ├── testing/         # in-memory adapters and test harness
│       └── main.ts          # composition root
└── frontend/
    └── src/
        ├── app/         # pages and components
        └── lib/         # generated GraphQL types, utilities
```

Architecture, conventions and the TDD workflow are in [CLAUDE.md](CLAUDE.md). The domain vocabulary is in [CONTEXT.md](CONTEXT.md).

## Troubleshooting

**Database connection issues?** Make sure `npm run db:start` is running and ports 51213-51215 are free.

**TypeScript errors after pulling?** Run `npm run codegen` and `npm run db:generate`.

**WebSocket authentication errors?** Clear localStorage, log in again, and check the API is running.

## Learn More

- [Nx Documentation](https://nx.dev)
- [Apollo GraphQL](https://www.apollographql.com/docs/)
- [Prisma](https://www.prisma.io/docs/)
- [DataLoader](https://github.com/graphql/dataloader)
