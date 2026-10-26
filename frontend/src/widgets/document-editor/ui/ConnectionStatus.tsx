import { CloudOff, Loader2, RefreshCw, ShieldAlert, TriangleAlert, Wifi } from 'lucide-react';
import type { SessionSnapshot } from '../model/collab-session';

const STATUS = {
  online: { icon: Wifi, label: 'Saved', tone: 'text-muted-foreground' },
  connecting: { icon: Loader2, label: 'Connecting…', tone: 'text-muted-foreground' },
  offline: {
    icon: CloudOff,
    label: 'Offline: changes are kept and will sync when you reconnect',
    tone: 'text-amber-600',
  },
  'lost-access': { icon: ShieldAlert, label: 'No access', tone: 'text-destructive' },
  unauthorized: { icon: ShieldAlert, label: 'Signed out', tone: 'text-destructive' },
  'access-changed': {
    icon: RefreshCw,
    label: 'Your access changed, reloading…',
    tone: 'text-amber-600',
  },
  failed: {
    icon: TriangleAlert,
    label: 'Sync failed: copy your changes and reload the page',
    tone: 'text-destructive',
  },
} as const;

export function ConnectionStatus({ snapshot }: { snapshot: SessionSnapshot }) {
  const { icon: Icon, label, tone } = STATUS[snapshot.state];
  return (
    <p role="status" aria-live="polite" className={`flex items-center gap-1.5 text-xs ${tone}`}>
      <Icon className={`size-3.5 ${snapshot.state === 'connecting' ? 'animate-spin' : ''}`} />
      <span>{label}</span>
    </p>
  );
}
