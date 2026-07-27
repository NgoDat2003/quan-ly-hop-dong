import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

// Prisma 7 moved connection config out of schema.prisma into this file.
// The CLI (migrate, studio) reads this; PrismaClient at runtime still uses
// generator output only and does not read this file.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: env('DATABASE_URL'),
  },
});
