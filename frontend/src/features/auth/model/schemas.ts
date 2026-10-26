import { z } from 'zod';

const email = z.string().trim().toLowerCase().pipe(z.email('Enter a valid email').max(254));

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Enter your password').max(128),
});

export const registerSchema = z.object({
  name: z.string().trim().min(1, 'Enter your name').max(100),
  email,
  password: z.string().min(8, 'Use at least 8 characters').max(128, 'Use at most 128 characters'),
});

export type LoginValues = z.infer<typeof loginSchema>;
export type RegisterValues = z.infer<typeof registerSchema>;
