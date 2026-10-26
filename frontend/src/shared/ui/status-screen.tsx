import type { ReactNode } from 'react';

interface StatusScreenProps {
  title: string;
  description: string;
  action?: ReactNode;
}

export function StatusScreen({ title, description, action }: StatusScreenProps) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="text-muted-foreground max-w-md">{description}</p>
      {action}
    </main>
  );
}
