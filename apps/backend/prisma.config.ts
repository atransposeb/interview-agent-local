import "dotenv/config";
import { defineConfig } from "prisma/config";

// Read directly rather than through env(), which throws when the variable is
// missing: `prisma generate` needs no database and runs in build environments
// that don't have one. migrate still fails clearly without a URL.

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL ?? "",
  },
});