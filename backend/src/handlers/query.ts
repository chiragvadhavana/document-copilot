import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { runAgent } from '../agent/graph.js';
import { providerInfo } from '../lib/chatModel.js';
import { EMBED_MODEL_NAME } from '../lib/embeddings.js';

const json = (statusCode: number, body: unknown): APIGatewayProxyResultV2 => ({
  statusCode,
  headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
  body: JSON.stringify(body),
});

export const handler = async (
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
  const path = event.requestContext?.http?.path ?? '/';

  if (path === '/healthz') {
    return json(200, {
      status: 'ok',
      service: 'document-copilot',
      region: process.env.BEDROCK_REGION,
      ...providerInfo(),
      embedModel: EMBED_MODEL_NAME,
      ts: new Date().toISOString(),
    });
  }

  // POST /chat
  let parsed: { message?: string } = {};
  if (event.body) {
    try {
      parsed = JSON.parse(event.body) as { message?: string };
    } catch {
      return json(400, { error: 'invalid_json' });
    }
  }

  const message = parsed.message?.trim();
  if (!message) {
    return json(400, { error: 'missing_message', hint: 'POST {"message": "..."}' });
  }

  try {
    const result = await runAgent(message);
    return json(200, {
      answer: result.answer,
      figures: result.images, // shared shape the frontend cards consume
      citations: result.citations,
      meta: { provider: result.provider, model: result.model },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('agent error:', msg);
    return json(500, { error: 'agent_failed', detail: msg });
  }
};
