import Link from 'next/link';
import { Suspense } from 'react';
import { LoginForm } from '@/features/auth';
import { routes } from '@/shared/config';
import { AuthCard } from '@/shared/ui/auth-card';
import { Skeleton } from '@/shared/ui/skeleton';

export function LoginPage() {
  return (
    <AuthCard
      title="Sign in"
      description="Welcome back to your workspace"
      footer={
        <>
          No account yet?&nbsp;
          <Link href={routes.register} className="text-foreground underline underline-offset-4">
            Create one
          </Link>
        </>
      }
    >
      <Suspense fallback={<Skeleton className="h-52 w-full" />}>
        <LoginForm />
      </Suspense>
    </AuthCard>
  );
}
