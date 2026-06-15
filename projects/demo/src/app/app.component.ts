import { Component, ChangeDetectionStrategy, signal } from '@angular/core';
import { mockRespond } from './mock-fetch';

// Register canned responses once.
mockRespond('https://api.openai.com/v1/chat/completions', () => ({
  body: {
    id: 'chatcmpl-' + Math.random().toString(36).slice(2, 8),
    object: 'chat.completion',
    model: 'gpt-4o',
    choices: [{
      index: 0,
      message: {
        role: 'assistant',
        content: 'Angular signals are reactive primitives that hold a value and notify subscribers when it changes, enabling fine-grained, zoneless change detection.',
      },
      finish_reason: 'stop',
    }],
    usage: { prompt_tokens: 28, completion_tokens: 34, total_tokens: 62 },
  },
}));

mockRespond('https://api.anthropic.com/v1/messages', () => ({
  body: {
    id: 'msg_' + Math.random().toString(36).slice(2, 8),
    type: 'message',
    role: 'assistant',
    model: 'claude-sonnet-4-20250514',
    content: [
      { type: 'text', text: "I'll check the weather for you." },
      { type: 'tool_use', name: 'get_weather', input: { city: 'Karachi' }, id: 'toolu_abc' },
    ],
    stop_reason: 'tool_use',
    usage: { input_tokens: 142, output_tokens: 38 },
  },
}));

mockRespond('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent', () => ({
  body: {
    candidates: [{
      content: {
        parts: [{ text: '1. Use signals for state.\n2. Prefer standalone components.\n3. Avoid effect() for derived state — use computed().' }],
      },
      finishReason: 'STOP',
    }],
    usageMetadata: { promptTokenCount: 14, candidatesTokenCount: 32, totalTokenCount: 46 },
  },
}));

mockRespond('https://api.openai.com/v1/chat/completions?stream=1', () => ({
  stream: [
    `data: ${JSON.stringify({ choices: [{ delta: { role: 'assistant' } }] })}\n\n`,
    `data: ${JSON.stringify({ choices: [{ delta: { content: 'Signals ' } }] })}\n\n`,
    `data: ${JSON.stringify({ choices: [{ delta: { content: 'replace ' } }] })}\n\n`,
    `data: ${JSON.stringify({ choices: [{ delta: { content: 'zone.js-based ' } }] })}\n\n`,
    `data: ${JSON.stringify({ choices: [{ delta: { content: 'change detection ' } }] })}\n\n`,
    `data: ${JSON.stringify({ choices: [{ delta: { content: 'with explicit ' } }] })}\n\n`,
    `data: ${JSON.stringify({ choices: [{ delta: { content: 'reactive primitives.' } }] })}\n\n`,
    `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 18, completion_tokens: 11, total_tokens: 29 } })}\n\n`,
    `data: [DONE]\n\n`,
  ],
}));

mockRespond('https://api.openai.com/v1/chat/completions?err=1', () => ({
  status: 401,
  body: { error: { message: 'Incorrect API key provided', type: 'invalid_request_error' } },
}));

