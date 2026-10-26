import { cn } from '@/shared/lib';
import { formatLimit, usageShare } from '../model/format';

interface UsageMeterProps {
  label: string;
  used: number;
  limit: number | null;
  note?: string;
  format?: (value: number) => string;
}

export function UsageMeter({ label, used, limit, note, format = String }: UsageMeterProps) {
  const share = usageShare(used, limit);
  return (
    <div className="grid gap-1.5">
      <div className="flex justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">
          {format(used)} of {formatLimit(limit, format)}
        </span>
      </div>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={share}
        className="bg-muted h-2 overflow-hidden rounded-full"
      >
        <div
          className={cn('h-full rounded-full', share >= 100 ? 'bg-destructive' : 'bg-primary')}
          style={{ width: `${share}%` }}
        />
      </div>
      {note && <p className="text-muted-foreground text-xs">{note}</p>}
    </div>
  );
}

interface SeatsMeterProps {
  usage: { members: number; pendingInvitations: number };
  limit: number | null;
}

export function SeatsMeter({ usage, limit }: SeatsMeterProps) {
  const pending = usage.pendingInvitations;
  return (
    <UsageMeter
      label="Members"
      used={usage.members + pending}
      limit={limit}
      note={
        pending > 0
          ? `Includes ${pending} pending ${pending === 1 ? 'invitation' : 'invitations'}`
          : undefined
      }
    />
  );
}
