'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { api, ApiError } from '@/shared/api';
import { notifyError } from '@/shared/lib';
import { Alert, AlertDescription } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { FormField } from '@/shared/ui/form-field';
import { type LoginValues, loginSchema } from '../model/schemas';
import { useAuthRedirect } from '../model/use-auth-redirect';

export function LoginForm() {
  const done = useAuthRedirect();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) });

  const onSubmit = handleSubmit(async (values) => {
    const { error, response } = await api.POST('/api/auth/login', { body: values });
    if (response.ok) {
      return done();
    }
    if (response.status === 401 || response.status === 429) {
      return setError('root', { message: ApiError.from(response.status, error).message });
    }
    notifyError(ApiError.from(response.status, error));
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      {errors.root && (
        <Alert variant="destructive">
          <AlertDescription>{errors.root.message}</AlertDescription>
        </Alert>
      )}
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
        autoComplete="current-password"
        error={errors.password?.message}
        {...register('password')}
      />
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  );
}
