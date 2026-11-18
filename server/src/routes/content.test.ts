import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ClientsResponse, ProductsResponse, PublicClient } from '@bank-sim/shared';
import { createApp } from '../app.js';
import { loadContent } from '../content.js';

const content = loadContent();
let server: Server;
let baseUrl: string;

beforeAll(async () => {
  server = createApp(content).listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  baseUrl = `http://localhost:${(server.address() as AddressInfo).port}/api`;
});

afterAll(() => {
  server.close();
});

describe('content API', () => {
  it('GET /clients returns the public client summaries', async () => {
    const res = await fetch(`${baseUrl}/clients`);
    const body = (await res.json()) as ClientsResponse;

    expect(res.status).toBe(200);
    expect(body.clients.map((c) => c.id)).toEqual(['maria', 'ahmed', 'noura']);
  });

  it('GET /clients/:id returns one client', async () => {
    const res = await fetch(`${baseUrl}/clients/ahmed`);
    const body = (await res.json()) as PublicClient;

    expect(res.status).toBe(200);
    expect(body.name).toBe('Ahmed Al-Sayed');
  });

  it('GET /clients/:id returns a JSON 404 for an unknown client', async () => {
    const res = await fetch(`${baseUrl}/clients/nobody`);

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      error: { code: 'NOT_FOUND', message: 'No client with id "nobody".' },
    });
  });

  it('GET /products returns the bank and full catalogue', async () => {
    const res = await fetch(`${baseUrl}/products`);
    const body = (await res.json()) as ProductsResponse;

    expect(res.status).toBe(200);
    expect(body.bank.name).toBe('Pearl Coast Bank');
    expect(body.products).toHaveLength(9);
  });

  it('never sends hidden needs or the answer key to the browser', async () => {
    const urls = [
      `${baseUrl}/clients`,
      `${baseUrl}/products`,
      ...content.clients.map((c) => `${baseUrl}/clients/${c.id}`),
    ];
    const responses = await Promise.all(urls.map((url) => fetch(url).then((r) => r.text())));
    const everything = responses.join('\n');

    for (const client of content.clients) {
      expect(everything).not.toContain(client.profile.background);
      expect(everything).not.toContain(client.profile.personality);
      for (const need of client.needs) {
        expect(everything).not.toContain(need.description);
      }
      for (const entry of [...client.productFit.suitable, ...client.productFit.unsuitable]) {
        expect(everything).not.toContain(entry.reason);
      }
    }
    for (const key of ['revealWhen', 'productFit', 'exampleQuestions', 'personality']) {
      expect(everything).not.toContain(`"${key}"`);
    }
  });
});
