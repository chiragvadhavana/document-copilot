import { useState } from 'react';
import Markdown from 'react-markdown';
import { CopilotKit, useCopilotAction } from '@copilotkit/react-core';
import { CopilotChat } from '@copilotkit/react-ui';
import '@copilotkit/react-ui/styles.css';

const RUNTIME = import.meta.env.VITE_COPILOT_RUNTIME ?? 'http://localhost:3001/copilotkit';
const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

interface Figure {
  url: string;
  caption?: string;
  display_caption?: string;
  doc_id: string;
  page: number;
}
interface Citation {
  doc_id: string;
  page: number;
}
interface AnswerResult {
  answer: string;
  figures: Figure[];
  citations: Citation[];
}

// Friendly manual names for display (doc_id -> human label).
const DOC_LABELS: Record<string, string> = {
  '860-5014-machine-wont-drive': "Gorbel — Machine Won't Drive (Troubleshooting)",
  '860-6011-drive-chain-tensioning-procedure': 'Gorbel — Drive Chain Tensioning Procedure',
  'seppim-manual-max-le-en': 'SEPPIM MAX — Operator Manual',
};
const docLabel = (id: string) => DOC_LABELS[id] ?? id;

// Open the source PDF at a specific page (signed URL from the backend, #page=N).
async function openPdf(docId: string, page?: number) {
  try {
    const r = await fetch(`${API}/pdf-url?doc_id=${encodeURIComponent(docId)}`);
    if (!r.ok) return;
    const { url } = (await r.json()) as { url: string };
    window.open(page != null ? `${url}#page=${page + 1}` : url, '_blank', 'noreferrer');
  } catch {
    /* ignore */
  }
}

function ImageModal({ figure, onClose }: { figure: Figure | null; onClose: () => void }) {
  if (!figure) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-4 py-3">
          <div>
            <div className="text-sm font-semibold text-slate-900">
              {figure.display_caption || figure.caption || 'Figure'}
            </div>
            <div className="text-xs text-slate-500">
              {docLabel(figure.doc_id)} · page {figure.page + 1}
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-md px-2 py-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-auto bg-slate-50 p-4">
          <img src={figure.url} alt={figure.display_caption ?? 'figure'} className="mx-auto max-h-[60vh] object-contain" />
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-4 py-3">
          {figure.caption && figure.caption !== figure.display_caption ? (
            <div className="truncate text-xs text-slate-500">Nearby text: {figure.caption}</div>
          ) : (
            <span />
          )}
          <button
            onClick={() => openPdf(figure.doc_id, figure.page)}
            className="shrink-0 rounded-md bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-700"
          >
            Open this page in the PDF →
          </button>
        </div>
      </div>
    </div>
  );
}

