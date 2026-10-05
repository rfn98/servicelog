import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// Prisma 7 configuration.
// The datasource URL lives here rather than in schema.prisma, and is read from
// .env (DATABASE_URL). See https://www.prisma.io/docs/orm/reference/prisma-config-reference
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});