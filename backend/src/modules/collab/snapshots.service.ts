import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Y from 'yjs';
import type { VersionKind } from '../../generated/prisma/enums.js';
import type { Env } from '../../infra/config/env.schema.js';
import { shouldTakeAutoVersion } from './document-content.js';
import type { Room } from './room.js';
import { VersionStore } from './version-store.js';

@Injectable()
export class SnapshotsService {
  private readonly logger = new Logger(SnapshotsService.name);
  private readonly intervalMs: number;
  private readonly keepAuto: number;

  constructor(
    private readonly versions: VersionStore,
    config: ConfigService<Env, true>,
  ) {
    this.intervalMs = config.get('VERSION_INTERVAL_MS', { infer: true });
    this.keepAuto = config.get('VERSION_RETENTION_AUTO', { infer: true });
  }

  async lastVersionAt(documentId: string): Promise<Date> {
    return (await this.versions.latestCreatedAt(documentId)) ?? new Date();
  }

  async takeIfDue(room: Room) {
    if (
      shouldTakeAutoVersion(
        room.changedSinceVersion,
        room.lastVersionAt,
        new Date(),
        this.intervalMs,
      )
    ) {
      await this.take(room, 'AUTO', null, null);
    }
  }

  async takeIfChanged(room: Room) {
    if (room.changedSinceVersion) {
      await this.take(room, 'AUTO', null, null);
    }
  }

  async take(room: Room, kind: VersionKind, name: string | null, userId: string | null) {
    room.changedSinceVersion = false;
    const version = await this.versions.create({
      documentId: room.documentId,
      kind,
      name,
      state: Y.encodeStateAsUpdate(room.doc),
      createdById: userId,
    });
    room.lastVersionAt = version.createdAt;
    if (kind === 'AUTO') {
      await this.versions.pruneAuto(room.documentId, this.keepAuto);
    }
    this.logger.log(
      { documentId: room.documentId, versionId: version.id, kind, userId },
      'Document version saved',
    );
    return version;
  }
}
