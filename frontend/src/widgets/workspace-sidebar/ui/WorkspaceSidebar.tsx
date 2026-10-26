'use client';

import { Home, Settings } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { NewPageButton } from '@/features/create-document';
import type { WorkspaceDetails } from '@/shared/api';
import { routes } from '@/shared/config';
import { cn } from '@/shared/lib';
import { Button } from '@/shared/ui/button';
import { ScrollArea } from '@/shared/ui/scroll-area';
import { DocumentTree } from './DocumentTree';

interface WorkspaceSidebarProps {
  userMenu: ReactNode;
  workspaceId: string;
  workspace: WorkspaceDetails | null;
  editable: boolean;
}

function NavLink({ href, icon, label }: { href: string; icon: ReactNode; label: string }) {
  const active = usePathname() === href;
  return (
    <Button
      asChild
      variant="ghost"
      size="sm"
      className={cn('w-full justify-start', active && 'bg-sidebar-accent')}
    >
      <Link href={href} aria-current={active ? 'page' : undefined}>
        {icon}
        {label}
      </Link>
    </Button>
  );
}

export function WorkspaceSidebar({
  userMenu,
  workspaceId,
  workspace,
  editable,
}: WorkspaceSidebarProps) {
  return (
    <aside className="bg-sidebar text-sidebar-foreground flex w-64 shrink-0 flex-col gap-2 border-r p-2">
      <Link
        href={routes.workspaces}
        className="hover:bg-sidebar-accent truncate rounded-md px-2 py-1.5 text-sm font-semibold"
      >
        {workspace?.name ?? 'Shared with you'}
      </Link>
      {workspace && (
        <>
          <nav aria-label="Workspace" className="grid gap-px">
            <NavLink href={routes.workspace(workspaceId)} icon={<Home />} label="Home" />
            <NavLink
              href={routes.workspaceSettings(workspaceId)}
              icon={<Settings />}
              label="Settings"
            />
          </nav>
          <ScrollArea className="-mx-2 min-h-0 flex-1 px-2">
            <div className="text-muted-foreground px-2 pt-2 pb-1 text-xs font-medium">Pages</div>
            <DocumentTree editable={editable} />
            {editable && <NewPageButton />}
          </ScrollArea>
        </>
      )}
      <div className="mt-auto border-t pt-2">{userMenu}</div>
    </aside>
  );
}
