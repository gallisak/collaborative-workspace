import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../infra/config/env.schema.js';

const TIMEOUT_MS = 5000;

@Injectable()
export class RevalidationClient {
  private readonly url: string;
  private readonly secret: string;

  constructor(config: ConfigService<Env, true>) {
    this.url = config.get('REVALIDATE_URL', { infer: true });
    this.secret = config.get('REVALIDATE_SECRET', { infer: true });
  }

  async revalidate(documentId: string) {
    const response = await fetch(this.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.secret}` },
      body: JSON.stringify({ documentId }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`Revalidation endpoint responded with ${response.status}`);
    }
  }
}
