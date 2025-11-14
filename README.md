# Msgr

A real-time chat application built with GraphQL, React, and Prisma.

## Tech Stack

- **Backend**: Apollo GraphQL Server, Express, Prisma ORM, PostgreSQL
- **Frontend**: React 19, Apollo Client, React Router, Tailwind CSS
- **Real-time**: GraphQL Subscriptions via WebSocket
- **Auth**: JWT with httpOnly cookies and localStorage
- **Build System**: Nx monorepo, Vite, esbuild

## Prerequisites

- Node.js 22+ and npm
- No need to install PostgreSQL separately - Prisma dev provides a local database

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

This installs dependencies for both the API and frontend (via npm workspaces).

### 2. Start the Database

In a separate terminal, start the Prisma development database:

```bash
npm run db:start
```

Press `h` to see the HTTP URL or `t` for TCP URLs. Keep this running.

Then, configure environment variables for the API:

- Copy the example env file to create your local `.env`:

```bash
cp apps/api/.env.example apps/api/.env
```

- Open `apps/api/.env` and set `DATABASE_URL` to the HTTP URL shown when you pressed `h` in the database process.

Do this before proceeding to the next step.

### 3. Set Up the Database (First Time Only)

Run migrations, generate Prisma Client, and seed data:

```bash
npm run db:setup
```

### 4. Start Development Servers

```bash
npm run dev
```

This starts both the API and frontend:

- **Frontend**: http://localhost:4173
- **API**: http://localhost:4000
- **GraphQL Playground**: http://localhost:4000/graphql

### 5. Test Accounts

The seed script creates test users you can use to log in. All test users have the password: `password123`

| Email | Name |
|-------|------|
| test@example.com | Test User |
| alice@example.com | Alice Johnson |
| bob@example.com | Bob Smith |
| charlie@example.com | Charlie Brown |
| diana@example.com | Diana Prince |

The seed also creates 4 chats (3 one-on-one, 1 group) with 13 messages to test the UI.

## Available Scripts

### Database

- `npm run db:start` - Start Prisma dev database (keep running in separate terminal)
- `npm run db:migrate` - Run Prisma migrations
- `npm run db:seed` - Seed database with test data
- `npm run db:generate` - Generate Prisma Client types
- `npm run db:setup` - Run all setup steps (migrate + generate + seed)

### Development

- `npm run dev` - Start both API and frontend in parallel
- `npm run dev:api` - Start API server only
- `npm run dev:frontend` - Start frontend only

### Build & Quality

- `npm run build` - Build both applications
- `npm run typecheck` - Type check both applications
- `npm run codegen` - Generate GraphQL types for API and frontend

## Project Structure

```
msgr/
├── apps/
│   ├── api/          # Apollo GraphQL server
│   │   ├── prisma/   # Database schema
│   │   ├── scripts/  # Seed scripts
│   │   └── src/      # Server code
│   └── frontend/     # React application
│       ├── src/
│       │   ├── app/  # Components and pages
│       │   └── lib/  # Generated GraphQL types
│       └── ...
├── package.json      # Root package with scripts
└── README.md         # This file
```

### Key Features

- **GraphQL-First Development**: Schema-first approach with code generation
- **Real-time Updates**: WebSocket subscriptions for live messaging
- **Type Safety**: End-to-end TypeScript with generated types
- **Modern Auth**: JWT tokens with dual storage (cookies + localStorage)
- **Component Architecture**: Extracted, reusable React components with Tailwind CSS

## Development Workflow

1. **Schema Changes**: Update `apps/api/src/lib/schemas/schema.ts`
2. **Generate Types**: Run `npm run codegen`
3. **Update Resolvers**: Modify `apps/api/src/main.ts`
4. **Database Changes**: Update `apps/api/prisma/schema.prisma` and run `npm run db:migrate`

## Troubleshooting

**Database connection issues?**

- Make sure `npm run db:start` is running in a separate terminal
- Check that ports 51213-51215 are not in use

**TypeScript errors?**

- Run `npm run codegen` to regenerate GraphQL types
- Run `npm run db:generate` to regenerate Prisma Client

**WebSocket authentication errors?**

- Clear localStorage and log in again
- Check that the API server is running

## Learn More

- [Nx Documentation](https://nx.dev)
- [Apollo GraphQL](https://www.apollographql.com/docs/)
- [Prisma](https://www.prisma.io/docs/)
- [React](https://react.dev/)
