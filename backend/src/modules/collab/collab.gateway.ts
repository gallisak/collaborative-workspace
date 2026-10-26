import {
  type BeforeApplicationShutdown,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpAdapterHost } from '@nestjs/core';
import { parseCookie } from 'cookie';
import type { Redis } from 'ioredis';
import * as decoding from 'lib0/decoding';
import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { type RawData, type WebSocket, WebSocketServer } from 'ws';
import { applyAwarenessUpdate } from 'y-protocols/awareness';
import { ACCESS_COOKIE } from '../../common/auth/auth-cookies.js';
import { ACCESS_CHANGED_CHANNEL } from '../../infra/collab-events/collab-events.js';
import type { Env } from '../../infra/config/env.schema.js';
import { REDIS } from '../../infra/redis/redis.module.js';
import { TokenService } from '../auth/token.service.js';
import { canEdit } from '../permissions/document-access.js';
import { DocumentAccessService } from '../permissions/document-access.service.js';
import { UsersService } from '../users/users.service.js';
import { CollabJobsProcessor } from './collab-jobs.processor.js';
import { documentIdFromUrl, isAllowedOrigin, shareTokenFromUrl } from './connection-request.js';
import {
  CloseCode,
  encodeAwareness,
  encodeSyncStep1,
  handleSyncMessage,
  MESSAGE_AWARENESS,
  MESSAGE_QUERY_AWARENESS,
  MESSAGE_SYNC,
  sanitizeAwarenessUpdate,
} from './protocol.js';
import { type CollabClient, type Room, send } from './room.js';
import { RoomsClosedError, RoomsService } from './rooms.service.js';

class ConnectionRejected extends Error {
  constructor(
    readonly code: number,
    reason: string,
  ) {
    super(reason);
  }
}

const MAX_TIMER_MS = 2 ** 31 - 1;

const toBytes = (data: RawData): Uint8Array =>
  data instanceof ArrayBuffer
    ? new Uint8Array(data)
    : Array.isArray(data)
      ? new Uint8Array(Buffer.concat(data))
      : new Uint8Array(data);

