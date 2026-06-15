import { ChatMessage, LlmCall } from '../types';

export function isGoogle(url: string): boolean {
  return url.includes('generativelanguage.googleapis.com') || url.includes('aiplatform.googleapis.com');
}

/**
 * Extract the model from a Gemini URL: /v1beta/models/gemini-1.5-pro:generateContent
 */
function modelFromUrl(url: string): string | undefined {
  const m = url.match(/models\/([^:/?]+)/);
  return m?.[1];
}

export function parseGoogleRequest(body: unknown, url: string, call: Partial<LlmCall>): void {
  call.model = modelFromUrl(url);
  if (url.includes(':streamGenerateContent')) call.streaming = true;
  if (!body || typeof body !== 'object') return;
  const b = body as Record<string, unknown>;
  const contents = b['contents'] as { role?: string; parts?: { text?: string }[] }[] | undefined;
  if (Array.isArray(contents)) {
    call.messages = contents.map((c) => ({
      role: (c.role === 'model' ? 'assistant' : c.role ?? 'user') as ChatMessage['role'],
      content: (c.parts ?? []).map((p) => p.text ?? '').join('\n'),
    }));
  }
  const sys = b['systemInstruction'] as { parts?: { text?: string }[] } | undefined;
  if (sys?.parts) call.system = sys.parts.map((p) => p.text ?? '').join('\n');
}

export function parseGoogleResponse(body: unknown, call: LlmCall): void {
  if (!body || typeof body !== 'object') return;
  const b = body as Record<string, unknown>;
  const candidates = b['candidates'] as { content?: { parts?: { text?: string }[] }; finishReason?: string }[] | undefined;
  if (Array.isArray(candidates) && candidates[0]) {
    const parts = candidates[0].content?.parts;
    if (Array.isArray(parts)) {
      call.response = parts.map((p) => p.text ?? '').join('');
    }
    if (candidates[0].finishReason) call.finishReason = candidates[0].finishReason;
  }
  const usage = b['usageMetadata'] as { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number } | undefined;
  if (usage) {
    call.tokens = {
      input: usage.promptTokenCount ?? 0,
      output: usage.candidatesTokenCount ?? 0,
      total: usage.totalTokenCount ?? (usage.promptTokenCount ?? 0) + (usage.candidatesTokenCount ?? 0),
    };
  }
}
