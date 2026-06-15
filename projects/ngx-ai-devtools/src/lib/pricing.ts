import { PriceEntry } from './types';

/**
 * Price table per 1M tokens, USD. Update as providers change pricing.
 * If a model is missing, cost is not calculated (better than wrong cost).
 */
export const PRICING: Record<string, PriceEntry> = {
  // OpenAI
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4-turbo': { input: 10, output: 30 },
  'gpt-4': { input: 30, output: 60 },
  'gpt-3.5-turbo': { input: 0.5, output: 1.5 },
  'o1': { input: 15, output: 60 },
  'o1-mini': { input: 3, output: 12 },
  'o3-mini': { input: 1.1, output: 4.4 },

  // Anthropic
  'claude-opus-4': { input: 15, output: 75 },
  'claude-sonnet-4': { input: 3, output: 15 },
  'claude-haiku-4': { input: 0.8, output: 4 },
  'claude-3-7-sonnet': { input: 3, output: 15 },
  'claude-3-5-sonnet': { input: 3, output: 15 },
  'claude-3-5-haiku': { input: 0.8, output: 4 },
  'claude-3-opus': { input: 15, output: 75 },
  'claude-3-sonnet': { input: 3, output: 15 },
  'claude-3-haiku': { input: 0.25, output: 1.25 },

  // Google
  'gemini-2.5-pro': { input: 1.25, output: 10 },
  'gemini-2.5-flash': { input: 0.3, output: 2.5 },
  'gemini-2.0-flash': { input: 0.1, output: 0.4 },
  'gemini-1.5-pro': { input: 1.25, output: 5 },
  'gemini-1.5-flash': { input: 0.075, output: 0.3 },

  // Mistral
  'mistral-large': { input: 2, output: 6 },
  'mistral-small': { input: 0.2, output: 0.6 },

  // Groq
  'llama-3.3-70b-versatile': { input: 0.59, output: 0.79 },
  'llama-3.1-8b-instant': { input: 0.05, output: 0.08 },
};

/**
 * Best-effort match — tries exact, then prefix, then returns null.
 */
export function priceFor(model: string | undefined): PriceEntry | null {
  if (!model) return null;
  const key = model.toLowerCase();
  if (PRICING[key]) return PRICING[key];
  // Try prefix match — useful for dated model names like "claude-3-5-sonnet-20241022"
  for (const [name, price] of Object.entries(PRICING)) {
    if (key.startsWith(name)) return price;
  }
  return null;
}

export function calculateCost(
  model: string | undefined,
  inputTokens: number,
  outputTokens: number,
): { input: number; output: number; total: number; currency: 'USD' } | null {
  const price = priceFor(model);
  if (!price) return null;
  const input = (inputTokens / 1_000_000) * price.input;
  const output = (outputTokens / 1_000_000) * price.output;
  return { input, output, total: input + output, currency: 'USD' };
}
