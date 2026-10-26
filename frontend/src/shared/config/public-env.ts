import { z } from 'zod';

export const publicEnv = z
  .object({ NEXT_PUBLIC_COLLAB_URL: z.url().default('ws://localhost:4001') })
  .parse({ NEXT_PUBLIC_COLLAB_URL: process.env.NEXT_PUBLIC_COLLAB_URL });
