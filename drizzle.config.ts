import { defineConfig } from "drizzle-kit";
import { join } from "path";

export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.DATABASE_PATH || join(process.cwd(), "data", "auris.db"),
  },
});
