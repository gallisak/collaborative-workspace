import {
  Inject,
  Injectable,
  Logger,
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
import { documentIdFromUrl, isAllowedOrigin } from './connection-request.js';
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
import { RoomsService } from './rooms.service.js';

class ConnectionRejected extends Error {
  constructor(
    readonly code: number,
    reason: string,
  ) {
    super(reason);
  }
}

const toBytes = (data: RawData): Uint8Array =>
  data instanceof ArrayBuffer
    ? new Uint8Array(data)
    : Array.isArray(data)
      ? new Uint8Array(Buffer.concat(data))
      : new Uint8Array(data);

@Injectable()
export class CollabGateway implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(CollabGateway.name);
  private readonly allowedOrigins: string[];
  private readonly heartbeatMs: number;
  private readonly wss: WebSocketServer;
  private readonly alive = new WeakSet<WebSocket>();
  private readonly subscriber: Redis;
  private heartbeat: NodeJS.Timeout | undefined;
  private server: Server | undefined;

  constructor(
    private readonly adapterHost: HttpAdapterHost,
    private readonly rooms: RoomsService,
    private readonly tokens: TokenService,
    private readonly users: UsersService,
    private readonly documentAccess: DocumentAccessService,
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
    this.heartbeat = setInterval(() => this.checkHeartbeats(), this.heartbeatMs);
    this.subscriber.on('message', (_channel: string, workspaceId: string) => {
      void this.recheckWorkspace(workspaceId);
    });
    await this.subscriber.subscribe(ACCESS_CHANGED_CHANNEL);
  }

  async onApplicationShutdown() {
    clearInterval(this.heartbeat);
    this.server?.off('upgrade', this.onUpgrade);
    await this.rooms.closeAll();
    this.wss.close();
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
      if (client && room) {
        room.leave(client);
        void this.rooms.release(room);
      }
    });

    try {
      const { documentId, workspaceId, user, canWrite } = await this.authenticate(req);
      client = { socket, user, canWrite, clientIds: new Set() };
      room = await this.rooms.join(documentId, workspaceId, client);
      if (socket.readyState !== socket.OPEN) {
        room.leave(client);
        void this.rooms.release(room);
        return;
      }
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
    const resolved = await this.documentAccess
      .resolve(documentId, user.id)
      .catch(() =>
        Promise.reject(new ConnectionRejected(CloseCode.NotFound, 'Document not found')),
      );
    return {
      documentId,
      workspaceId: resolved.document.workspaceId,
      user: { id: user.id, name: user.name },
      canWrite: canEdit(resolved.access),
    };
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

  private async recheckWorkspace(workspaceId: string) {
    for (const room of this.rooms.inWorkspace(workspaceId)) {
      for (const client of [...room.clients.values()]) {
        try {
          const { access } = await this.documentAccess.resolve(room.documentId, client.user.id);
          client.canWrite = canEdit(access);
        } catch {
          client.socket.close(CloseCode.NotFound, 'Access revoked or document deleted');
        }
      }
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
