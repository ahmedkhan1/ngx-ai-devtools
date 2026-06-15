import { ChatMessage, LlmCall, ToolCall } from '../types';

export function isOpenAi(url: string): boolean {
  return url.includes('api.openai.com') || url.includes('/openai/');
}

export function parseOpenAiRequest(body: unknown, call: Partial<LlmCall>): void {
  if (!body || typeof body !== 'object') return;
  const b = body as Record<string, unknown>;
  if (typeof b['model'] === 'string') call.model = b['model'];
  if (Array.isArray(b['messages'])) {
    call.messages = (b['messages'] as ChatMessage[]).map((m) => ({
      role: m.role,
      content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
      name: m.name,
      tool_call_id: m.tool_call_id,
    }));
    const sys = call.messages.find((m) => m.role === 'system');
    if (sys) call.system = sys.content;
  }
  if (Array.isArray(b['tools'])) {
    call.tools = (b['tools'] as { type: string; function?: { name: string; description?: string } }[])
      .filter((t) => t.function)
      .map((t) => ({ name: t.function!.name, description: t.function!.description }));
  }
  if (b['stream'] === true) call.streaming = true;
}

export function parseOpenAiResponse(body: unknown, call: LlmCall): void {
  if (!body || typeof body !== 'object') return;
  const b = body as Record<string, unknown>;
  const choices = b['choices'] as { message?: { content?: string; tool_calls?: unknown[] }; finish_reason?: string }[] | undefined;
  if (Array.isArray(choices) && choices[0]) {
    const msg = choices[0].message;
    if (msg?.content) call.response = msg.content;
    if (Array.isArray(msg?.tool_calls)) {
      call.toolCalls = (msg.tool_calls as { function?: { name: string; arguments: string } }[])
        .filter((tc) => tc.function)
        .map((tc) => {
          let args: unknown = tc.function!.arguments;
          try { args = JSON.parse(tc.function!.arguments); } catch { /* keep string */ }
          return { name: tc.function!.name, arguments: args };
        });
    }
    if (choices[0].finish_reason) call.finishReason = choices[0].finish_reason;
  }
  const usage = b['usage'] as { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | undefined;
  if (usage) {
    call.tokens = {
      input: usage.prompt_tokens ?? 0,
      output: usage.completion_tokens ?? 0,
      total: usage.total_tokens ?? (usage.prompt_tokens ?? 0) + (usage.completion_tokens ?? 0),
    };
  }
}

/**
 * Accumulate a streamed OpenAI SSE chunk. Body is a single "data: {...}" line's JSON.
 * Mutates the call's response field and tool calls.
 */
export function accumulateOpenAiStream(chunk: unknown, call: LlmCall): void {
  if (!chunk || typeof chunk !== 'object') return;
  const c = chunk as Record<string, unknown>;
  const choices = c['choices'] as { delta?: { content?: string; tool_calls?: { index: number; function?: { name?: string; arguments?: string } }[] }; finish_reason?: string }[] | undefined;
  if (Array.isArray(choices) && choices[0]) {
    const delta = choices[0].delta;
    if (delta?.content) call.response = (call.response ?? '') + delta.content;
    if (Array.isArray(delta?.tool_calls)) {
      call.toolCalls = call.toolCalls ?? [];
      for (const tc of delta.tool_calls) {
        const existing = call.toolCalls[tc.index] as ToolCall | undefined;
        if (!existing) {
          call.toolCalls[tc.index] = {
            name: tc.function?.name ?? '',
            arguments: tc.function?.arguments ?? '',
          };
        } else {
          if (tc.function?.name) existing.name = tc.function.name;
          if (tc.function?.arguments) existing.arguments = (existing.arguments as string) + tc.function.arguments;
        }
      }
    }
    if (choices[0].finish_reason) call.finishReason = choices[0].finish_reason;
  }
  const usage = c['usage'] as { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | undefined;
  if (usage) {
    call.tokens = {
      input: usage.prompt_tokens ?? 0,
      output: usage.completion_tokens ?? 0,
      total: usage.total_tokens ?? (usage.prompt_tokens ?? 0) + (usage.completion_tokens ?? 0),
    };
  }
}
