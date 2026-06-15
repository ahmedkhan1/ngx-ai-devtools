import { Component, ChangeDetectionStrategy, inject, computed, signal } from '@angular/core';
import { AiDevtoolsService } from './ai-devtools.service';
import { LlmCall } from './types';

type Tab = 'overview' | 'messages' | 'response' | 'tools' | 'raw';

@Component({
  selector: 'ngx-ai-devtools',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let st = svc.stats();
    @let uiState = svc.ui();
    @let cfg = svc.getConfig();
    <div class="ngx-aidt-root" [attr.data-position]="cfg.position">
      <!-- Launcher -->
      @if (!uiState.open) {
        <button
          class="ngx-aidt-launcher"
          (click)="open()"
          [attr.aria-label]="'Open AI DevTools (' + st.count + ' calls, $' + st.totalCost.toFixed(4) + ')'"
        >
          <span class="ngx-aidt-launcher__dot"></span>
          <span class="ngx-aidt-launcher__cost">{{ formatCost(st.totalCost) }}</span>
          <span class="ngx-aidt-launcher__count">{{ st.count }}</span>
        </button>
      }

      <!-- Panel -->
      @if (uiState.open) {
        <section class="ngx-aidt-panel" role="dialog" aria-label="AI DevTools">
          <!-- Header -->
          <header class="ngx-aidt-header">
            <div class="ngx-aidt-header__title">
              <span class="ngx-aidt-logo">ai/devtools</span>
              <span class="ngx-aidt-header__separator">·</span>
              <span class="ngx-aidt-header__stat" title="Total calls">{{ st.count }} calls</span>
              <span class="ngx-aidt-header__separator">·</span>
              <span class="ngx-aidt-header__stat" title="Total tokens">{{ formatTokens(st.totalTokens) }} tokens</span>
              <span class="ngx-aidt-header__separator">·</span>
              <span class="ngx-aidt-header__stat ngx-aidt-header__stat--accent" title="Total cost">{{ formatCost(st.totalCost) }}</span>
              <span class="ngx-aidt-header__separator">·</span>
              <span class="ngx-aidt-header__stat" title="Average latency">{{ formatMs(st.avgLatency) }} avg</span>
            </div>
            <div class="ngx-aidt-header__actions">
              <input
                class="ngx-aidt-search"
                type="text"
                placeholder="Filter by model, content..."
                [value]="uiState.filter"
                (input)="svc.setFilter($any($event.target).value)"
              />
              <button class="ngx-aidt-btn" (click)="svc.clear()" title="Clear all">Clear</button>
              <button class="ngx-aidt-btn ngx-aidt-btn--close" (click)="close()" title="Close">×</button>
            </div>
          </header>

          <!-- Body: list + detail -->
          <div class="ngx-aidt-body">
            <!-- List -->
            <div class="ngx-aidt-list" role="list">
              @if (svc.filtered().length === 0) {
                <div class="ngx-aidt-empty">
                  <p class="ngx-aidt-empty__line">No calls intercepted yet.</p>
                  <p class="ngx-aidt-empty__hint">Make a request to OpenAI, Anthropic, Google, Mistral, Groq, or Cohere and it will appear here.</p>
                </div>
              }
              @for (call of svc.filtered(); track call.id) {
                <button
                  class="ngx-aidt-row"
                  role="listitem"
                  [class.ngx-aidt-row--selected]="uiState.selectedId === call.id"
                  [class.ngx-aidt-row--error]="call.status === 'error'"
                  (click)="svc.select(call.id)"
                >
                  <span class="ngx-aidt-row__dot" [attr.data-provider]="call.provider"></span>
                  <span class="ngx-aidt-row__model">{{ call.model ?? call.endpoint }}</span>
                  <span class="ngx-aidt-row__status">
                    @switch (call.status) {
                      @case ('pending') { <span class="ngx-aidt-spinner"></span> }
                      @case ('streaming') { <span class="ngx-aidt-row__streaming">streaming</span> }
                      @case ('error') { <span class="ngx-aidt-row__err">{{ call.statusCode ?? 'err' }}</span> }
                      @default { <span class="ngx-aidt-row__ok">{{ call.statusCode ?? 200 }}</span> }
                    }
                  </span>
                  <span class="ngx-aidt-row__latency">{{ formatMs(latencyOf(call)) }}</span>
                  <span class="ngx-aidt-row__cost">{{ call.cost ? formatCost(call.cost.total) : '—' }}</span>
                </button>
              }
            </div>

            <!-- Detail -->
            <div class="ngx-aidt-detail">
              @let sel = svc.selected();
              @if (!sel) {
                <div class="ngx-aidt-detail__placeholder">Select a call to inspect</div>
              } @else {
                <nav class="ngx-aidt-tabs">
                  @for (t of tabs; track t) {
                    <button
                      class="ngx-aidt-tab"
                      [class.ngx-aidt-tab--active]="tab() === t"
                      (click)="tab.set(t)"
                    >{{ t }}</button>
                  }
                  <div class="ngx-aidt-tabs__spacer"></div>
                  <button class="ngx-aidt-btn ngx-aidt-btn--ghost" (click)="copy(sel)" title="Copy as JSON">Copy</button>
                  <button class="ngx-aidt-btn ngx-aidt-btn--ghost" (click)="replay(sel)" title="Replay this call">Replay</button>
                </nav>

                <div class="ngx-aidt-pane">
                  @switch (tab()) {
                    @case ('overview') {
                      <dl class="ngx-aidt-dl">
                        <dt>Provider</dt><dd><span class="ngx-aidt-row__dot" [attr.data-provider]="sel.provider"></span> {{ sel.provider }}</dd>
                        <dt>Model</dt><dd class="ngx-aidt-mono">{{ sel.model ?? '—' }}</dd>
                        <dt>Endpoint</dt><dd class="ngx-aidt-mono ngx-aidt-truncate">{{ sel.method }} {{ sel.endpoint }}</dd>
                        <dt>Status</dt><dd>{{ sel.status }} <span class="ngx-aidt-dim">({{ sel.statusCode ?? '—' }})</span></dd>
                        <dt>Streaming</dt><dd>{{ sel.streaming ? 'yes' : 'no' }}</dd>
                        <dt>Latency</dt><dd>{{ formatMs(latencyOf(sel)) }}</dd>
                        @if (sel.firstTokenMs) { <dt>Time to first token</dt><dd>{{ formatMs(sel.firstTokenMs) }}</dd> }
                        @if (sel.tokens) {
                          <dt>Tokens</dt>
                          <dd>
                            <span class="ngx-aidt-chip">in {{ sel.tokens.input }}</span>
                            <span class="ngx-aidt-chip">out {{ sel.tokens.output }}</span>
                            <span class="ngx-aidt-chip ngx-aidt-chip--total">total {{ sel.tokens.total }}</span>
                          </dd>
                        }
                        @if (sel.cost) {
                          <dt>Cost</dt>
                          <dd class="ngx-aidt-cost-line">
                            <span class="ngx-aidt-chip">in {{ formatCost(sel.cost.input) }}</span>
                            <span class="ngx-aidt-chip">out {{ formatCost(sel.cost.output) }}</span>
                            <span class="ngx-aidt-chip ngx-aidt-chip--accent">total {{ formatCost(sel.cost.total) }}</span>
                          </dd>
                        }
                        @if (sel.finishReason) { <dt>Finish reason</dt><dd class="ngx-aidt-mono">{{ sel.finishReason }}</dd> }
                        @if (sel.error) { <dt>Error</dt><dd class="ngx-aidt-error">{{ sel.error }}</dd> }
                      </dl>
                    }
                    @case ('messages') {
                      @if (sel.system) {
                        <div class="ngx-aidt-msg ngx-aidt-msg--system">
                          <div class="ngx-aidt-msg__role">system</div>
                          <pre class="ngx-aidt-msg__body">{{ cfg.redact ? '[redacted]' : sel.system }}</pre>
                        </div>
                      }
                      @for (m of sel.messages ?? []; track $index) {
                        @if (m.role !== 'system') {
                          <div class="ngx-aidt-msg" [attr.data-role]="m.role">
                            <div class="ngx-aidt-msg__role">{{ m.role }}</div>
                            <pre class="ngx-aidt-msg__body">{{ cfg.redact ? '[redacted]' : m.content }}</pre>
                          </div>
                        }
                      }
                      @if (!sel.messages?.length && !sel.system) {
                        <div class="ngx-aidt-detail__placeholder">No messages parsed</div>
                      }
                    }
                    @case ('response') {
                      @if (sel.response) {
                        <pre class="ngx-aidt-response">{{ cfg.redact ? '[redacted]' : sel.response }}</pre>
                      } @else {
                        <div class="ngx-aidt-detail__placeholder">No response yet</div>
                      }
                    }
                    @case ('tools') {
                      @if (sel.tools?.length) {
                        <div class="ngx-aidt-section-label">Declared tools</div>
                        @for (t of sel.tools; track t.name) {
                          <div class="ngx-aidt-tool">
                            <div class="ngx-aidt-tool__name ngx-aidt-mono">{{ t.name }}</div>
                            @if (t.description) { <div class="ngx-aidt-tool__desc">{{ t.description }}</div> }
                          </div>
                        }
                      }
                      @if (sel.toolCalls?.length) {
                        <div class="ngx-aidt-section-label">Tool calls</div>
                        @for (tc of sel.toolCalls; track $index) {
                          <div class="ngx-aidt-tool">
                            <div class="ngx-aidt-tool__name ngx-aidt-mono">→ {{ tc.name }}</div>
                            <pre class="ngx-aidt-tool__args">{{ formatJson(tc.arguments) }}</pre>
                          </div>
                        }
                      }
                      @if (!sel.tools?.length && !sel.toolCalls?.length) {
                        <div class="ngx-aidt-detail__placeholder">No tools used</div>
                      }
                    }
                    @case ('raw') {
                      <div class="ngx-aidt-section-label">Request</div>
                      <pre class="ngx-aidt-raw">{{ formatJson(sel.rawRequest) }}</pre>
                      <div class="ngx-aidt-section-label">Response</div>
                      <pre class="ngx-aidt-raw">{{ formatJson(sel.rawResponse) }}</pre>
                    }
                  }
                </div>
              }
            </div>
          </div>
        </section>
      }
    </div>
  `,
  styles: [`
    /* ---------------------------------------------------------------------
       ngx-ai-devtools — scoped UI styles. Self-contained, no external CSS.
       Palette: deep ink base + warm amber accent (chosen against Chrome's
       default cool blue, to feel like an editorial tool rather than a clone).
    --------------------------------------------------------------------- */
    :host {
      --aidt-bg: #0c0d12;
      --aidt-bg-2: #14161e;
      --aidt-bg-3: #1c1f29;
      --aidt-border: #262a36;
      --aidt-border-strong: #353a4a;
      --aidt-text: #e6e7ec;
      --aidt-text-dim: #8b8f9c;
      --aidt-text-mute: #5a5e6b;
      --aidt-accent: #f5a524;
      --aidt-accent-soft: rgba(245, 165, 36, 0.12);
      --aidt-ok: #4ade80;
      --aidt-err: #f87171;
      --aidt-info: #60a5fa;
      --aidt-mono: ui-monospace, 'JetBrains Mono', SFMono-Regular, Menlo, monospace;
      --aidt-sans: ui-sans-serif, system-ui, -apple-system, 'Inter', sans-serif;
    }
    .ngx-aidt-root {
      position: fixed;
      z-index: 2147483646;
      font-family: var(--aidt-sans);
      font-size: 12px;
      color: var(--aidt-text);
      pointer-events: none;
    }
    .ngx-aidt-root > * { pointer-events: auto; }
    .ngx-aidt-root[data-position='bottom-right'] { right: 16px; bottom: 16px; }
    .ngx-aidt-root[data-position='bottom-left']  { left: 16px;  bottom: 16px; }
    .ngx-aidt-root[data-position='top-right']    { right: 16px; top: 16px; }
    .ngx-aidt-root[data-position='top-left']     { left: 16px;  top: 16px; }

    /* Launcher --------------------------------------------------------- */
    .ngx-aidt-launcher {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px 8px 10px;
      background: var(--aidt-bg);
      color: var(--aidt-text);
      border: 1px solid var(--aidt-border);
      border-radius: 999px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.32), 0 0 0 1px rgba(255,255,255,0.02) inset;
      font-family: var(--aidt-mono);
      font-size: 12px;
      cursor: pointer;
      transition: transform .12s ease, border-color .12s ease;
    }
    .ngx-aidt-launcher:hover { transform: translateY(-1px); border-color: var(--aidt-border-strong); }
    .ngx-aidt-launcher__dot {
      width: 8px; height: 8px; border-radius: 50%;
      background: var(--aidt-accent);
      box-shadow: 0 0 12px var(--aidt-accent);
    }
    .ngx-aidt-launcher__cost { color: var(--aidt-accent); }
    .ngx-aidt-launcher__count {
      color: var(--aidt-text-dim);
      padding-left: 8px;
      border-left: 1px solid var(--aidt-border);
    }

    /* Panel ------------------------------------------------------------ */
    .ngx-aidt-panel {
      width: min(1100px, calc(100vw - 32px));
      height: min(640px, calc(100vh - 32px));
      display: flex; flex-direction: column;
      background: var(--aidt-bg);
      border: 1px solid var(--aidt-border);
      border-radius: 14px;
      box-shadow: 0 32px 80px rgba(0,0,0,0.6);
      overflow: hidden;
    }
    .ngx-aidt-header {
      display: flex; align-items: center; justify-content: space-between;
      gap: 12px; padding: 10px 14px;
      background: var(--aidt-bg-2);
      border-bottom: 1px solid var(--aidt-border);
    }
    .ngx-aidt-header__title { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .ngx-aidt-logo {
      font-family: var(--aidt-mono);
      letter-spacing: -0.02em;
      color: var(--aidt-text);
    }
    .ngx-aidt-logo::before {
      content: '';
      display: inline-block; width: 6px; height: 6px;
      background: var(--aidt-accent); border-radius: 50%;
      margin-right: 8px; vertical-align: 1px;
    }
    .ngx-aidt-header__separator { color: var(--aidt-text-mute); }
    .ngx-aidt-header__stat { font-family: var(--aidt-mono); color: var(--aidt-text-dim); }
    .ngx-aidt-header__stat--accent { color: var(--aidt-accent); }
    .ngx-aidt-header__actions { display: flex; align-items: center; gap: 6px; }
    .ngx-aidt-search {
      background: var(--aidt-bg-3);
      border: 1px solid var(--aidt-border);
      color: var(--aidt-text);
      padding: 6px 10px; border-radius: 6px;
      font-family: var(--aidt-sans); font-size: 12px;
      width: 220px;
    }
    .ngx-aidt-search:focus { outline: 1px solid var(--aidt-accent); border-color: var(--aidt-accent); }
    .ngx-aidt-btn {
      background: var(--aidt-bg-3);
      color: var(--aidt-text);
      border: 1px solid var(--aidt-border);
      padding: 6px 10px; border-radius: 6px;
      font-family: var(--aidt-sans); font-size: 12px;
      cursor: pointer; transition: background .12s ease;
    }
    .ngx-aidt-btn:hover { background: var(--aidt-border); }
    .ngx-aidt-btn--ghost { background: transparent; }
    .ngx-aidt-btn--close { padding: 4px 9px; font-size: 16px; line-height: 1; }

    /* Body ------------------------------------------------------------- */
    .ngx-aidt-body {
      flex: 1; min-height: 0;
      display: grid; grid-template-columns: 360px 1fr;
    }
    .ngx-aidt-list {
      border-right: 1px solid var(--aidt-border);
      overflow-y: auto;
      background: var(--aidt-bg);
    }
    .ngx-aidt-row {
      display: grid;
      grid-template-columns: 10px 1fr auto auto auto;
      gap: 10px; align-items: center;
      width: 100%;
      padding: 9px 14px;
      background: transparent;
      border: none; border-bottom: 1px solid var(--aidt-border);
      color: var(--aidt-text);
      text-align: left; cursor: pointer;
      font-family: var(--aidt-mono); font-size: 11.5px;
    }
    .ngx-aidt-row:hover { background: var(--aidt-bg-2); }
    .ngx-aidt-row--selected { background: var(--aidt-accent-soft); }
    .ngx-aidt-row--selected:hover { background: var(--aidt-accent-soft); }
    .ngx-aidt-row__dot {
      width: 8px; height: 8px; border-radius: 50%; background: var(--aidt-text-mute);
    }
    .ngx-aidt-row__dot[data-provider='openai']    { background: #10a37f; }
    .ngx-aidt-row__dot[data-provider='anthropic'] { background: #d97706; }
    .ngx-aidt-row__dot[data-provider='google']    { background: #4285f4; }
    .ngx-aidt-row__dot[data-provider='mistral']   { background: #ff7000; }
    .ngx-aidt-row__dot[data-provider='cohere']    { background: #ff7759; }
    .ngx-aidt-row__dot[data-provider='groq']      { background: #f55036; }
    .ngx-aidt-row__model { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .ngx-aidt-row__status { font-size: 10.5px; }
    .ngx-aidt-row__ok { color: var(--aidt-ok); }
    .ngx-aidt-row__err { color: var(--aidt-err); }
    .ngx-aidt-row__streaming { color: var(--aidt-info); animation: aidt-pulse 1.4s ease-in-out infinite; }
    .ngx-aidt-row__latency { color: var(--aidt-text-dim); }
    .ngx-aidt-row__cost { color: var(--aidt-accent); }
    .ngx-aidt-row--error .ngx-aidt-row__model { color: var(--aidt-err); }
    @keyframes aidt-pulse { 0%, 100% { opacity: 0.6; } 50% { opacity: 1; } }

    .ngx-aidt-spinner {
      display: inline-block; width: 10px; height: 10px;
      border: 1.5px solid var(--aidt-border-strong);
      border-top-color: var(--aidt-accent);
      border-radius: 50%; animation: aidt-spin .8s linear infinite;
    }
    @keyframes aidt-spin { to { transform: rotate(360deg); } }

    .ngx-aidt-empty {
      padding: 32px 20px;
      color: var(--aidt-text-dim);
    }
    .ngx-aidt-empty__line { margin: 0 0 6px; }
    .ngx-aidt-empty__hint { margin: 0; font-size: 11px; color: var(--aidt-text-mute); line-height: 1.5; }

    /* Detail ----------------------------------------------------------- */
    .ngx-aidt-detail { display: flex; flex-direction: column; min-width: 0; }
    .ngx-aidt-detail__placeholder {
      padding: 40px; text-align: center; color: var(--aidt-text-mute);
    }
    .ngx-aidt-tabs {
      display: flex; gap: 4px; padding: 6px 10px;
      background: var(--aidt-bg-2);
      border-bottom: 1px solid var(--aidt-border);
      align-items: center;
    }
    .ngx-aidt-tab {
      background: transparent;
      border: 1px solid transparent;
      color: var(--aidt-text-dim);
      padding: 5px 10px; border-radius: 5px;
      font-family: var(--aidt-sans); font-size: 11.5px;
      cursor: pointer; text-transform: lowercase;
    }
    .ngx-aidt-tab:hover { color: var(--aidt-text); }
    .ngx-aidt-tab--active {
      color: var(--aidt-accent);
      background: var(--aidt-accent-soft);
    }
    .ngx-aidt-tabs__spacer { flex: 1; }

    .ngx-aidt-pane {
      flex: 1; overflow-y: auto;
      padding: 16px 18px;
    }
    .ngx-aidt-dl {
      display: grid;
      grid-template-columns: 160px 1fr;
      gap: 10px 16px;
      margin: 0;
    }
    .ngx-aidt-dl dt { color: var(--aidt-text-dim); font-size: 11.5px; }
    .ngx-aidt-dl dd { margin: 0; }
    .ngx-aidt-mono { font-family: var(--aidt-mono); }
    .ngx-aidt-truncate { overflow-wrap: anywhere; }
    .ngx-aidt-dim { color: var(--aidt-text-mute); }
    .ngx-aidt-error { color: var(--aidt-err); }
    .ngx-aidt-chip {
      display: inline-block;
      padding: 2px 7px;
      margin-right: 6px;
      background: var(--aidt-bg-3);
      border: 1px solid var(--aidt-border);
      border-radius: 4px;
      font-family: var(--aidt-mono);
      font-size: 11px;
      color: var(--aidt-text);
    }
    .ngx-aidt-chip--total { color: var(--aidt-text); }
    .ngx-aidt-chip--accent { color: var(--aidt-accent); border-color: var(--aidt-accent); }
    .ngx-aidt-cost-line { display: flex; flex-wrap: wrap; }

    .ngx-aidt-msg {
      margin-bottom: 12px;
      border: 1px solid var(--aidt-border);
      border-radius: 6px;
      overflow: hidden;
    }
    .ngx-aidt-msg__role {
      padding: 6px 10px;
      background: var(--aidt-bg-2);
      color: var(--aidt-text-dim);
      font-family: var(--aidt-mono);
      font-size: 11px;
      text-transform: lowercase;
      border-bottom: 1px solid var(--aidt-border);
    }
    .ngx-aidt-msg[data-role='user'] .ngx-aidt-msg__role { color: var(--aidt-info); }
    .ngx-aidt-msg[data-role='assistant'] .ngx-aidt-msg__role { color: var(--aidt-accent); }
    .ngx-aidt-msg[data-role='tool'] .ngx-aidt-msg__role { color: var(--aidt-ok); }
    .ngx-aidt-msg__body {
      margin: 0;
      padding: 10px 12px;
      font-family: var(--aidt-mono);
      font-size: 12px;
      line-height: 1.55;
      white-space: pre-wrap;
      word-break: break-word;
      color: var(--aidt-text);
    }

    .ngx-aidt-response {
      margin: 0;
      padding: 14px 16px;
      background: var(--aidt-bg-2);
      border: 1px solid var(--aidt-border);
      border-radius: 6px;
      font-family: var(--aidt-mono);
      font-size: 12.5px;
      line-height: 1.6;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .ngx-aidt-section-label {
      font-family: var(--aidt-mono);
      font-size: 10.5px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--aidt-text-mute);
      margin: 6px 0 8px;
    }
    .ngx-aidt-section-label + .ngx-aidt-section-label { margin-top: 18px; }

    .ngx-aidt-tool {
      padding: 10px 12px;
      background: var(--aidt-bg-2);
      border: 1px solid var(--aidt-border);
      border-radius: 6px;
      margin-bottom: 8px;
    }
    .ngx-aidt-tool__name { font-size: 12px; color: var(--aidt-accent); margin-bottom: 4px; }
    .ngx-aidt-tool__desc { font-size: 11.5px; color: var(--aidt-text-dim); }
    .ngx-aidt-tool__args {
      margin: 6px 0 0;
      font-family: var(--aidt-mono);
      font-size: 11.5px;
      color: var(--aidt-text);
      white-space: pre-wrap;
      word-break: break-word;
    }

    .ngx-aidt-raw {
      margin: 0 0 16px;
      padding: 12px 14px;
      background: var(--aidt-bg-2);
      border: 1px solid var(--aidt-border);
      border-radius: 6px;
      font-family: var(--aidt-mono);
      font-size: 11.5px;
      line-height: 1.55;
      max-height: 320px;
      overflow: auto;
      white-space: pre;
    }

    /* Mobile ----------------------------------------------------------- */
    @media (max-width: 720px) {
      .ngx-aidt-panel {
        width: calc(100vw - 16px);
        height: calc(100vh - 16px);
        border-radius: 10px;
      }
      .ngx-aidt-body { grid-template-columns: 1fr; }
      .ngx-aidt-list { max-height: 240px; border-right: none; border-bottom: 1px solid var(--aidt-border); }
      .ngx-aidt-search { width: 130px; }
    }
  `],
})
export class AiDevtoolsComponent {
  readonly svc = inject(AiDevtoolsService);
  readonly tab = signal<Tab>('overview');
  readonly tabs: Tab[] = ['overview', 'messages', 'response', 'tools', 'raw'];

  open(): void { this.svc.setOpen(true); }
  close(): void { this.svc.setOpen(false); }

  latencyOf(call: LlmCall): number {
    if (!call.endedAt) return Date.now() - call.startedAt;
    return call.endedAt - call.startedAt;
  }

  formatCost(n: number): string {
    if (n === 0) return '$0.00';
    if (n < 0.0001) return `$${n.toExponential(2)}`;
    if (n < 0.01) return `$${n.toFixed(5)}`;
    if (n < 1) return `$${n.toFixed(4)}`;
    return `$${n.toFixed(2)}`;
  }

  formatTokens(n: number): string {
    if (n < 1000) return String(n);
    if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
    return `${(n / 1_000_000).toFixed(2)}M`;
  }

  formatMs(n: number): string {
    if (!n) return '—';
    if (n < 1000) return `${Math.round(n)}ms`;
    return `${(n / 1000).toFixed(2)}s`;
  }

  formatJson(value: unknown): string {
    if (value == null) return '—';
    try { return JSON.stringify(value, null, 2); } catch { return String(value); }
  }

  copy(call: LlmCall): void {
    try { navigator.clipboard.writeText(JSON.stringify(call, null, 2)); } catch { /* ignore */ }
  }

  replay(call: LlmCall): void {
    void this.svc.replay(call.id);
  }
}
