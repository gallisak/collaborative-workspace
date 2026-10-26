import Link from 'next/link';
import { Suspense } from 'react';
import { AUTH_SWITCH_LINK_CLASS, AuthSwitchLink, LoginForm } from '@/features/auth';
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
          <Suspense
            fallback={
              <Link href={routes.register} className={AUTH_SWITCH_LINK_CLASS}>
                Create one
              </Link>
            }
          >
            <AuthSwitchLink to={routes.register}>Create one</AuthSwitchLink>
          </Suspense>
        </>
      }
    >
      <Suspense fallback={<Skeleton className="h-52 w-full" />}>
        <LoginForm />
      </Suspense>
    </AuthCard>
  );
}
