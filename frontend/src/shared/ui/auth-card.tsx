import Link from 'next/link';
import type { ReactNode } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './card';

interface AuthCardProps {
  title: string;
  description: string;
  footer: ReactNode;
  children: ReactNode;
}

export function AuthCard({ title, description, footer, children }: AuthCardProps) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-6">
      <Link href="/" className="text-lg font-semibold tracking-tight">
        Collab Docs
      </Link>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>{children}</CardContent>
        <CardFooter className="text-muted-foreground justify-center text-sm">{footer}</CardFooter>
      </Card>
    </main>
  );
}
