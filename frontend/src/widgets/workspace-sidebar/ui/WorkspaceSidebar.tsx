'use client';

import { CreditCard, FileText, Home, Search, Settings } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { displayTitle } from '@/entities/document';
import { NewPageButton } from '@/features/create-document';
import type { SharedDocument, WorkspaceDetails } from '@/shared/api';
import { routes } from '@/shared/config';
import { cn } from '@/shared/lib';
import { Button } from '@/shared/ui/button';
import { ScrollArea } from '@/shared/ui/scroll-area';
import { DocumentTree } from './DocumentTree';

interface WorkspaceSidebarProps {
  userMenu: ReactNode;
  notifications: ReactNode;
  workspaceId: string;
  workspace: WorkspaceDetails | null;
  shared: readonly SharedDocument[];
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
  notifications,
  workspaceId,
  workspace,
  shared,
  editable,
}: WorkspaceSidebarProps) {
  const pathname = usePathname();
  return (
    <aside className="bg-sidebar text-sidebar-foreground flex w-64 shrink-0 flex-col gap-2 border-r p-2">
      <Link
        href={routes.workspaces}
        className="hover:bg-sidebar-accent truncate rounded-md px-2 py-1.5 text-sm font-semibold"
      >
        {workspace?.name ?? 'Shared with you'}
      </Link>
      {!workspace && (
        <ScrollArea className="-mx-2 min-h-0 flex-1 px-2">
          <ul aria-label="Pages shared with you" className="grid gap-px">
            {shared.map((document) => {
              const href = routes.document(document.workspaceId, document.id);
              return (
                <li key={document.id}>
                  <Link
                    href={href}
                    aria-current={pathname === href ? 'page' : undefined}
                    className={cn(
                      'hover:bg-sidebar-accent flex h-8 items-center gap-1.5 rounded-md px-2 text-sm',
                      pathname === href && 'bg-sidebar-accent font-medium',
                    )}
                  >
                    <FileText className="text-muted-foreground size-4 shrink-0" />
                    <span className="truncate">{displayTitle(document.title)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </ScrollArea>
      )}
      {workspace && (
        <>
          <nav aria-label="Workspace" className="grid gap-px">
            <NavLink href={routes.workspace(workspaceId)} icon={<Home />} label="Home" />
            <NavLink href={routes.workspaceSearch(workspaceId)} icon={<Search />} label="Search" />
            <NavLink
              href={routes.workspaceSettings(workspaceId)}
              icon={<Settings />}
              label="Settings"
            />
            <NavLink
              href={routes.workspaceBilling(workspaceId)}
              icon={<CreditCard />}
              label="Billing"
            />
          </nav>
          <ScrollArea className="-mx-2 min-h-0 flex-1 px-2">
            <div className="text-muted-foreground px-2 pt-2 pb-1 text-xs font-medium">Pages</div>
            <DocumentTree editable={editable} />
            {editable && <NewPageButton />}
          </ScrollArea>
        </>
      )}
      <div className="mt-auto flex items-center gap-1 border-t pt-2">
        <div className="min-w-0 flex-1">{userMenu}</div>
        {notifications}
      </div>
    </aside>
  );
}
