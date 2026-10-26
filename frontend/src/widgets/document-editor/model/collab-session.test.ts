import { acquireSession, CollabSession, sessionFor } from './collab-session';

const refreshSession = vi.hoisted(() => vi.fn<() => Promise<boolean>>());

vi.mock('@/shared/api', () => ({ refreshSession }));

vi.mock('y-websocket', () => {
  class FakeProvider {
    constructor(
      readonly url: string,
      readonly room: string,
      readonly doc: unknown,
      readonly options: Record<string, unknown>,
    ) {}
    handlers = new Map<string, ((...args: unknown[]) => void)[]>();
    connect = vi.fn();
    disconnect = vi.fn();
    destroy = vi.fn();
    states = new Map<number, Record<string, unknown>>();
    awarenessHandlers: (() => void)[] = [];
    awareness = {
      on: (_: string, handler: () => void) => this.awarenessHandlers.push(handler),
      getStates: () => this.states,
    };
    on(event: string, handler: (...args: unknown[]) => void) {
      this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]);
    }
    emit(event: string, ...args: unknown[]) {
      this.handlers.get(event)?.forEach((handler) => handler(...args));
    }
  }
  return { WebsocketProvider: FakeProvider };
});

type Fake = {
  room: string;
  options: Record<string, unknown>;
  emit: (event: string, ...args: unknown[]) => void;
  states: Map<number, Record<string, unknown>>;
  awarenessHandlers: (() => void)[];
} & Record<'connect' | 'disconnect' | 'destroy', ReturnType<typeof vi.fn>>;
const fake = (session: CollabSession) => session.provider as unknown as Fake;

describe('CollabSession', () => {
  beforeEach(() => refreshSession.mockReset());

  it('reports online once connected and remembers the first sync', () => {
    const session = new CollabSession('doc-1');
    expect(session.getSnapshot()).toEqual({ state: 'connecting', synced: false });

    fake(session).emit('status', { status: 'connected' });
    fake(session).emit('sync', true);
    fake(session).emit('sync', false);

    expect(session.getSnapshot()).toEqual({ state: 'online', synced: true });
  });

  it('stops reconnecting when access was revoked or the document deleted', () => {
    const session = new CollabSession('doc-1');
    fake(session).emit('connection-close', { code: 4404 });
    fake(session).emit('status', { status: 'connecting' });

    expect(fake(session).disconnect).toHaveBeenCalled();
    expect(session.getSnapshot().state).toBe('lost-access');
  });

  it('refreshes an expired session and reconnects', async () => {
    refreshSession.mockResolvedValue(true);
    const session = new CollabSession('doc-1');

    fake(session).emit('connection-close', { code: 4401 });
    await vi.waitFor(() => expect(fake(session).connect).toHaveBeenCalled());

    expect(session.getSnapshot().state).toBe('connecting');
  });

  it('gives up when the session cannot be refreshed', async () => {
    refreshSession.mockResolvedValue(false);
    const session = new CollabSession('doc-1');

    fake(session).emit('connection-close', { code: 4401 });

    await vi.waitFor(() => expect(session.getSnapshot().state).toBe('unauthorized'));
    expect(fake(session).connect).not.toHaveBeenCalled();
  });

  it('tracks who else is in the document', () => {
    const session = new CollabSession('doc-1');
    const listener = vi.fn();
    session.subscribePeople(listener);

    fake(session).states.set(1, { user: { id: 'b', name: 'Bob', color: '#111' } });
    fake(session).awarenessHandlers.forEach((handler) => handler());

    expect(session.getPeople()).toEqual([{ id: 'b', name: 'Bob', color: '#111' }]);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('shows offline when the browser loses the network', () => {
    const session = new CollabSession('doc-1');
    fake(session).emit('status', { status: 'connected' });

    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    window.dispatchEvent(new Event('offline'));
    fake(session).emit('status', { status: 'disconnected' });
    expect(session.getSnapshot().state).toBe('offline');
    expect(fake(session).disconnect).toHaveBeenCalled();

    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    window.dispatchEvent(new Event('online'));
    expect(session.getSnapshot().state).toBe('connecting');
    expect(fake(session).connect).toHaveBeenCalled();
    fake(session).emit('status', { status: 'connected' });
    expect(session.getSnapshot().state).toBe('online');
    session.destroy();
  });
});

describe('session registry', () => {
  afterEach(() => vi.useRealTimers());

  it('shares one connection per document and closes it after the last user leaves', () => {
    vi.useFakeTimers();
    const releaseFirst = acquireSession('doc-2');
    const releaseSecond = acquireSession('doc-2');
    const session = sessionFor('doc-2')!;
    expect(fake(session).connect).toHaveBeenCalledTimes(1);

    releaseFirst();
    vi.runAllTimers();
    expect(sessionFor('doc-2')).toBe(session);

    releaseSecond();
    vi.runAllTimers();
    expect(sessionFor('doc-2')).toBeNull();
    expect(fake(session).destroy).toHaveBeenCalled();
  });

  it('joins through a share link with its own connection', () => {
    vi.useFakeTimers();
    const releaseMember = acquireSession('doc-4');
    const releaseShared = acquireSession('doc-4', 'share-token');
    const shared = sessionFor('doc-4', 'share-token')!;

    expect(shared).not.toBe(sessionFor('doc-4'));
    expect(fake(shared).room).toBe('doc-4');
    expect(fake(shared).options.params).toEqual({ share: 'share-token' });
    expect(fake(sessionFor('doc-4')!).options.params).toEqual({});

    releaseMember();
    releaseShared();
    vi.runAllTimers();
  });

  it('survives an immediate remount such as React strict mode', () => {
    vi.useFakeTimers();
    const release = acquireSession('doc-3');
    const session = sessionFor('doc-3');
    release();
    const releaseAgain = acquireSession('doc-3');
    vi.runAllTimers();

    expect(sessionFor('doc-3')).toBe(session);
    releaseAgain();
    vi.runAllTimers();
  });
});
