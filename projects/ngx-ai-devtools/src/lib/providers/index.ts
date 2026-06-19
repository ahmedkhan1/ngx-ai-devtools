import { EndpointHint, LlmCall, Provider } from '../types';
import { isOpenAi, parseOpenAiRequest, parseOpenAiResponse, accumulateOpenAiStream } from './openai.parser';
import { isAnthropic, parseAnthropicRequest, parseAnthropicResponse, accumulateAnthropicStream } from './anthropic.parser';
import { isGoogle, parseGoogleRequest, parseGoogleResponse } from './google.parser';

/**
 * Detect which provider a URL belongs to.
 *
 * Priority order:
 *   1. Built-in provider URLs (api.openai.com, etc.)
 *   2. Explicit { path, provider } hint in additionalEndpoints
 *   3. URL keyword detection on string-form additionalEndpoints matches
 *   4. 'unknown'
 */
export function detectProvider(url: string, extra: EndpointHint[] = []): Provider {
  if (isOpenAi(url)) return 'openai';
  if (isAnthropic(url)) return 'anthropic';
  if (isGoogle(url)) return 'google';
  if (url.includes('api.mistral.ai')) return 'mistral';
  if (url.includes('api.cohere.ai') || url.includes('api.cohere.com')) return 'cohere';
  if (url.includes('api.groq.com')) return 'groq';

  // Check explicit hints first — they win over keyword detection.
  for (const hint of extra) {
    if (typeof hint === 'object' && url.includes(hint.path)) {
      return hint.provider;
    }
  }

  // Fall through to keyword detection on string-form matches.
  const stringMatches = extra.some((e) => {
    if (typeof e === 'string') return url.includes(e);
    return false;
  });

  if (stringMatches) {
    if (/\b(anthropic|claude)\b/i.test(url)) return 'anthropic';
    if (/\b(google|gemini|generativelanguage)\b/i.test(url)) return 'google';
    if (/\b(mistral)\b/i.test(url)) return 'mistral';
    if (/\b(groq)\b/i.test(url)) return 'groq';
    if (/\b(cohere)\b/i.test(url)) return 'cohere';
    return 'openai';
  }

  return 'unknown';
}

/**
 * True if this URL should be intercepted by the devtools (known provider or
 * matched by additionalEndpoints).
 */
export function isLlmEndpoint(url: string, extra: EndpointHint[] = []): boolean {
  if (detectProvider(url, []) !== 'unknown') return true;
  return extra.some((e) => {
    if (typeof e === 'string') return url.includes(e);
    return url.includes(e.path);
  });
}

export function parseRequest(provider: Provider, body: unknown, url: string, call: Partial<LlmCall>): void {
  switch (provider) {
    case 'openai':
    case 'groq':
    case 'mistral':
      parseOpenAiRequest(body, call);
      break;
    case 'anthropic':
      parseAnthropicRequest(body, call);
      break;
    case 'google':
      parseGoogleRequest(body, url, call);
      break;
    default:
      // Best-effort: try OpenAI shape for unknown providers.
      parseOpenAiRequest(body, call);
  }
}

export function parseResponse(provider: Provider, body: unknown, call: LlmCall): void {
  switch (provider) {
    case 'openai':
    case 'groq':
    case 'mistral':
      parseOpenAiResponse(body, call);
      break;
    case 'anthropic':
      parseAnthropicResponse(body, call);
      break;
    case 'google':
      parseGoogleResponse(body, call);
      break;
    default:
      parseOpenAiResponse(body, call);
  }
}

export function accumulateStream(provider: Provider, eventType: string, data: unknown, call: LlmCall): void {
  switch (provider) {
    case 'anthropic':
      accumulateAnthropicStream(eventType, data, call);
      break;
    case 'google':
      // Google streams the same JSON shape as non-streaming; treat each chunk as full response.
      parseGoogleResponse(data, call);
      break;
    case 'openai':
    case 'groq':
    case 'mistral':
    default:
      accumulateOpenAiStream(data, call);
  }
}
