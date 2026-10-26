'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { api, ApiError } from '@/shared/api';
import { notifyError } from '@/shared/lib';
import { Button } from '@/shared/ui/button';
import { FormField } from '@/shared/ui/form-field';
import { type RegisterValues, registerSchema } from '../model/schemas';
import { useAuthRedirect } from '../model/use-auth-redirect';

export function RegisterForm() {
  const done = useAuthRedirect();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterValues>({ resolver: zodResolver(registerSchema) });

  const onSubmit = handleSubmit(async (values) => {
    const { error, response } = await api.POST('/api/auth/register', { body: values });
    if (response.ok) {
      return done();
    }
    if (response.status === 409) {
      return setError('email', { message: 'This email is already registered' });
    }
    notifyError(ApiError.from(response.status, error));
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <FormField
        id="name"
        label="Name"
        autoComplete="name"
        error={errors.name?.message}
        {...register('name')}
      />
      <FormField
        id="email"
        label="Email"
        type="email"
        autoComplete="email"
        error={errors.email?.message}
        {...register('email')}
      />
      <FormField
        id="password"
        label="Password"
        type="password"
        autoComplete="new-password"
        error={errors.password?.message}
        {...register('password')}
      />
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Creating account…' : 'Create account'}
      </Button>
    </form>
  );
}
