import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { embedQuery } from '../lib/embeddings.js';
import { search, pageText, getManifest } from '../lib/vectorStore.js';

// Agent tools. Each is a single-responsibility unit the LangGraph agent
// can call. A per-request Collector captures the figures + citations surfaced
// during the run so the handler can return them for generative-UI cards.

const REGION = process.env.BEDROCK_REGION ?? 'ap-south-1';
const IMAGES_BUCKET = process.env.IMAGES_BUCKET ?? '';
const s3 = new S3Client({ region: REGION });

export interface ImageCard {
  s3_key: string;
  url: string;
  caption?: string;
  display_caption?: string;
  doc_id: string;
  page: number;
  rendered?: boolean;
}
export interface Citation {
  doc_id: string;
  page: number;
}
export interface Collector {
  images: Map<string, ImageCard>;
  citations: Map<string, Citation>;
}

export function newCollector(): Collector {
  return { images: new Map(), citations: new Map() };
}

function signImage(key: string): Promise<string> {
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: IMAGES_BUCKET, Key: key }), {
    expiresIn: 3600,
  });
}

export function buildTools(c: Collector) {
  const search_manual = tool(
    async ({ query, k }: { query: string; k?: number }) => {
      const qv = await embedQuery(query);
      const hits = await search(qv, k ?? 6);
      const lines: string[] = [];
      for (const h of hits) {
        const m = h.meta;
        if (m.type === 'text') {
          c.citations.set(`${m.doc_id}:${m.page}`, { doc_id: m.doc_id, page: m.page });
          lines.push(`[text · ${m.doc_id} p${m.page}] ${(m.text ?? '').slice(0, 300)}`);
        } else if (m.s3_key) {
          if (!c.images.has(m.s3_key)) {
            c.images.set(m.s3_key, {
              s3_key: m.s3_key,
              url: await signImage(m.s3_key),
              caption: m.caption,
              display_caption: m.display_caption,
              doc_id: m.doc_id,
              page: m.page,
              rendered: m.rendered,
            });
          }
          lines.push(`[figure · ${m.doc_id} p${m.page}] ${m.caption ?? ''} (image_id=${m.s3_key})`);
        }
      }
      return lines.join('\n') || 'no results';
    },
    {
      name: 'search_manual',
      description:
        'Search the ingested industrial manuals for text and figures relevant to a query. ' +
        'Returns text snippets and figure captions, each with a document id and page number. ' +
        'Figures are referenced by image_id and shown to the user as cards. Call this to ground every answer.',
      schema: z.object({
        query: z.string().describe('what to look for, in natural language'),
        k: z.number().optional().describe('number of results (default 6)'),
      }),
    },
  );

  const fetch_image = tool(
    async ({ image_id }: { image_id: string }) => {
      const url = await signImage(image_id);
      const existing = c.images.get(image_id);
      c.images.set(image_id, {
        s3_key: image_id,
        url,
        doc_id: existing?.doc_id ?? '',
        page: existing?.page ?? 0,
        caption: existing?.caption,
        rendered: existing?.rendered,
      });
      return `Figure ${image_id} is ready to display to the user.`;
    },
    {
      name: 'fetch_image',
      description:
        'Get a displayable signed URL for a specific figure by its image_id (from search_manual), ' +
        'so it is shown to the user as a card. Use when the user asks to see a diagram/figure.',
      schema: z.object({ image_id: z.string() }),
    },
  );

  const get_page_context = tool(
    async ({ doc_id, page }: { doc_id: string; page: number }) => {
      const t = await pageText(doc_id, page);
      return t || 'no text found on that page';
    },
    {
      name: 'get_page_context',
      description: 'Get the full text of a specific manual page when a snippet is not enough.',
      schema: z.object({ doc_id: z.string(), page: z.number() }),
    },
  );

  const list_documents = tool(
    async () => {
      const man = await getManifest();
      return man.docs
        .map((d) => `${d.doc_id} — ${d.filename} (text:${d.text_vectors}, figures:${d.image_vectors})`)
        .join('\n');
    },
    {
      name: 'list_documents',
      description: 'List the available manuals (document ids + filenames).',
      schema: z.object({}),
    },
  );

  return [search_manual, fetch_image, get_page_context, list_documents];
}