@Component({
  selector: 'demo-root',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main>
      <header class="hero">
        <div class="eyebrow">ngx-ai-devtools · demo</div>
        <h1>See every LLM call your Angular app makes.</h1>
        <p class="lede">
          Click any button below to fire a simulated request. Open the panel in the
          bottom-right to inspect prompts, responses, tokens, and cost.
        </p>
      </header>

      <section class="grid">
        <button class="card" (click)="fireOpenAi()">
          <span class="card__provider">openai</span>
          <span class="card__title">Chat completion</span>
          <span class="card__hint">gpt-4o · non-streaming</span>
        </button>
        <button class="card" (click)="fireAnthropic()">
          <span class="card__provider">anthropic</span>
          <span class="card__title">Messages</span>
          <span class="card__hint">claude-sonnet-4 · with tool</span>
        </button>
        <button class="card" (click)="fireGoogle()">
          <span class="card__provider">google</span>
          <span class="card__title">generateContent</span>
          <span class="card__hint">gemini-2.5-pro</span>
        </button>
        <button class="card" (click)="fireStream()">
          <span class="card__provider">openai</span>
          <span class="card__title">Streaming completion</span>
          <span class="card__hint">gpt-4o-mini · SSE</span>
        </button>
        <button class="card" (click)="fireError()">
          <span class="card__provider">error</span>
          <span class="card__title">Failed request</span>
          <span class="card__hint">401 · invalid key</span>
        </button>
        <button class="card" (click)="fireBurst()">
          <span class="card__provider">burst</span>
          <span class="card__title">Fire 10 calls</span>
          <span class="card__hint">stress test the list</span>
        </button>
      </section>

      <footer>
        <p>This session: <strong>{{ fireCount() }}</strong> calls fired</p>
        <p class="footnote">In a real app, you'd just call OpenAI/Anthropic/Gemini SDKs as normal. This demo mocks the network so it works without API keys.</p>
      </footer>
    </main>
  `,
  styles: [`
    :host {
      --bg: #0a0b10;
      --surface: #11131a;
      --border: #20232e;
      --text: #e6e7ec;
      --dim: #8b8f9c;
      --accent: #f5a524;
      display: block;
      min-height: 100vh;
      background:
        radial-gradient(circle at 20% 10%, rgba(245, 165, 36, 0.06), transparent 40%),
        radial-gradient(circle at 80% 90%, rgba(96, 165, 250, 0.05), transparent 40%),
        var(--bg);
      color: var(--text);
      font-family: ui-sans-serif, system-ui, sans-serif;
    }
    main { max-width: 960px; margin: 0 auto; padding: 80px 24px 40px; }
    .eyebrow {
      font-family: ui-monospace, monospace;
      font-size: 12px;
      color: var(--accent);
      letter-spacing: 0.02em;
      margin-bottom: 14px;
    }
    h1 {
      font-size: clamp(32px, 5vw, 52px);
      line-height: 1.05;
      letter-spacing: -0.025em;
      margin: 0 0 16px;
      font-weight: 600;
    }
    .lede {
      font-size: 16px;
      color: var(--dim);
      max-width: 56ch;
      line-height: 1.6;
      margin: 0 0 48px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 12px;
    }
    .card {
      display: grid; gap: 4px; text-align: left;
      padding: 18px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 10px;
      color: var(--text);
      cursor: pointer;
      font-family: inherit;
      transition: border-color .15s ease, transform .15s ease;
    }
    .card:hover { border-color: var(--accent); transform: translateY(-2px); }
    .card__provider {
      font-family: ui-monospace, monospace;
      font-size: 11px;
      color: var(--accent);
      text-transform: lowercase;
      letter-spacing: 0.04em;
    }
    .card__title { font-size: 15px; font-weight: 500; }
    .card__hint { font-size: 12px; color: var(--dim); font-family: ui-monospace, monospace; }
    footer { margin-top: 40px; color: var(--dim); font-size: 13px; }
    footer strong { color: var(--accent); }
    .footnote { color: #5a5e6b; font-size: 11.5px; margin-top: 8px; max-width: 56ch; line-height: 1.5; }
  `],
})
export class AppComponent {
  readonly fireCount = signal(0);

  private async post(url: string, body: unknown): Promise<void> {
    this.fireCount.update((v) => v + 1);
    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch { /* swallow — error case is intentional */ }
  }

  fireOpenAi(): Promise<void> {
    return this.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are a concise assistant.' },
        { role: 'user', content: 'Explain Angular signals in one sentence.' },
      ],
    });
  }

  fireAnthropic(): Promise<void> {
    return this.post('https://api.anthropic.com/v1/messages', {
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: 'You are a helpful coding assistant.',
      messages: [{ role: 'user', content: "What's the weather in Karachi?" }],
      tools: [{
        name: 'get_weather',
        description: 'Get current weather for a city',
        input_schema: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] },
      }],
    });
  }

  fireGoogle(): Promise<void> {
    return this.post(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent',
      {
        contents: [{ role: 'user', parts: [{ text: 'List three Angular best practices.' }] }],
        systemInstruction: { parts: [{ text: 'Be terse.' }] },
      },
    );
  }

  fireStream(): Promise<void> {
    return this.post('https://api.openai.com/v1/chat/completions?stream=1', {
      model: 'gpt-4o-mini',
      stream: true,
      messages: [{ role: 'user', content: 'In one line, what are Angular signals?' }],
    });
  }

  fireError(): Promise<void> {
    return this.post('https://api.openai.com/v1/chat/completions?err=1', {
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'hi' }],
    });
  }

  async fireBurst(): Promise<void> {
    const variants = [() => this.fireOpenAi(), () => this.fireAnthropic(), () => this.fireGoogle()];
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 120));
      void variants[i % variants.length]!();
    }
  }
}
