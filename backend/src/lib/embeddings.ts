import { FlagEmbedding, EmbeddingModel } from 'fastembed';

// Query-side embedding
export const EMBED_MODEL_NAME = 'BAAI/bge-base-en-v1.5';

let _model: Promise<FlagEmbedding> | null = null;

function model(): Promise<FlagEmbedding> {
  if (!_model) {
    _model = FlagEmbedding.init({
      model: EmbeddingModel.BGEBaseENV15,
      cacheDir: process.env.FASTEMBED_CACHE ?? '/tmp/fastembed', // Lambda: only /tmp is writable
      maxLength: 512,
      showDownloadProgress: false,
    });
  }
  return _model;
}

function normalize(v: number[]): number[] {
  let s = 0;
  for (const x of v) s += x * x;
  const n = Math.sqrt(s) || 1;
  return v.map((x) => x / n);
}

// bge queries get a retrieval-instruction prefix (queryEmbed handles it);
// passages were embedded without it at ingest. Normalize so dot == cosine.
export async function embedQuery(text: string): Promise<number[]> {
  const m = await model();
  const v = await m.queryEmbed(text);
  return normalize(Array.from(v));
}
