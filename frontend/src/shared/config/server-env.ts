import 'server-only';
import { z } from 'zod';

const schema = z.object({
  API_INTERNAL_URL: z.url().default('http://localhost:4000'),
  FRONTEND_URL: z.url().default('http://localhost:3000'),
});

export const serverEnv = schema.parse(process.env);
