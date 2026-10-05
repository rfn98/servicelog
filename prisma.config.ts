import "dotenv/config";
import { defineConfig } from "prisma/config";

// Prisma 7 configuration.
// The datasource URL lives here rather than in schema.prisma, and is read from
// .env. See https://www.prisma.io/docs/orm/reference/prisma-config-reference
//
// Two URLs, because Neon issues a pooled and a direct endpoint and they are
// not interchangeable:
//
//   DIRECT_URL   optional. Neon's direct (non-pooled) PostgreSQL connection.
//                Preferred here for `prisma migrate`, which takes locks and
//                talks to the `_prisma_migrations` table. Nothing else reads
//                it.
//   DATABASE_URL the pooled (-pooler) connection. This one is for the
//                application at runtime, in lib/db.ts, where a serverless
//                function must not hold a dedicated database connection per
//                invocation. It is also the CLI's fallback.
//
// Both stay in .env / Vercel environment variables. Nothing is hardcoded here.
//
// DIRECT_URL deliberately falls back to DATABASE_URL rather than using
// `env("DIRECT_URL")`: `env()` throws when the variable is missing, and
// `prisma generate` runs from `postinstall` on Vercel, where only DATABASE_URL
// exists. `generate` never opens a connection, so falling back keeps the build
// working; whenever DIRECT_URL is set, migrations still prefer the direct
// endpoint.
function resolveCliDatabaseUrl(): string {
  const direct = process.env.DIRECT_URL?.trim();
  if (direct) {
    return direct;
  }

  const pooled = process.env.DATABASE_URL?.trim();
  if (pooled) {
    return pooled;
  }

  throw new Error(
    "Neither DIRECT_URL nor DATABASE_URL is set. Copy .env.example to .env and set at least DATABASE_URL to your PostgreSQL connection string.",
  );
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: resolveCliDatabaseUrl(),
  },
});