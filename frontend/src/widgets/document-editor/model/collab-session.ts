import { WebsocketProvider } from 'y-websocket';
import * as Y from 'yjs';
import { refreshSession } from '@/shared/api';
import { publicEnv } from '@/shared/config';
import { type Collaborator, collaboratorsFrom } from './presence';

export const CloseCode = {
  Unauthorized: 4401,
  Forbidden: 4403,
  NotFound: 4404,
} as const;

export type ConnectionState = 'connecting' | 'online' | 'offline' | 'unauthorized' | 'lost-access';

export interface SessionSnapshot {
  state: ConnectionState;
  synced: boolean;
}

export class CollabSession {
  readonly doc = new Y.Doc();
  readonly provider: WebsocketProvider;
  private snapshot: SessionSnapshot = { state: 'connecting', synced: false };
  private readonly listeners = new Set<() => void>();
  private people: Collaborator[] = [];
  private readonly peopleListeners = new Set<() => void>();
  private browserOnline = typeof navigator === 'undefined' ? true : navigator.onLine;

  constructor(readonly documentId: string) {
    this.provider = new WebsocketProvider(
      `${publicEnv.NEXT_PUBLIC_COLLAB_URL}/documents`,
      documentId,
      this.doc,
      { connect: false, disableBc: true },
    );
    this.provider.on('status', ({ status }) => {
      if (this.isTerminal() || !this.browserOnline) {
        return;
      }
      this.set({ state: status === 'connected' ? 'online' : this.disconnectedState() });
    });
    this.provider.on('sync', (synced: boolean) =>
      this.set({ synced: synced || this.snapshot.synced }),
    );
    this.provider.on('connection-close', (event) => this.onClose(event?.code));
    this.provider.awareness.on('change', this.onAwareness);
    window.addEventListener('online', this.onNetworkChange);
    window.addEventListener('offline', this.onNetworkChange);
  }

  connect() {
    if (!this.isTerminal()) {
      this.provider.connect();
    }
  }

  destroy() {
    window.removeEventListener('online', this.onNetworkChange);
    window.removeEventListener('offline', this.onNetworkChange);
    this.provider.destroy();
    this.doc.destroy();
  }

  getSnapshot = () => this.snapshot;

  getPeople = () => this.people;

  subscribePeople = (listener: () => void) => {
    this.peopleListeners.add(listener);
    return () => this.peopleListeners.delete(listener);
  };

  private onAwareness = () => {
    this.people = collaboratorsFrom(this.provider.awareness.getStates().values(), '');
    this.peopleListeners.forEach((listener) => listener());
  };

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private onNetworkChange = () => {
    this.browserOnline = navigator.onLine;
    if (this.isTerminal()) {
      return;
    }
    if (this.browserOnline) {
      this.set({ state: 'connecting' });
      this.provider.connect();
    } else {
      this.provider.disconnect();
      this.set({ state: 'offline' });
    }
  };

  private async onClose(code: number | undefined) {
    if (code === CloseCode.NotFound || code === CloseCode.Forbidden) {
      this.provider.disconnect();
      this.set({ state: 'lost-access' });
      return;
    }
    if (code === CloseCode.Unauthorized) {
      this.provider.disconnect();
      if (await refreshSession()) {
        this.provider.connect();
      } else {
        this.set({ state: 'unauthorized' });
      }
    }
  }

  private disconnectedState(): ConnectionState {
    return this.browserOnline ? 'connecting' : 'offline';
  }

  private isTerminal() {
    return this.snapshot.state === 'lost-access' || this.snapshot.state === 'unauthorized';
  }

  private set(patch: Partial<SessionSnapshot>) {
    const next = { ...this.snapshot, ...patch };
    if (next.state !== this.snapshot.state || next.synced !== this.snapshot.synced) {
      this.snapshot = next;
      this.listeners.forEach((listener) => listener());
    }
  }
}

const sessions = new Map<string, { session: CollabSession; refs: number; release?: number }>();
const registryListeners = new Set<() => void>();
const notify = () => registryListeners.forEach((listener) => listener());

export const subscribeSessions = (listener: () => void) => {
  registryListeners.add(listener);
  return () => registryListeners.delete(listener);
};

export const sessionFor = (documentId: string) => sessions.get(documentId)?.session ?? null;

export function acquireSession(documentId: string) {
  let entry = sessions.get(documentId);
  if (!entry) {
    entry = { session: new CollabSession(documentId), refs: 0 };
    sessions.set(documentId, entry);
    entry.session.connect();
    notify();
  }
  window.clearTimeout(entry.release);
  entry.refs++;
  const current = entry;
  return () => {
    current.refs--;
    if (current.refs > 0) {
      return;
    }
    current.release = window.setTimeout(() => {
      if (current.refs === 0 && sessions.get(documentId) === current) {
        sessions.delete(documentId);
        current.session.destroy();
        notify();
      }
    });
  };
}