@Injectable()
export class CollabGateway
  implements OnApplicationBootstrap, BeforeApplicationShutdown, OnApplicationShutdown
{
  private readonly logger = new Logger(CollabGateway.name);
  private readonly allowedOrigins: string[];
  private readonly heartbeatMs: number;
  private readonly wss: WebSocketServer;
  private readonly alive = new WeakSet<WebSocket>();
  private readonly subscriber: Redis;
  private heartbeat: NodeJS.Timeout | undefined;
  private server: Server | undefined;
  private rechecking = false;

  constructor(
    private readonly adapterHost: HttpAdapterHost,
    private readonly rooms: RoomsService,
    private readonly tokens: TokenService,
    private readonly users: UsersService,
    private readonly documentAccess: DocumentAccessService,
    private readonly jobs: CollabJobsProcessor,
    @Inject(REDIS) redis: Redis,
    config: ConfigService<Env, true>,
  ) {
    this.allowedOrigins = config.get('CORS_ORIGIN', { infer: true }).split(',');
    this.heartbeatMs = config.get('COLLAB_HEARTBEAT_MS', { infer: true });
    this.wss = new WebSocketServer({
      noServer: true,
      maxPayload: config.get('COLLAB_MAX_MESSAGE_BYTES', { infer: true }),
    });
    this.subscriber = redis.duplicate({ enableOfflineQueue: true, maxRetriesPerRequest: null });
  }

  async onApplicationBootstrap() {
    this.server = this.adapterHost.httpAdapter.getHttpServer() as Server;
    this.server.on('upgrade', this.onUpgrade);
    this.heartbeat = setInterval(() => {
      this.checkHeartbeats();
      void this.recheckAll();
    }, this.heartbeatMs);
    this.subscriber.on('message', (_channel: string, workspaceId: string) => {
      void this.recheckClients(this.clientsOf(this.rooms.inWorkspace(workspaceId)));
    });
    this.subscriber.on('ready', () => void this.recheckAll());
    await this.subscriber.subscribe(ACCESS_CHANGED_CHANNEL);
  }

  async beforeApplicationShutdown() {
    clearInterval(this.heartbeat);
    this.server?.off('upgrade', this.onUpgrade);
    await this.jobs.worker.close();
    await this.rooms.closeAll();
    for (const socket of this.wss.clients) {
      socket.terminate();
    }
    this.wss.close();
  }

  onApplicationShutdown() {
    this.subscriber.disconnect();
  }

  private readonly onUpgrade = (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    this.wss.handleUpgrade(req, socket, head, (ws) => void this.onConnection(ws, req));
  };

  private async onConnection(socket: WebSocket, req: IncomingMessage) {
    const buffered: Uint8Array[] = [];
    let client: CollabClient | undefined;
    let room: Room | undefined;

    this.alive.add(socket);
    socket.on('pong', () => this.alive.add(socket));
    socket.on('message', (data) => {
      const message = toBytes(data);
      if (client && room) {
        this.onMessage(room, client, message);
      } else {
        buffered.push(message);
      }
    });
    socket.on('close', () => {
      clearTimeout(client?.expiry);
      if (client && room) {
        room.leave(client);
        void this.rooms.release(room);
      }
    });

    try {
      const { documentId, workspaceId, user, canWrite, accessToken, shareToken, linkExpiresAt } =
        await this.authenticate(req);
      client = { socket, user, canWrite, accessToken, shareToken, clientIds: new Set() };
      room = await this.rooms.join(documentId, workspaceId, client);
      if (socket.readyState !== socket.OPEN) {
        room.leave(client);
        void this.rooms.release(room);
        return;
      }
      this.scheduleExpiry(room, client, linkExpiresAt);
      send(socket, encodeSyncStep1(room.doc));
      const presence = [...room.awareness.getStates().keys()];
      if (presence.length > 0) {
        send(socket, encodeAwareness(room.awareness, presence));
      }
      for (const message of buffered.splice(0)) {
        this.onMessage(room, client, message);
      }
      this.logger.log({ documentId, userId: user.id, canWrite }, 'Collaborator connected');
    } catch (error) {
      client = undefined;
      room = undefined;
      if (error instanceof ConnectionRejected) {
        socket.close(error.code, error.message);
      } else if (error instanceof RoomsClosedError) {
        socket.close(CloseCode.ServerRestart, 'Server restarting');
      } else {
        this.logger.error({ err: error }, 'Collaboration connection failed');
        socket.close(1011, 'Internal error');
      }
    }
  }

  private async authenticate(req: IncomingMessage) {
    if (!isAllowedOrigin(req.headers.origin, this.allowedOrigins)) {
      throw new ConnectionRejected(CloseCode.Forbidden, 'Origin not allowed');
    }
    const documentId = documentIdFromUrl(req.url);
    if (!documentId) {
      throw new ConnectionRejected(CloseCode.NotFound, 'Unknown document');
    }
    const token = parseCookie(req.headers.cookie ?? '')[ACCESS_COOKIE];
    if (!token) {
      throw new ConnectionRejected(CloseCode.Unauthorized, 'Not authenticated');
    }
    const auth = await this.tokens
      .verifyAccessToken(token)
      .catch(() => Promise.reject(new ConnectionRejected(CloseCode.Unauthorized, 'Invalid token')));
    const user = await this.users.findById(auth.id);
    if (!user) {
      throw new ConnectionRejected(CloseCode.Unauthorized, 'Not authenticated');
    }
    const shareToken = shareTokenFromUrl(req.url);
    const resolved = await this.access(documentId, user.id, shareToken).catch((error: unknown) => {
      throw error instanceof NotFoundException
        ? new ConnectionRejected(CloseCode.NotFound, 'Document not found')
        : error;
    });
    return {
      documentId,
      workspaceId: resolved.document.workspaceId,
      user: { id: user.id, name: user.name },
      canWrite: canEdit(resolved.access),
      accessToken: token,
      shareToken,
      linkExpiresAt: resolved.linkExpiresAt,
    };
  }

  private access(documentId: string, userId: string, shareToken: string | null) {
    return shareToken
      ? this.documentAccess.resolveWithLink(documentId, userId, shareToken)
      : this.documentAccess
          .resolve(documentId, userId)
          .then((resolved) => ({ ...resolved, linkExpiresAt: null }));
  }

  private onMessage(room: Room, client: CollabClient, message: Uint8Array) {
    try {
      const decoder = decoding.createDecoder(message);
      switch (decoding.readVarUint(decoder)) {
        case MESSAGE_SYNC: {
          const outcome = handleSyncMessage(decoder, room.doc, client, client.canWrite);
          if (outcome.kind === 'reply') {
            send(client.socket, outcome.message);
          } else if (outcome.kind === 'rejected' && !outcome.initialSync) {
            this.logger.warn(
              { documentId: room.documentId, userId: client.user.id },
              'Rejected an edit from a read-only collaborator',
            );
          }
          return;
        }
        case MESSAGE_AWARENESS: {
          const sanitized = sanitizeAwarenessUpdate(
            decoding.readVarUint8Array(decoder),
            (clientId) => room.canControl(client, clientId),
            client.user,
          );
          if (sanitized) {
            room.claim(client, sanitized.clientIds);
            applyAwarenessUpdate(room.awareness, sanitized.update, client);
          }
          return;
        }
        case MESSAGE_QUERY_AWARENESS:
          send(
            client.socket,
            encodeAwareness(room.awareness, [...room.awareness.getStates().keys()]),
          );
          return;
        default:
          throw new Error('Unknown message type');
      }
    } catch (error) {
      this.logger.warn(
        { err: error, documentId: room.documentId, userId: client.user.id },
        'Malformed collaboration message',
      );
      client.socket.close(CloseCode.BadRequest, 'Malformed message');
    }
  }

  private clientsOf(rooms: Room[]) {
    return rooms.flatMap((room) => [...room.clients.values()].map((client) => ({ room, client })));
  }

  private async recheckAll() {
    if (this.rechecking) {
      return;
    }
    this.rechecking = true;
    try {
      await this.recheckClients(this.clientsOf(this.rooms.all()));
    } finally {
      this.rechecking = false;
    }
  }

  private async recheckClients(sessions: { room: Room; client: CollabClient }[]) {
    for (const { room, client } of sessions) {
      await this.recheck(room, client);
    }
  }

  private scheduleExpiry(room: Room, client: CollabClient, at: Date | null) {
    clearTimeout(client.expiry);
    client.expiry = undefined;
    if (at) {
      const delay = Math.min(Math.max(0, at.getTime() - Date.now()), MAX_TIMER_MS);
      client.expiry = setTimeout(() => void this.recheck(room, client), delay);
    }
  }

  private async recheck(room: Room, client: CollabClient) {
    if (client.socket.readyState !== client.socket.OPEN) {
      return;
    }
    try {
      if (await this.tokens.isAccessTokenRevoked(client.accessToken)) {
        client.socket.close(CloseCode.Unauthorized, 'Session ended');
        return;
      }
      const resolved = await this.access(room.documentId, client.user.id, client.shareToken);
      const canWrite = canEdit(resolved.access);
      if (canWrite !== client.canWrite) {
        client.canWrite = canWrite;
        client.socket.close(CloseCode.AccessChanged, 'Access level changed');
        return;
      }
      this.scheduleExpiry(room, client, resolved.linkExpiresAt);
    } catch (error) {
      if (error instanceof NotFoundException) {
        client.canWrite = false;
        client.socket.close(CloseCode.NotFound, 'Access revoked or document deleted');
        return;
      }
      this.logger.warn(
        { err: error, documentId: room.documentId, userId: client.user.id },
        'Access recheck failed',
      );
    }
  }

  private checkHeartbeats() {
    for (const socket of this.wss.clients) {
      if (!this.alive.has(socket)) {
        socket.terminate();
        continue;
      }
      this.alive.delete(socket);
      socket.ping();
    }
  }
}
