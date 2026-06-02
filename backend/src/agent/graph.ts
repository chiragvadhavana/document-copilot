import { StateGraph, MessagesAnnotation, START, END } from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { makeChatModel, providerInfo } from '../lib/chatModel.js';
import { applyGuardrail } from '../lib/guardrail.js';
import { buildTools, newCollector, type ImageCard, type Citation } from './tools.js';

// LangGraph StateGraph agent. The loop is the two edges: agent -> (tools | END) and tools -> agent. 
// not prebuilt createAgent so guardrails / iteration caps / image collection are customized.

const SYSTEM_PROMPT = `You are a maintenance copilot for industrial equipment manuals (Gorbel Destuff-it and SEPPIM MAX tracked carriers).
Rules:
- Ground every answer in the manuals: call search_manual before answering.
- Call search_manual at most TWICE (only re-search for a genuinely different sub-question). Once you have results, WRITE YOUR FINAL ANSWER — never repeat the same search.
- Cite the document id and page for facts.
- When a figure or diagram is relevant, reference it; matching figures are shown to the technician as image cards automatically.
- If the manuals don't cover the question, say so plainly — do not guess.
- Be concise, practical and step-oriented.`;

export interface AgentResult {
  answer: string;
  images: ImageCard[];
  citations: Citation[];
  provider: string;
  model: string;
}

export async function runAgent(message: string): Promise<AgentResult> {
  // INPUT guardrail (Bedrock ApplyGuardrail) provider-agnostic
  const inputGr = await applyGuardrail(message, 'INPUT');
  if (inputGr.intervened) {
    return { answer: inputGr.message ?? '', images: [], citations: [], ...providerInfo() };
  }

  const collector = newCollector();
  const tools = buildTools(collector);
  const base = makeChatModel();
  if (!base.bindTools) throw new Error('chat model does not support tool calling');
  const model = base.bindTools(tools);

  const agentNode = async (state: typeof MessagesAnnotation.State) => {
    // control point: guardrail input/output checks, multimodal injection, tracing go here
    const res = await model.invoke(state.messages);
    return { messages: [res] };
  };

  const route = (state: typeof MessagesAnnotation.State) => {
    const msgs = state.messages;
    const last = msgs[msgs.length - 1] as { tool_calls?: unknown[] } | undefined;
    return last?.tool_calls?.length ? 'tools' : END;
  };

  const graph = new StateGraph(MessagesAnnotation)
    .addNode('agent', agentNode)
    .addNode('tools', new ToolNode(tools))
    .addEdge(START, 'agent')
    .addConditionalEdges('agent', route, { tools: 'tools', [END]: END })
    .addEdge('tools', 'agent')
    .compile();

  let answer: string;
  try {
    const out = await graph.invoke(
      { messages: [new SystemMessage(SYSTEM_PROMPT), new HumanMessage(message)] },
      { recursionLimit: 24 }, // generous headroom for legitimate multi-tool turns
    );
    const content = out.messages[out.messages.length - 1]?.content ?? '';
    answer = typeof content === 'string' ? content : JSON.stringify(content);
  } catch (err) {
    // Safety net (e.g. GraphRecursionError): return what retrieval gathered
    // instead of a 500, so the user still gets the cited pages + figures.
    console.error('agent loop error:', err instanceof Error ? err.message : err);
    const cites = [...collector.citations.values()]
      .map((c) => `${c.doc_id} p${c.page + 1}`)
      .join(', ');
    answer =
      'I found relevant sections but could not finish composing the answer. ' +
      (cites ? `See: ${cites}.` : 'Try rephrasing the question.');
  }

  // OUTPUT guardrail last line of defense on the answer text.
  const outputGr = await applyGuardrail(answer, 'OUTPUT');
  if (outputGr.intervened) answer = outputGr.message ?? answer;

  return {
    answer,
    images: [...collector.images.values()],
    citations: [...collector.citations.values()],
    ...providerInfo(),
  };
}
