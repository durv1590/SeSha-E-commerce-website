import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type TestAgent from 'supertest/lib/agent';
import { MessagingService } from '../../src/messaging/messaging.service';

/**
 * A browser-like client: keeps cookies between requests and sends the CSRF token
 * header on state-changing requests, exactly like the web app's fetch wrapper.
 */
export class BrowserClient {
  readonly agent: TestAgent;
  csrf = '';

  constructor(private readonly app: INestApplication) {
    this.agent = request.agent(app.getHttpServer());
  }

  async init(): Promise<this> {
    const res = await this.agent.get('/api/auth/csrf').expect(200);
    const cookie = ([] as string[])
      .concat(res.headers['set-cookie'] ?? [])
      .find((c) => c.startsWith('sk_csrf='));
    this.csrf = cookie!.split(';')[0]!.split('=')[1]!;
    return this;
  }

  get(url: string) {
    return this.agent.get(url);
  }
  post(url: string, body?: object) {
    return this.agent
      .post(url)
      .set('x-csrf-token', this.csrf)
      .send(body ?? {});
  }
  /** Sends `body` byte-for-byte as JSON (for malformed-input tests). */
  postRaw(url: string, body: string) {
    return this.agent
      .post(url)
      .set('x-csrf-token', this.csrf)
      .set('content-type', 'application/json')
      .send(body);
  }
  patch(url: string, body?: object) {
    return this.agent
      .patch(url)
      .set('x-csrf-token', this.csrf)
      .send(body ?? {});
  }
  put(url: string, body?: object) {
    return this.agent
      .put(url)
      .set('x-csrf-token', this.csrf)
      .send(body ?? {});
  }
  delete(url: string) {
    return this.agent.delete(url).set('x-csrf-token', this.csrf);
  }
}

export async function browser(app: INestApplication): Promise<BrowserClient> {
  return new BrowserClient(app).init();
}

/** Latest OTP code delivered to `to` (tests capture outbound messages). */
export function lastCode(app: INestApplication, to: string): string {
  const outbox = app.get(MessagingService).outbox;
  const msg = [...outbox].reverse().find((m) => m.to === to);
  const code = msg?.text.match(/\b(\d{6})\b/)?.[1];
  if (!code) throw new Error(`No code sent to ${to}`);
  return code;
}

export function messagesTo(app: INestApplication, to: string) {
  return app.get(MessagingService).outbox.filter((m) => m.to === to);
}

export function cookieNames(res: { headers: Record<string, unknown> }): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of ([] as string[]).concat((res.headers['set-cookie'] as string[]) ?? [])) {
    const [pair, ...attrs] = c.split(';');
    out[pair!.split('=')[0]!] = attrs.join(';').trim();
  }
  return out;
}
