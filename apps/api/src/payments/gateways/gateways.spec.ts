import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { GatewayError } from './gateway';
import { hmacHex } from './hmac';
import { MockGateway } from './mock.gateway';
import { RazorpayGateway } from './razorpay.gateway';

describe('RazorpayGateway', () => {
  let server: Server;
  let base: string;
  const seen: { method?: string; url?: string; auth?: string; body?: unknown }[] = [];
  let reply: { status: number; body: unknown } = { status: 200, body: {} };

  beforeAll(async () => {
    server = createServer((req: IncomingMessage, res) => {
      let data = '';
      req.on('data', (c) => (data += c));
      req.on('end', () => {
        seen.push({
          method: req.method,
          url: req.url,
          auth: req.headers.authorization,
          body: data ? JSON.parse(data) : undefined,
        });
        res.writeHead(reply.status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(reply.body));
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise((r) => server.close(r)));
  beforeEach(() => (seen.length = 0));

  const gw = () => new RazorpayGateway('rzp_test_key', 'key-secret', 'hook-secret', base);

  it('creates orders with Basic auth, paise amounts and auto-capture', async () => {
    reply = { status: 200, body: { id: 'order_123' } };
    await expect(
      gw().createOrder({ amount: 49_900, receipt: 'SK1', notes: { orderNumber: 'SK1' } }),
    ).resolves.toEqual({
      providerOrderId: 'order_123',
    });
    expect(seen[0]).toEqual({
      method: 'POST',
      url: '/v1/orders',
      auth: `Basic ${Buffer.from('rzp_test_key:key-secret').toString('base64')}`,
      body: {
        amount: 49_900,
        currency: 'INR',
        receipt: 'SK1',
        notes: { orderNumber: 'SK1' },
        payment_capture: 1,
      },
    });
  });

  it('turns provider errors into a safe GatewayError', async () => {
    reply = { status: 400, body: { error: { description: 'The api key provided is invalid' } } };
    const err = await gw()
      .createOrder({ amount: 100, receipt: 'x', notes: {} })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GatewayError);
    expect((err as Error).message).toBe('The payment service could not process this request.');
    expect((err as Error).message).not.toContain('api key');
  });

  it('fetches payments and refunds', async () => {
    reply = {
      status: 200,
      body: {
        items: [
          { id: 'pay_1', order_id: 'order_1', status: 'captured', amount: 500, method: 'upi' },
        ],
      },
    };
    expect(await gw().fetchOrderPayments('order_1')).toEqual([
      expect.objectContaining({
        providerPaymentId: 'pay_1',
        status: 'captured',
        amount: 500,
        method: 'upi',
      }),
    ]);
    expect(seen[0]!.url).toBe('/v1/orders/order_1/payments');
    reply = { status: 200, body: { id: 'rfnd_1', status: 'processed' } };
    expect(await gw().refund({ providerPaymentId: 'pay_1', amount: 200, notes: {} })).toEqual({
      providerRefundId: 'rfnd_1',
      status: 'processed',
    });
    expect(seen[1]).toMatchObject({
      url: '/v1/payments/pay_1/refund',
      body: { amount: 200, notes: {} },
    });
  });

  it('verifies checkout signatures (order_id|payment_id) and webhook signatures (raw body)', () => {
    const g = gw();
    const good = hmacHex('key-secret', 'order_1|pay_1');
    expect(
      g.verifyPaymentSignature({
        providerOrderId: 'order_1',
        providerPaymentId: 'pay_1',
        signature: good,
      }),
    ).toBe(true);
    expect(
      g.verifyPaymentSignature({
        providerOrderId: 'order_1',
        providerPaymentId: 'pay_2',
        signature: good,
      }),
    ).toBe(false);
    expect(
      g.verifyPaymentSignature({
        providerOrderId: 'order_1',
        providerPaymentId: 'pay_1',
        signature: 'x',
      }),
    ).toBe(false);

    const body = Buffer.from('{"event":"payment.captured"}');
    expect(g.verifyWebhookSignature(body, hmacHex('hook-secret', body))).toBe(true);
    expect(
      g.verifyWebhookSignature(
        Buffer.from('{"event":"payment.captured" }'),
        hmacHex('hook-secret', body),
      ),
    ).toBe(false);
    expect(g.verifyWebhookSignature(body, undefined)).toBe(false);
    // The key secret is not the webhook secret.
    expect(g.verifyWebhookSignature(body, hmacHex('key-secret', body))).toBe(false);
  });

  it('normalises webhook payloads', () => {
    const body = Buffer.from(
      JSON.stringify({
        event: 'order.paid',
        payload: {
          payment: {
            entity: { id: 'pay_9', order_id: 'order_9', status: 'captured', amount: 999 },
          },
        },
      }),
    );
    expect(gw().parseWebhook(body, 'evt_1')).toMatchObject({
      eventId: 'evt_1',
      type: 'payment.captured',
      rawType: 'order.paid',
      payment: { providerPaymentId: 'pay_9', providerOrderId: 'order_9', amount: 999 },
    });
    expect(gw().parseWebhook(body, undefined).eventId).toHaveLength(64);
  });
});

describe('MockGateway', () => {
  it('signs like the real gateway and records simulated payments', async () => {
    const g = new MockGateway('secret');
    const { providerOrderId } = await g.createOrder({ amount: 1234 });
    const p = g.simulatePayment(providerOrderId, 'success');
    expect(p).toMatchObject({ status: 'captured', amount: 1234 });
    expect(
      g.verifyPaymentSignature({
        providerOrderId,
        providerPaymentId: p.providerPaymentId,
        signature: g.signPayment(providerOrderId, p.providerPaymentId),
      }),
    ).toBe(true);
    const body = Buffer.from(g.webhookBody(p));
    expect(g.verifyWebhookSignature(body, g.signWebhook(body))).toBe(true);
    expect(g.parseWebhook(body, undefined).type).toBe('payment.captured');
    expect(await g.fetchOrderPayments(providerOrderId)).toHaveLength(1);
  });
});
