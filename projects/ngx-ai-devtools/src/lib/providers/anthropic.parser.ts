import { ChatMessage, LlmCall, ToolCall } from '../types';

export function isAnthropic(url: string): boolean {
  return url.includes('api.anthropic.com');
}

export function parseAnthropicRequest(body: unknown, call: Partial<LlmCall>): void {
  if (!body || typeof body !== 'object') return;
  const b = body as Record<string, unknown>;
  if (typeof b['model'] === 'string') call.model = b['model'];
  if (typeof b['system'] === 'string') call.system = b['system'];
  if (Array.isArray(b['messages'])) {
    call.messages = (b['messages'] as { role: string; content: unknown }[]).map((m) => ({
      role: m.role as ChatMessage['role'],
      content:
        typeof m.content === 'string'
          ? m.content
          : Array.isArray(m.content)
            ? (m.content as { type: string; text?: string }[])
                .map((c) => (c.type === 'text' ? c.text ?? '' : `[${c.type}]`))
                .join('\n')
            : JSON.stringify(m.content),
    }));
  }
  if (Array.isArray(b['tools'])) {
    call.tools = (b['tools'] as { name: string; description?: string }[]).map((t) => ({
      name: t.name,
      description: t.description,
    }));
  }
  if (b['stream'] === true) call.streaming = true;
}

export function parseAnthropicResponse(body: unknown, call: LlmCall): void {
  if (!body || typeof body !== 'object') return;
  const b = body as Record<string, unknown>;
  const content = b['content'] as { type: string; text?: string; name?: string; input?: unknown; id?: string }[] | undefined;
  if (Array.isArray(content)) {
    const texts: string[] = [];
    const toolCalls: ToolCall[] = [];
    for (const block of content) {
      if (block.type === 'text' && block.text) texts.push(block.text);
      if (block.type === 'tool_use') {
        toolCalls.push({ name: block.name ?? '', arguments: block.input ?? {} });
      }
    }
    if (texts.length) call.response = texts.join('\n');
    if (toolCalls.length) call.toolCalls = toolCalls;
  }
  if (typeof b['stop_reason'] === 'string') call.finishReason = b['stop_reason'] as string;
  const usage = b['usage'] as { input_tokens?: number; output_tokens?: number } | undefined;
  if (usage) {
    call.tokens = {
      input: usage.input_tokens ?? 0,
      output: usage.output_tokens ?? 0,
      total: (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0),
    };
  }
}

/**
 * Anthropic streams emit named SSE events. This handles one parsed event payload.
 */
export function accumulateAnthropicStream(eventType: string, data: unknown, call: LlmCall): void {
  if (!data || typeof data !== 'object') return;
  const d = data as Record<string, unknown>;

  if (eventType === 'content_block_start') {
    const block = d['content_block'] as { type: string; name?: string } | undefined;
    if (block?.type === 'tool_use') {
      call.toolCalls = call.toolCalls ?? [];
      const index = d['index'] as number;
      call.toolCalls[index] = { name: block.name ?? '', arguments: '' };
    }
  }

  if (eventType === 'content_block_delta') {
    const delta = d['delta'] as { type: string; text?: string; partial_json?: string } | undefined;
    const index = d['index'] as number;
    if (delta?.type === 'text_delta' && delta.text) {
      call.response = (call.response ?? '') + delta.text;
    }
    if (delta?.type === 'input_json_delta' && delta.partial_json) {
      call.toolCalls = call.toolCalls ?? [];
      const tc = call.toolCalls[index];
      if (tc) tc.arguments = (tc.arguments as string) + delta.partial_json;
    }
  }

  if (eventType === 'message_delta') {
    const delta = d['delta'] as { stop_reason?: string } | undefined;
    if (delta?.stop_reason) call.finishReason = delta.stop_reason;
    const usage = d['usage'] as { output_tokens?: number } | undefined;
    if (usage?.output_tokens != null) {
      call.tokens = call.tokens ?? { input: 0, output: 0, total: 0 };
      call.tokens.output = usage.output_tokens;
      call.tokens.total = call.tokens.input + call.tokens.output;
    }
  }

  if (eventType === 'message_start') {
    const msg = d['message'] as { usage?: { input_tokens?: number } } | undefined;
    if (msg?.usage?.input_tokens != null) {
      call.tokens = call.tokens ?? { input: 0, output: 0, total: 0 };
      call.tokens.input = msg.usage.input_tokens;
      call.tokens.total = call.tokens.input + call.tokens.output;
    }
  }
}
