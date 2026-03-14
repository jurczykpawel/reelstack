/**
 * Shared LLM calling infrastructure.
 * Detects provider from env vars and provides a simple prompt → response interface.
 *
 * Used by: production-planner, n8n-script-generator, ai-tips-script-generator, etc.
 */
import { createLogger } from '@reelstack/logger';

const log = createLogger('llm');

export type LLMProvider = 'anthropic' | 'openrouter' | 'openai';

/**
 * Detect which LLM provider to use based on available API keys.
 * Priority: Anthropic > OpenRouter > OpenAI
 */
export function detectProvider(): LLMProvider | null {
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (process.env.OPENROUTER_API_KEY) return 'openrouter';
  if (process.env.OPENAI_API_KEY) return 'openai';
  return null;
}

/**
 * Call LLM with system + user message and return text response.
 * Throws on failure.
 */
export async function callLLMWithSystem(
  provider: LLMProvider,
  systemPrompt: string,
  userMessage: string,
): Promise<string> {
  if (provider === 'anthropic') {
    return callAnthropic(systemPrompt, userMessage);
  }
  return callOpenAICompatible(provider, systemPrompt, userMessage);
}

/**
 * Simple prompt → response LLM call. Detects provider automatically.
 * The prompt is used as both system and user message (system = instructions, user = content).
 * For the n8n script generator and similar use cases where a single prompt suffices.
 */
export async function callLLM(prompt: string): Promise<string> {
  const provider = detectProvider();
  if (!provider) {
    throw new Error('No LLM API key configured (ANTHROPIC_API_KEY, OPENROUTER_API_KEY, or OPENAI_API_KEY)');
  }
  return callLLMWithSystem(provider, prompt, 'Generate the output as specified.');
}

// ── Anthropic ─────────────────────────────────────────────────

async function callAnthropic(systemPrompt: string, userMessage: string): Promise<string> {
  const model = process.env.PLANNER_MODEL ?? 'claude-opus-4-6';
  log.info({ provider: 'anthropic', model }, 'Calling LLM');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 8192,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) {
    const err = await res.text();
    log.warn({ status: res.status, model, errorPreview: err.substring(0, 200) }, 'Anthropic call failed');
    throw new Error(`Anthropic API error (${res.status})`);
  }

  const data = (await res.json()) as { content: Array<{ type: string; text?: string }> };
  const textBlock = data.content.find((b) => b.type === 'text');
  if (!textBlock?.text) throw new Error('Empty response from Anthropic');
  return textBlock.text;
}

// ── OpenAI-compatible (OpenAI + OpenRouter) ───────────────────

async function callOpenAICompatible(
  provider: 'openrouter' | 'openai',
  systemPrompt: string,
  userMessage: string,
): Promise<string> {
  const isOpenRouter = provider === 'openrouter';
  const baseUrl = isOpenRouter
    ? 'https://openrouter.ai/api/v1'
    : 'https://api.openai.com/v1';
  const apiKey = isOpenRouter
    ? process.env.OPENROUTER_API_KEY!
    : process.env.OPENAI_API_KEY!;
  const defaultModel = isOpenRouter ? 'anthropic/claude-sonnet-4-6' : 'gpt-4o';
  const model = process.env.PLANNER_MODEL ?? defaultModel;
  log.info({ provider, model }, 'Calling LLM');

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };
  if (isOpenRouter) {
    headers['HTTP-Referer'] = 'https://github.com/jurczykpawel/reelstack';
    headers['X-Title'] = 'ReelStack';
  }

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
    }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) {
    const err = await res.text();
    log.warn({ status: res.status, provider, model, errorPreview: err.substring(0, 200) }, 'LLM call failed');
    throw new Error(`${provider} API error (${res.status})`);
  }

  const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
  const content = data.choices[0]?.message?.content;
  if (!content) throw new Error(`Empty response from ${provider}`);
  return content;
}
