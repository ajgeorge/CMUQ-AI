import { Router } from 'express';
import type { ClientsResponse, ProductsResponse } from '@bank-sim/shared';
import { toPublicClient, type Content } from '../content.js';
import { sendError } from '../http.js';

/**
 * Read-only content endpoints. Only public client fields are ever returned;
 * hidden needs and the product-fit answer key stay on the server.
 */
export function contentRouter(content: Content): Router {
  const router = Router();

  // Content doesn't change while the server runs, so build the responses once.
  const publicClients = content.clients.map(toPublicClient);
  const clientsResponse: ClientsResponse = { clients: publicClients };
  const clientsById = new Map(publicClients.map((c) => [c.id, c]));
  const productsResponse: ProductsResponse = { bank: content.bank, products: content.products };

  router.get('/clients', (_req, res) => {
    res.json(clientsResponse);
  });

  router.get('/clients/:id', (req, res) => {
    const client = clientsById.get(req.params.id);
    if (!client) {
      sendError(res, 404, 'NOT_FOUND', `No client with id "${req.params.id}".`);
      return;
    }
    res.json(client);
  });

  router.get('/products', (_req, res) => {
    res.json(productsResponse);
  });

  return router;
}
