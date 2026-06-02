import { ChatGroq } from '@langchain/groq';
import { ChatBedrockConverse } from '@langchain/aws';
import { ChatOpenAI } from '@langchain/openai';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { GUARDRAIL_ID, GUARDRAIL_VERSION } from './guardrail.js';

// LangChain swapable provider
// share the same interface, so the agent graph never changes.
//   bedrock    -> ChatBedrockConverse (Claude Sonnet 4.6)
//   openrouter -> ChatOpenAI @ OpenRouter (Claude Sonnet 4.6)
const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL ?? 'anthropic/claude-sonnet-4.6';

export function makeChatModel(): BaseChatModel {
  const provider = process.env.LLM_PROVIDER ?? 'openrouter';
  if (provider === 'bedrock') {
    return new ChatBedrockConverse({
      model: process.env.BEDROCK_MODEL_ID ?? 'global.anthropic.claude-sonnet-4-6',
      region: process.env.BEDROCK_REGION ?? 'ap-south-1',
      temperature: 0.2,
      // Bedrock-native guardrail: applied to every Converse call automatically.
      ...(GUARDRAIL_ID
        ? { guardrailConfig: { guardrailIdentifier: GUARDRAIL_ID, guardrailVersion: GUARDRAIL_VERSION } }
        : {}),
    });
  }
  if (provider === 'openrouter') {
    return new ChatOpenAI({
      model: OPENROUTER_MODEL,
      apiKey: process.env.OPENROUTER_API_KEY,
      configuration: { baseURL: OPENROUTER_BASE },
      temperature: 0.2,
      maxTokens: 1024,
    });
  }
  return new ChatGroq({
    model: process.env.GROQ_MODEL ?? 'openai/gpt-oss-120b',
    apiKey: process.env.GROQ_API_KEY,
    temperature: 0.2,
    maxTokens: 1024,
  });
}

export function providerInfo() {
  const provider = process.env.LLM_PROVIDER ?? 'groq';
  const model =
    provider === 'bedrock'
      ? process.env.BEDROCK_MODEL_ID ?? 'global.anthropic.claude-sonnet-4-6'
      : provider === 'openrouter'
        ? OPENROUTER_MODEL
        : process.env.GROQ_MODEL ?? 'openai/gpt-oss-120b';
  return { provider, model };
}
