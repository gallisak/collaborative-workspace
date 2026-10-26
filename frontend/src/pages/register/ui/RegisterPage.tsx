import Link from 'next/link';
import { Suspense } from 'react';
import { AUTH_SWITCH_LINK_CLASS, AuthSwitchLink, RegisterForm } from '@/features/auth';
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
          <Suspense
            fallback={
              <Link href={routes.login} className={AUTH_SWITCH_LINK_CLASS}>
                Sign in
              </Link>
            }
          >
            <AuthSwitchLink to={routes.login}>Sign in</AuthSwitchLink>
          </Suspense>
        </>
      }
    >
      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        <RegisterForm />
      </Suspense>
    </AuthCard>
  );
}
