import Link from 'next/link';
import { Suspense } from 'react';
import { RegisterForm } from '@/features/auth';
import { routes } from '@/shared/config';
import { AuthCard } from '@/shared/ui/auth-card';
import { Skeleton } from '@/shared/ui/skeleton';

export function RegisterPage() {
  return (
    <AuthCard
      title="Create an account"
      description="Start writing together in minutes"
      footer={
        <>
          Already have an account?&nbsp;
          <Link href={routes.login} className="text-foreground underline underline-offset-4">
            Sign in
          </Link>
        </>
      }
    >
      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        <RegisterForm />
      </Suspense>
    </AuthCard>
  );
}
