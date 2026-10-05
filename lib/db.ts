import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

/**
 * Resolves the database connection string.
 *
 * PostgreSQL on Neon in both local development and production, so there is no
 * path resolution to do: DATABASE_URL is used exactly as provided, and it is
 * the only database variable the runtime reads. DIRECT_URL — Neon's direct,
 * non-pooled endpoint — is for the Prisma CLI alone; see prisma.config.ts.
 */
function resolveDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;

  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env and set DATABASE_URL to your PostgreSQL connection string.",
    );
  }

  return url;
}

function createPrismaClient(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: resolveDatabaseUrl() });
  return new PrismaClient({ adapter });
}

// Next.js dev server re-evaluates modules on hot reload. Without a global cache
// every reload would open a new PostgreSQL pool and eventually exhaust the
// database's connection limit, so the client is parked on globalThis outside
// production.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}