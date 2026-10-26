import { AtSign } from 'lucide-react';
import Link from 'next/link';
import { displayTitle } from '@/entities/document';
import { formatBytes, SeatsMeter, UsageMeter } from '@/entities/plan';
import { ROLE_LABELS } from '@/entities/workspace';
import { routes } from '@/shared/config';
import { load } from '@/shared/dal';
import { relativeTime } from '@/shared/lib';
import { Avatar, AvatarFallback } from '@/shared/ui/avatar';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';

interface SectionProps {
  params: Promise<{ workspaceId: string }>;
}

const MEMBERS_SHOWN = 5;
const MENTIONS_SHOWN = 5;
const NOTIFICATIONS_SCANNED = 50;

const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

export async function MembersSection({ params }: SectionProps) {
  const { workspaceId } = await params;
  const members = await load((api) =>
    api.GET('/api/workspaces/{workspaceId}/members', { params: { path: { workspaceId } } }),
  );
  return (
    <div className="grid gap-3">
      <ul className="grid gap-2" aria-label="Members">
        {members.slice(0, MEMBERS_SHOWN).map((member) => (
          <li key={member.userId} className="flex items-center gap-2 text-sm">
            <Avatar className="size-7">
              <AvatarFallback className="text-xs">{initials(member.name)}</AvatarFallback>
            </Avatar>
            <span className="min-w-0 flex-1 truncate">{member.name}</span>
            <Badge variant="secondary">{ROLE_LABELS[member.role]}</Badge>
          </li>
        ))}
      </ul>
      {members.length > MEMBERS_SHOWN && (
        <p className="text-muted-foreground text-xs">and {members.length - MEMBERS_SHOWN} more</p>
      )}
      <Button asChild variant="outline" size="sm" className="w-fit">
        <Link href={routes.workspaceSettings(workspaceId)}>Manage members</Link>
      </Button>
    </div>
  );
}

export async function PlanSection({ params }: SectionProps) {
  const { workspaceId } = await params;
  const { plan, usage } = await load((api) =>
    api.GET('/api/workspaces/{workspaceId}/billing', { params: { path: { workspaceId } } }),
  );
  return (
    <div className="grid gap-3">
      <p className="text-sm font-medium">{plan.name} plan</p>
      <SeatsMeter usage={usage} limit={plan.maxMembers} />
      <UsageMeter label="Documents" used={usage.documents} limit={plan.maxDocuments} />
      <UsageMeter
        label="Storage"
        used={usage.storageBytes}
        limit={plan.maxStorageBytes}
        format={formatBytes}
      />
      <Button asChild variant="outline" size="sm" className="w-fit">
        <Link href={routes.workspaceBilling(workspaceId)}>View plans</Link>
      </Button>
    </div>
  );
}

export async function MentionsSection({ params }: SectionProps) {
  const { workspaceId } = await params;
  const notifications = await load((api) =>
    api.GET('/api/notifications', { params: { query: { limit: NOTIFICATIONS_SCANNED } } }),
  );
  const mentions = notifications
    .flatMap(({ id, actor, document, comment, createdAt }) =>
      document?.workspaceId === workspaceId && comment
        ? [{ id, actor, document, comment, createdAt }]
        : [],
    )
    .slice(0, MENTIONS_SHOWN);
  if (mentions.length === 0) {
    return <p className="text-muted-foreground text-sm">Nobody has mentioned you here yet.</p>;
  }
  return (
    <ul className="grid gap-1" aria-label="Mentions">
      {mentions.map((item) => (
        <li key={item.id}>
          <Link
            href={`${routes.document(workspaceId, item.document.id)}?thread=${item.comment.threadId}`}
            className="hover:bg-accent grid gap-0.5 rounded-md px-2 py-1.5 text-sm"
          >
            <span className="flex items-center gap-1.5">
              <AtSign className="text-muted-foreground size-3.5 shrink-0" />
              <span className="truncate">
                <span className="font-medium">{item.actor?.name ?? 'Someone'}</span> in{' '}
                {displayTitle(item.document.title)}
              </span>
            </span>
            <span className="text-muted-foreground line-clamp-1 text-xs">
              {item.comment.excerpt} · {relativeTime(item.createdAt)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
