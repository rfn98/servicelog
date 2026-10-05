import path from "node:path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/generated/prisma/client";

/**
 * Resolves the database location.
 *
 * A relative SQLite path is resolved against the project root (process.cwd()),
 * which is how `prisma migrate` resolves it too. The path is made absolute here
 * so the app cannot end up opening a different file than the CLI created.
 *
 * Non-file URLs (e.g. postgresql://) are passed through untouched, which is how
 * PLAN.md §10 allows switching providers without touching application code.
 */
function resolveDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;

  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env and set DATABASE_URL.",
    );
  }

  if (!url.startsWith("file:")) {
    return url;
  }

  const relativePath = url.slice("file:".length);
  // The path is data-driven (it comes from DATABASE_URL), so Turbopack cannot
  // scope it statically and would otherwise trace the entire project into the
  // server bundle. Opting out keeps the deployment output small.
  return `file:${path.resolve(/* turbopackIgnore: true */ process.cwd(), relativePath)}`;
}

function createPrismaClient(): PrismaClient {
  const adapter = new PrismaBetterSqlite3({ url: resolveDatabaseUrl() });
  return new PrismaClient({ adapter });
}

// Next.js dev server re-evaluates modules on hot reload. Without a global cache
// every reload would open a new SQLite connection and eventually exhaust file
// handles, so the client is parked on globalThis outside production.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}