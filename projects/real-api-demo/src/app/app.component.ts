import { Component, ChangeDetectionStrategy, signal } from '@angular/core';

const PROXY = 'http://localhost:8787';

@Component({
  selector: 'app-root',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main>
      <header>
        <div class="eyebrow">ngx-ai-devtools · real-api test</div>
        <h1>Real API calls through a local proxy.</h1>
        <p>
          Keys live in <code>proxy/server.js</code> environment variables (never in the browser).
          Click a button to fire a real call. The panel records actual responses with actual tokens
          and actual cost.
        </p>
        <p class="warn">
          Heads up: each click costs real money (usually fractions of a cent, but real).
        </p>
        <p class="check">
          Proxy status: <strong>{{ proxyStatus() }}</strong>
        </p>
      </header>

      <section class="grid">
        <button class="card" (click)="fireOpenAi()">
          <span class="card__tag">openai</span>
          <span class="card__title">Chat completion</span>
          <span class="card__hint">gpt-4o-mini · cheapest</span>
        </button>
        <button class="card" (click)="fireOpenAiStream()">
          <span class="card__tag">openai</span>
          <span class="card__title">Streaming</span>
          <span class="card__hint">gpt-4o-mini · SSE</span>
        </button>
        <button class="card" (click)="fireAnthropic()">
          <span class="card__tag">anthropic</span>
          <span class="card__title">Messages</span>
          <span class="card__hint">claude-haiku · cheap</span>
        </button>
        <button class="card" (click)="fireAnthropicTool()">
          <span class="card__tag">anthropic</span>
          <span class="card__title">Tool use</span>
          <span class="card__hint">claude-haiku + weather tool</span>
        </button>
        <button class="card" (click)="fireGemini()">
          <span class="card__tag">google</span>
          <span class="card__title">generateContent</span>
          <span class="card__hint">gemini-2.5-flash</span>
        </button>
      </section>

      <footer>
        <p>Calls fired: <strong>{{ fireCount() }}</strong></p>
        <p class="checklist">Verify:</p>
        <ul>
          <li>Each call shows real token counts (varies per response)</li>
          <li>Cost matches the model's actual pricing</li>
          <li>Streaming text accumulates progressively in the response tab</li>
          <li>Tool-use shows actual model-issued arguments</li>
          <li>If you set wrong keys, calls fail with 401 and the panel shows the error</li>
        </ul>
        <p class="setup">
          Setup reminder:
          1. <code>cd proxy && set OPENAI_API_KEY=sk-... && set ANTHROPIC_API_KEY=sk-ant-... && set GOOGLE_API_KEY=...</code>
          2. <code>npm start</code> in the proxy folder (separate terminal)
          3. <code>npm start</code> in this folder
        </p>
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
      --ok: #4ade80;
      --warn: #f87171;
      display: block;
      min-height: 100vh;
    }
    main { max-width: 920px; margin: 0 auto; padding: 60px 24px 40px; }
    .eyebrow { font-family: ui-monospace, monospace; font-size: 12px; color: var(--accent); margin-bottom: 14px; }
    h1 { font-size: clamp(24px, 4vw, 38px); line-height: 1.15; letter-spacing: -0.02em; margin: 0 0 16px; font-weight: 600; }
    header p { font-size: 15px; color: var(--dim); margin: 0 0 12px; line-height: 1.6; }
    header code { font-family: ui-monospace, monospace; background: var(--surface); padding: 2px 6px; border-radius: 4px; font-size: 12.5px; color: var(--text); }
    .warn { color: var(--warn); font-size: 13px; }
    .check { margin-top: 16px; margin-bottom: 32px; font-family: ui-monospace, monospace; font-size: 13px; }
    .check strong { color: var(--accent); }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin-bottom: 40px; }
    .card {
      display: grid; gap: 4px; text-align: left;
      padding: 16px; background: var(--surface); border: 1px solid var(--border);
      border-radius: 10px; color: var(--text); cursor: pointer; font-family: inherit;
      transition: border-color .15s ease, transform .15s ease;
    }
    .card:hover { border-color: var(--accent); transform: translateY(-2px); }
    .card__tag { font-family: ui-monospace, monospace; font-size: 11px; color: var(--accent); letter-spacing: 0.04em; }
    .card__title { font-size: 15px; font-weight: 500; }
    .card__hint { font-size: 12px; color: var(--dim); font-family: ui-monospace, monospace; }
    footer { color: var(--dim); font-size: 13px; line-height: 1.7; }
    footer strong { color: var(--accent); font-family: ui-monospace, monospace; }
    .checklist { margin-top: 24px; color: var(--text); }
    footer ul { margin: 8px 0 24px; padding-left: 20px; }
    footer li { margin: 4px 0; }
    .setup { padding-top: 16px; border-top: 1px solid var(--border); font-size: 12px; }
    .setup code { display: block; margin: 4px 0; font-size: 11.5px; }
  `],
})
export class AppComponent {
  readonly fireCount = signal(0);
  readonly proxyStatus = signal<string>('checking...');

  constructor() { this.checkProxy(); }

  private async checkProxy(): Promise<void> {
    try {
      const r = await fetch(`${PROXY}/ai1/v1/chat/completions`, { method: 'OPTIONS' });
      this.proxyStatus.set(r.ok || r.status === 204 ? 'online ✓' : 'unexpected status: ' + r.status);
    } catch {
      this.proxyStatus.set('OFFLINE — start the proxy in the proxy/ folder');
    }
  }

  private async post(url: string, body: unknown): Promise<void> {
    this.fireCount.update((v) => v + 1);
    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (err) {
      console.error('Call failed:', err);
    }
  }

  fireOpenAi(): Promise<void> {
    return this.post(`${PROXY}/ai1/v1/chat/completions`, {
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are concise.' },
        { role: 'user', content: 'In one sentence: what are Angular signals?' },
      ],
      max_tokens: 80,
    });
  }

  fireOpenAiStream(): Promise<void> {
    return this.post(`${PROXY}/ai1/v1/chat/completions`, {
      model: 'gpt-4o-mini',
      stream: true,
      messages: [{ role: 'user', content: 'Write a haiku about debugging.' }],
      max_tokens: 80,
    });
  }

  fireAnthropic(): Promise<void> {
    return this.post(`${PROXY}/ai2/v1/messages`, {
      model: 'claude-sonnet-4-5',
      max_tokens: 80,
      messages: [{ role: 'user', content: 'In one sentence: what is Angular?' }],
    });
  }

  fireAnthropicTool(): Promise<void> {
    return this.post(`${PROXY}/ai2/v1/messages`, {
      model: 'claude-sonnet-4-5',
      max_tokens: 256,
      tools: [{
        name: 'get_weather',
        description: 'Get current weather for a city',
        input_schema: {
          type: 'object',
          properties: { city: { type: 'string', description: 'City name' } },
          required: ['city'],
        },
      }],
      messages: [{ role: 'user', content: "What's the weather in Karachi?" }],
    });
  }

  fireGemini(): Promise<void> {
    return this.post(`${PROXY}/ai3/v1beta/models/gemini-2.5-flash:generateContent`, {
      contents: [{ role: 'user', parts: [{ text: 'List three Angular best practices in one line each.' }] }],
      generationConfig: { maxOutputTokens: 200 },
    });
  }
}
