import { Router } from 'express';
import { FeedbackRequestSchema, type FeedbackResponse } from '@bank-sim/shared';
import type { Ai } from '../ai/client.js';
import { getFeedback } from '../coach/coach.js';
import { findMentionedProducts } from '../coach/mentions.js';
import { checkProductFit } from '../coach/product-fit.js';
import type { Content } from '../content.js';
import { formatPath } from '../format.js';
import { sendError } from '../http.js';
import { productsForCoach } from '../prompts/coach-prompt.js';

/**
 * POST /feedback — the AI coach's feedback on a finished interview and summary.
 * Stateless like /chat: the browser sends the whole interview.
 */
export function feedbackRouter(content: Content, ai: Ai): Router {
  const router = Router();

  router.post('/feedback', async (req, res) => {
    const parsed = FeedbackRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const where = issue && issue.path.length > 0 ? `${formatPath(issue.path)}: ` : '';
      sendError(res, 400, 'BAD_REQUEST', `${where}${issue?.message ?? 'invalid request'}`);
      return;
    }

    const { clientId, messages, summary } = parsed.data;
    const client = content.getClient(clientId);
    if (!client) {
      sendError(res, 404, 'NOT_FOUND', `No client with id "${clientId}".`);
      return;
    }
    const unknownId = summary.recommendedProductIds.find((id) => !content.getProduct(id));
    if (unknownId) {
      sendError(
        res,
        400,
        'BAD_REQUEST',
        `summary.recommendedProductIds: no product with id "${unknownId}"`,
      );
      return;
    }

    const questions = messages.filter((m) => m.role === 'student').map((m) => m.content);
    const discussed = findMentionedProducts(content.products, questions);
    // The justification can name products too; the coach needs their details either way.
    const mentioned = findMentionedProducts(content.products, [
      ...questions,
      summary.justification,
    ]);

    const feedback = await getFeedback(ai, {
      client,
      bank: content.bank,
      products: productsForCoach(
        content.products,
        client,
        summary.recommendedProductIds,
        mentioned,
      ),
      discussedProducts: discussed,
      productName: (id) => content.getProduct(id)?.name ?? id,
      fit: checkProductFit(client.productFit, summary.recommendedProductIds),
      messages,
      summary,
    });
    res.json(feedback satisfies FeedbackResponse);
  });

  return router;
}
