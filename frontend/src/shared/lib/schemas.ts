import { z } from 'zod';

export const idSchema = z.uuid();

export const workspaceNameSchema = z
  .string()
  .trim()
  .min(1, 'Enter a name')
  .max(100, 'Use at most 100 characters');

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email('Enter a valid email').max(254));

export const fieldErrors = (error: z.ZodError) =>
  Object.fromEntries(
    Object.entries(z.flattenError(error).fieldErrors).map(([field, messages]) => [
      field,
      (messages as string[] | undefined)?.[0],
    ]),
  );
