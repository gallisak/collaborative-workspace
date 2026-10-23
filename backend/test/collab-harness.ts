import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { AddressInfo } from 'node:net';
import { WebSocket } from 'ws';
import { WebsocketProvider } from 'y-websocket';
import * as Y from 'yjs';
import { CollabModule } from '../src/collab.module.js';
import { WEB_ORIGIN } from './helpers.js';

export const eventually = async (check: () => boolean | Promise<boolean>, timeoutMs = 5000) => {
  const started = Date.now();
  while (!(await check())) {
    if (Date.now() - started > timeoutMs) {
      throw new Error('Condition not met in time');
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
};

export async function startCollab() {
  const moduleRef = await Test.createTestingModule({ imports: [CollabModule] }).compile();
  const app: INestApplication = moduleRef.createNestApplication({ bufferLogs: true });
  await app.listen(0, '127.0.0.1');
  const { port } = app.getHttpServer().address() as AddressInfo;
  const providers: WebsocketProvider[] = [];

  const connect = (
    documentId: string,
    { cookies, origin = WEB_ORIGIN, share }: { cookies?: string; origin?: string; share?: string },
  ) => {
    const headers = { Origin: origin, ...(cookies && { Cookie: cookies }) };
    class AuthenticatedSocket extends WebSocket {
      constructor(url: string, protocols?: string | string[]) {
        super(url, protocols, { headers });
      }
    }
    const doc = new Y.Doc();
    const provider = new WebsocketProvider(`ws://127.0.0.1:${port}/documents`, documentId, doc, {
      WebSocketPolyfill: AuthenticatedSocket as unknown as typeof globalThis.WebSocket,
      disableBc: true,
      params: share ? { share } : {},
    });
    providers.push(provider);
    const closedWith = new Promise<number>((resolve) =>
      provider.on('closed', (event) => resolve(event.code)),
    );
    const synced = new Promise<void>((resolve) =>
      provider.on('sync', (isSynced: boolean) => isSynced && resolve()),
    );
    return { doc, provider, synced, closedWith };
  };

  const disconnectAll = () => providers.splice(0).forEach((provider) => provider.destroy());

  return { app, connect, disconnectAll };
}