function FigureGrid({ figures, onSelect }: { figures: Figure[]; onSelect: (f: Figure) => void }) {
  if (!figures.length) return null;
  return (
    <div className="my-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {figures.slice(0, 8).map((f, i) => (
        <button
          key={i}
          onClick={() => onSelect(f)}
          className="group block overflow-hidden rounded-lg border border-slate-200 bg-white text-left shadow-sm transition hover:border-sky-500 hover:shadow"
        >
          <img
            src={f.url}
            alt={f.display_caption ?? f.caption ?? 'figure'}
            className="h-36 w-full bg-slate-50 object-contain"
          />
          <div className="space-y-0.5 px-2 py-1.5">
            <div className="line-clamp-2 text-xs font-medium text-slate-800">
              {f.display_caption || f.caption || 'Figure'}
            </div>
            <div className="text-[10px] uppercase tracking-wide text-slate-400">
              {docLabel(f.doc_id)} · p{f.page + 1}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

function SourcesLine({ citations }: { citations: Citation[] }) {
  if (!citations.length) return null;
  const uniq = Array.from(new Map(citations.map((c) => [`${c.doc_id}:${c.page}`, c])).values());
  const docs = Array.from(new Set(uniq.map((c) => c.doc_id)));
  return (
    <div className="mt-3 space-y-1 border-t border-slate-100 pt-2 text-xs text-slate-500">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-medium text-slate-600">Sources:</span>
        {uniq.map((c, i) => (
          <button
            key={i}
            onClick={() => openPdf(c.doc_id, c.page)}
            className="rounded border border-slate-200 px-1.5 py-0.5 text-slate-600 hover:border-sky-400 hover:text-sky-700"
            title={`Open ${docLabel(c.doc_id)} at page ${c.page + 1}`}
          >
            {docLabel(c.doc_id)} · p{c.page + 1}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-3">
        {docs.map((d) => (
          <button key={d} onClick={() => openPdf(d)} className="text-sky-700 underline-offset-2 hover:underline">
            Open full PDF: {docLabel(d)}
          </button>
        ))}
      </div>
    </div>
  );
}

function Copilot() {
  const [selected, setSelected] = useState<Figure | null>(null);

  useCopilotAction({
    name: 'answer_question',
    // followUp:false → the agent's answer IS the response; the chat LLM does NOT
    // re-generate a reply. One grounded answer, no double-LLM relay (simpler, and
    // keeps the chat history lean — a verbatim relay would re-include the figures).
    followUp: false,
    description:
      'Answer the technician question about the equipment manuals. ALWAYS call this for ANY ' +
      'manual / alarm code / procedure / diagram question. The answer is shown to the user ' +
      'automatically — you do not need to repeat it.',
    parameters: [{ name: 'message', type: 'string', description: 'the full user question', required: true }],
    handler: async ({ message }: { message: string }) => {
      const r = await fetch(`${API}/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message }),
      });
      if (!r.ok) return { answer: `Sorry — the request failed (HTTP ${r.status}). Please try again.`, figures: [], citations: [] };
      return (await r.json()) as AnswerResult;
    },
    render: ({ status, result }) => {
      if (status !== 'complete') {
        return <div className="my-1 text-sm text-slate-500">🔧 Looking through the manuals…</div>;
      }
      const res = (result ?? { answer: '', figures: [], citations: [] }) as AnswerResult;
      return (
        <div className="my-1 space-y-2">
          <div className="text-sm leading-relaxed text-slate-800 [&_h2]:mt-2 [&_h2]:text-base [&_h2]:font-semibold [&_h3]:mt-2 [&_h3]:font-semibold [&_li]:my-0.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1 [&_strong]:font-semibold [&_table]:my-2 [&_td]:border [&_td]:border-slate-200 [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-slate-200 [&_th]:px-2 [&_th]:py-1 [&_ul]:list-disc [&_ul]:pl-5">
            <Markdown>{res.answer}</Markdown>
          </div>
          <FigureGrid figures={res.figures ?? []} onSelect={setSelected} />
          <SourcesLine citations={res.citations ?? []} />
        </div>
      );
    },
  });

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1">
        <CopilotChat
          className="h-full"
          instructions={
            'You are a maintenance assistant for industrial equipment manuals (Gorbel Destuff-it ' +
            'and SEPPIM MAX tracked carriers). For ANY user question, call the answer_question ' +
            "tool with the user's message. The tool displays the full answer to the user itself, " +
            'so you do not need to write anything else.'
          }
          labels={{
            title: 'Document Copilot',
            initial: 'Hi! Ask me anything about your equipment manuals. What are you working on?',
          }}
        />
      </div>
      <ImageModal figure={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

export default function App() {
  return (
    <div className="flex h-full flex-col bg-slate-50">
      <header className="border-b border-slate-200 bg-white px-6 py-3">
        <h1 className="text-lg font-semibold text-slate-900">Document Copilot</h1>
        <p className="text-sm text-slate-500">Instant answers from your manuals.</p>
      </header>
      <div className="min-h-0 flex-1">
        <CopilotKit runtimeUrl={RUNTIME}>
          <Copilot />
        </CopilotKit>
      </div>
    </div>
  );
}
