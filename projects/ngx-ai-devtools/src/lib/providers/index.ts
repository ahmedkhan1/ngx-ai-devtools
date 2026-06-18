import { LlmCall, Provider } from '../types';
import { isOpenAi, parseOpenAiRequest, parseOpenAiResponse, accumulateOpenAiStream } from './openai.parser';
import { isAnthropic, parseAnthropicRequest, parseAnthropicResponse, accumulateAnthropicStream } from './anthropic.parser';
import { isGoogle, parseGoogleRequest, parseGoogleResponse } from './google.parser';

export function detectProvider(url: string, extra: string[] = []): Provider {
  if (isOpenAi(url)) return 'openai';
  if (isAnthropic(url)) return 'anthropic';
  if (isGoogle(url)) return 'google';
  if (url.includes('api.mistral.ai')) return 'mistral';
  if (url.includes('api.cohere.ai') || url.includes('api.cohere.com')) return 'cohere';
  if (url.includes('api.groq.com')) return 'groq';

  // If matched via additionalEndpoints, infer provider from path keywords.
  // This handles proxy patterns like /api/anthropic/... or /openai-proxy/...
  if (extra.some((e) => url.includes(e))) {
    if (/\b(anthropic|claude)\b/i.test(url)) return 'anthropic';
    if (/\b(google|gemini|generativelanguage)\b/i.test(url)) return 'google';
    if (/\b(mistral)\b/i.test(url)) return 'mistral';
    if (/\b(groq)\b/i.test(url)) return 'groq';
    if (/\b(cohere)\b/i.test(url)) return 'cohere';
    return 'openai'; // default for unknown proxies (most common shape)
  }

  return 'unknown';
}

export function isLlmEndpoint(url: string, extra: string[] = []): boolean {
  if (detectProvider(url, extra) !== 'unknown') return true;
  return extra.some((e) => url.includes(e));
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
