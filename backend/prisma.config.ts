import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'prisma/config';

const envFile = (name: string) => fileURLToPath(new URL(`../${name}`, import.meta.url));

config({
  path: [envFile(`.env.${process.env.NODE_ENV ?? 'development'}`), envFile('.env')],
  quiet: true,
});

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? '',
  },
});
