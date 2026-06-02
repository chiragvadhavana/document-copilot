import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

// FAISS-in-S3, query side
const REGION = process.env.BEDROCK_REGION ?? 'ap-south-1';
const VECTORS_BUCKET = process.env.VECTORS_BUCKET ?? '';
const s3 = new S3Client({ region: REGION });

export interface Meta {
  doc_id: string;
  page: number;
  type: 'text' | 'image';
  text?: string;
  s3_key?: string;
  bbox?: number[];
  caption?: string;
  display_caption?: string;
  embed_source?: 'caption' | 'page';
  rendered?: boolean;
  chunk_index?: number;
  image_id?: string;
}

export interface Manifest {
  embed_model: string;
  dim: number;
  docs: { doc_id: string; filename: string; text_vectors: number; image_vectors: number }[];
}

interface Store {
  vectors: Float32Array;
  dim: number;
  count: number;
  meta: Meta[];
  manifest: Manifest;
}

let _store: Promise<Store> | null = null;

async function getObject(key: string): Promise<Buffer> {
  const r = await s3.send(new GetObjectCommand({ Bucket: VECTORS_BUCKET, Key: key }));
  const bytes = await r.Body!.transformToByteArray();
  return Buffer.from(bytes);
}

async function load(): Promise<Store> {
  const [vbuf, mbuf, manbuf] = await Promise.all([
    getObject('vectors.f32'),
    getObject('metadata.json'),
    getObject('manifest.json'),
  ]);
  const meta = JSON.parse(mbuf.toString('utf8')) as Meta[];
  const manifest = JSON.parse(manbuf.toString('utf8')) as Manifest;
  const count = meta.length;
  // copy into a fresh 0-offset ArrayBuffer for safe Float32Array view
  const ab = vbuf.buffer.slice(vbuf.byteOffset, vbuf.byteOffset + vbuf.byteLength);
  const vectors = new Float32Array(ab);
  const dim = vectors.length / count;
  return { vectors, dim, count, meta, manifest };
}

function store(): Promise<Store> {
  if (!_store) _store = load();
  return _store;
}

export interface Hit {
  score: number;
  meta: Meta;
}

export async function search(
  qvec: number[],
  k = 6,
  filter?: (m: Meta) => boolean,
): Promise<Hit[]> {
  const { vectors, dim, count, meta } = await store();
  const scored: Hit[] = [];
  for (let i = 0; i < count; i++) {
    const m = meta[i];
    if (!m) continue;
    if (filter && !filter(m)) continue;
    let dot = 0;
    const off = i * dim;
    for (let d = 0; d < dim; d++) dot += (qvec[d] ?? 0) * (vectors[off + d] ?? 0);
    scored.push({ score: dot, meta: m });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k);
}

export async function pageText(docId: string, page: number): Promise<string> {
  const { meta } = await store();
  return meta
    .filter((m) => m.doc_id === docId && m.page === page && m.type === 'text')
    .map((m) => m.text ?? '')
    .join('\n');
}

export async function getManifest(): Promise<Manifest> {
  return (await store()).manifest;
}
