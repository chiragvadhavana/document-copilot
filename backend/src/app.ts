import express from 'express';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  CopilotRuntime,
  OpenAIAdapter,
  copilotRuntimeNodeExpressEndpoint,
  type CopilotServiceAdapter,
} from '@copilotkit/runtime';
import OpenAI from 'openai';
import { runAgent } from './agent/graph.js';
import { providerInfo } from './lib/chatModel.js';
import { EMBED_MODEL_NAME, embedQuery } from './lib/embeddings.js';
import { search } from './lib/vectorStore.js';

// Single Express app served both locally (scripts/serve.ts) and in Lambda
// (handlers/lambda.ts via serverless-http) — so /copilotkit runs in the cloud too.

const REGION = process.env.BEDROCK_REGION ?? 'ap-south-1';
const IMAGES_BUCKET = process.env.IMAGES_BUCKET ?? '';
const s3 = new S3Client({ region: REGION });
const signImage = (key: string) =>
  getSignedUrl(s3, new GetObjectCommand({ Bucket: IMAGES_BUCKET, Key: key }), { expiresIn: 3600 });

// CopilotKit runtime adapter follows LLM_PROVIDER. OpenAIAdapter (OpenRouter is OpenAI-compatible)
function makeCopilotAdapter(): CopilotServiceAdapter {
  if (process.env.LLM_PROVIDER === 'openrouter') {
    const openai = new OpenAI({ apiKey: process.env.OPENROUTER_API_KEY, baseURL: 'https://openrouter.ai/api/v1' });
    return new OpenAIAdapter({ openai, model: process.env.OPENROUTER_MODEL ?? 'anthropic/claude-sonnet-4.6' });
  }
  const openai = new OpenAI({ apiKey: process.env.GROQ_API_KEY, baseURL: 'https://api.groq.com/openai/v1' });
  return new OpenAIAdapter({ openai, model: process.env.GROQ_MODEL ?? 'openai/gpt-oss-120b' });
}

export function makeApp() {
  const app = express();

  // CORS is owned HERE (Express), NOT by the Lambda Function URL. The Function
  // URL must be created WITHOUT a cors config, otherwise it ALSO injects an
  // Access-Control-Allow-Origin header and the browser sees two values
  // ("*, <origin>") and blocks every request. Single source = single header.
  app.use((_req, res, next) => {
    res.header('access-control-allow-origin', '*');
    res.header('access-control-allow-headers', '*');
    res.header('access-control-allow-methods', '*');
    next();
  });
  app.options(/.*/, (_req, res) => res.sendStatus(204));

  app.get('/healthz', (_req, res) => {
    res.json({ status: 'ok', service: 'document-copilot', ...providerInfo(), embedModel: EMBED_MODEL_NAME });
  });

  // Signed URL to a source PDF (private bucket) so the UI can open the manual at a
  // specific page: the frontend opens `<url>#page=N`. Confidential docs stay private.
  app.get('/pdf-url', async (req, res) => {
    try {
      const docId = String(req.query.doc_id ?? '').trim();
      if (!docId) return void res.status(400).json({ error: 'missing_doc_id' });
      res.json({ url: await signImage(`pdfs/${docId}.pdf`) });
    } catch (e) {
      res.status(500).json({ error: 'pdf_url_failed', detail: String(e) });
    }
  });

  app.post('/search', express.json(), async (req, res) => {
    try {
      const { query, k } = (req.body ?? {}) as { query?: string; k?: number };
      if (!query?.trim()) return void res.status(400).json({ error: 'missing_query' });
      const hits = await search(await embedQuery(query.trim()), k ?? 6);
      const snippets: string[] = [];
      const figures: { url: string; caption?: string; doc_id: string; page: number }[] = [];
      const seen = new Set<string>();
      for (const h of hits) {
        const m = h.meta;
        if (m.type === 'text') snippets.push(`(${m.doc_id} p${m.page + 1}) ${(m.text ?? '').slice(0, 280)}`);
        else if (m.s3_key && !seen.has(m.s3_key)) {
          seen.add(m.s3_key);
          figures.push({ url: await signImage(m.s3_key), caption: m.caption, doc_id: m.doc_id, page: m.page });
        }
      }
      res.json({ summary: snippets.join('\n') || 'no text matches', figures });
    } catch (e) {
      res.status(500).json({ error: 'search_failed', detail: String(e) });
    }
  });

  // Standalone LangGraph agent
  app.post('/chat', express.json(), async (req, res) => {
    try {
      const { message } = (req.body ?? {}) as { message?: string };
      if (!message?.trim()) return void res.status(400).json({ error: 'missing_message' });
      const r = await runAgent(message.trim());
      // `figures` (not `images`) is the shared shape the frontend cards consume.
      res.json({ answer: r.answer, figures: r.images, citations: r.citations, meta: { provider: r.provider, model: r.model } });
    } catch (e) {
      res.status(500).json({ error: 'agent_failed', detail: String(e) });
    }
  });

  // CopilotKit runtime (generative UI). Frontend useCopilotAction tools flow through here.
  // Mounted at root (not '/copilotkit') so the handler sees the full path it was
  // configured with — express strips the mount path otherwise, causing a 404.
  const runtime = new CopilotRuntime();
  app.use(
    copilotRuntimeNodeExpressEndpoint({
      endpoint: '/copilotkit',
      runtime,
      serviceAdapter: makeCopilotAdapter(),
    }),
  );

  return app;
}
