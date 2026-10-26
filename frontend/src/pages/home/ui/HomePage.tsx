import Link from 'next/link';
import { routes } from '@/shared/config';
import { Button } from '@/shared/ui/button';

export function HomePage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-4xl font-semibold tracking-tight">Collab Docs</h1>
      <p className="text-muted-foreground max-w-md">
        Nested pages, a block editor and real-time collaboration for your team.
      </p>
      <div className="flex gap-3">
        <Button asChild size="lg">
          <Link href={routes.register}>Get started</Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href={routes.login}>Sign in</Link>
        </Button>
      </div>
    </main>
  );
}
