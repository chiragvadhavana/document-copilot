// Bedrock Guardrail wiring:
//   (A) When LLM_PROVIDER=bedrock, ChatBedrockConverse passes guardrailConfig so
//       Bedrock auto-applies the guardrail to the LLM call.
//   (B) For any provider (OpenRouter), we call the standalone
//       ApplyGuardrail API on the user input + final answer here. So the
//       guardrail is enforced on all providers.
import { BedrockRuntimeClient, ApplyGuardrailCommand } from '@aws-sdk/client-bedrock-runtime';

export const GUARDRAIL_ID = process.env.GUARDRAIL_ID ?? '';
export const GUARDRAIL_VERSION = process.env.GUARDRAIL_VERSION ?? 'DRAFT';

const br = new BedrockRuntimeClient({ region: process.env.BEDROCK_REGION ?? 'ap-south-1' });

export interface GuardrailResult {
  intervened: boolean;
  message?: string;
}

export async function applyGuardrail(text: string, source: 'INPUT' | 'OUTPUT'): Promise<GuardrailResult> {
  if (!GUARDRAIL_ID || !text.trim()) return { intervened: false };
  try {
    const res = await br.send(
      new ApplyGuardrailCommand({
        guardrailIdentifier: GUARDRAIL_ID,
        guardrailVersion: GUARDRAIL_VERSION,
        source,
        content: [{ text: { text } }],
      }),
    );
    if (res.action === 'GUARDRAIL_INTERVENED') {
      const msg = res.outputs?.[0]?.text ?? 'I can only help with industrial-document questions.';
      return { intervened: true, message: msg };
    }
    return { intervened: false };
  } catch (e) {
    // Fail-open on guardrail errors so we never silently break the agent;
    // log so we can spot a misconfiguration.
    console.error('guardrail error:', e instanceof Error ? e.message : e);
    return { intervened: false };
  }
}
