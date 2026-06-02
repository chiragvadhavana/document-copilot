// Talks to the Document Copilot agent (local server now; container-Lambda API
// Gateway URL via VITE_API_URL in prod — D021).
const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

export interface ImageCard {
  s3_key: string;
  url: string;
  caption?: string;
  doc_id: string;
  page: number;
  rendered?: boolean;
}
export interface Citation {
  doc_id: string;
  page: number;
}
export interface ChatResponse {
  answer: string;
  images: ImageCard[];
  citations: Citation[];
  meta: { provider: string; model: string };
}

export async function ask(message: string): Promise<ChatResponse> {
  const r = await fetch(`${API}/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message }),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.json()) as ChatResponse;
}
