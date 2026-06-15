import { Injectable, signal, computed, Signal, inject, ApplicationRef, createComponent, EnvironmentInjector } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { AiDevtoolsConfig, LlmCall } from './types';
import { detectProvider, isLlmEndpoint, parseRequest, parseResponse, accumulateStream } from './providers';
import { calculateCost } from './pricing';

const STORAGE_KEY = 'ngx-ai-devtools:calls';
const CONFIG_KEY = 'ngx-ai-devtools:ui';

interface UiState {
  open: boolean;
  selectedId: string | null;
  filter: string;
}

/**
 * Default config — applied when callers omit fields. Kept as a constant so
 * tests and consumers can inspect what "unset" means.
 */
const DEFAULTS: Required<AiDevtoolsConfig> = {
  enabled: true,
  maxCalls: 100,
  persist: false,
  autoMount: true,
  position: 'bottom-right',
  redact: false,
  additionalEndpoints: [],
};

@Injectable({ providedIn: 'root' })
export class AiDevtoolsService {
  private readonly doc = inject(DOCUMENT);
  private readonly appRef = inject(ApplicationRef);
  private readonly envInjector = inject(EnvironmentInjector);

  private config: Required<AiDevtoolsConfig> = DEFAULTS;
  private originalFetch: typeof fetch | null = null;
  private mounted = false;

  /** All recorded calls, newest first. */
  readonly calls = signal<LlmCall[]>([]);

  /** UI state — open/closed, selected call, filter text. */
  readonly ui = signal<UiState>({ open: false, selectedId: null, filter: '' });

  /** Aggregate stats for the header bar. */
  readonly stats: Signal<{ count: number; totalCost: number; totalTokens: number; avgLatency: number }> = computed(() => {
    const list = this.calls();
    if (!list.length) return { count: 0, totalCost: 0, totalTokens: 0, avgLatency: 0 };
    let totalCost = 0;
    let totalTokens = 0;
    let totalLatency = 0;
    let latencyCount = 0;
    for (const c of list) {
      if (c.cost) totalCost += c.cost.total;
      if (c.tokens) totalTokens += c.tokens.total;
      if (c.endedAt) {
        totalLatency += c.endedAt - c.startedAt;
        latencyCount++;
      }
    }
    return {
      count: list.length,
      totalCost,
      totalTokens,
      avgLatency: latencyCount ? totalLatency / latencyCount : 0,
    };
  });

  /** Calls filtered by the current UI filter string. */
  readonly filtered: Signal<LlmCall[]> = computed(() => {
    const f = this.ui().filter.trim().toLowerCase();
    if (!f) return this.calls();
    return this.calls().filter(
      (c) =>
        c.model?.toLowerCase().includes(f) ||
        c.provider.toLowerCase().includes(f) ||
        c.response?.toLowerCase().includes(f) ||
        c.messages?.some((m) => m.content.toLowerCase().includes(f)),
    );
  });

  /** The currently selected call, for the detail pane. */
  readonly selected: Signal<LlmCall | null> = computed(() => {
    const id = this.ui().selectedId;
    if (!id) return null;
    return this.calls().find((c) => c.id === id) ?? null;
  });

  /**
   * Initialize with merged config. Called by `provideAiDevtools()`. Safe to call once.
   */
  initialize(config: AiDevtoolsConfig): void {
    this.config = { ...DEFAULTS, ...config };
    if (!this.config.enabled) return;
    if (typeof window === 'undefined') return; // SSR safe

    this.restoreFromStorage();
    this.patchFetch();
    if (this.config.autoMount) this.mountUi();
  }

  /** Read-only config access for the component. */
  getConfig(): Required<AiDevtoolsConfig> {
    return this.config;
  }

  /** Clear all recorded calls. */
  clear(): void {
    this.calls.set([]);
    this.ui.update((s) => ({ ...s, selectedId: null }));
    if (this.config.persist) {
      try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    }
  }

  /** Open or close the panel. */
  setOpen(open: boolean): void {
    this.ui.update((s) => ({ ...s, open }));
    try { localStorage.setItem(CONFIG_KEY, JSON.stringify({ open })); } catch { /* ignore */ }
  }

  /** Select a call by id (or null to deselect). */
  select(id: string | null): void {
    this.ui.update((s) => ({ ...s, selectedId: id }));
  }

  /** Update the search/filter string. */
  setFilter(filter: string): void {
    this.ui.update((s) => ({ ...s, filter }));
  }

  /**
   * Re-issue a recorded call against the same endpoint. Returns the new call's id.
   * The caller is responsible for providing a working auth header (we don't store keys).
   */
  async replay(id: string): Promise<string | null> {
    const original = this.calls().find((c) => c.id === id);
    if (!original || !original.rawRequest) return null;
    const res = await fetch(original.url, {
      method: original.method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(original.rawRequest),
    });
    // The patched fetch will record this; return the latest call id.
    void res;
    return this.calls()[0]?.id ?? null;
  }

  // ------------------------------------------------------------------
  // Internals
  // ------------------------------------------------------------------

  private restoreFromStorage(): void {
    if (!this.config.persist) return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as LlmCall[];
        if (Array.isArray(parsed)) this.calls.set(parsed.slice(0, this.config.maxCalls));
      }
      const uiRaw = localStorage.getItem(CONFIG_KEY);
      if (uiRaw) {
        const ui = JSON.parse(uiRaw) as { open?: boolean };
        if (typeof ui.open === 'boolean') this.ui.update((s) => ({ ...s, open: ui.open! }));
      }
    } catch { /* ignore */ }
  }

  private saveToStorage(): void {
    if (!this.config.persist) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.calls()));
    } catch { /* ignore quota errors */ }
  }

  private addCall(call: LlmCall): void {
    this.calls.update((list) => {
      const next = [call, ...list];
      if (next.length > this.config.maxCalls) next.length = this.config.maxCalls;
      return next;
    });
    this.saveToStorage();
  }

  private updateCall(id: string, patch: Partial<LlmCall>): void {
    this.calls.update((list) => {
      const idx = list.findIndex((c) => c.id === id);
      if (idx === -1) return list;
      const next = [...list];
      next[idx] = { ...next[idx], ...patch };
      // Recompute cost on every update — cheap and keeps stats live.
      if (next[idx].tokens && next[idx].model) {
        const cost = calculateCost(next[idx].model, next[idx].tokens!.input, next[idx].tokens!.output);
        if (cost) next[idx].cost = cost;
      }
      return next;
    });
    this.saveToStorage();
  }

  private patchFetch(): void {
    if (this.originalFetch) return; // Already patched
    this.originalFetch = window.fetch.bind(window);
    const self = this;

    window.fetch = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const extra = self.config.additionalEndpoints;

      if (!isLlmEndpoint(url, extra)) {
        return self.originalFetch!(input, init);
      }

      const id = crypto.randomUUID();
      const startedAt = Date.now();
      const provider = detectProvider(url, extra);
      const method = (init?.method ?? (typeof input !== 'string' && !(input instanceof URL) ? input.method : 'GET')).toUpperCase();
      const endpoint = new URL(url, window.location.origin).pathname;

      const call: LlmCall = {
        id,
        startedAt,
        provider,
        endpoint,
        url,
        method,
        streaming: false,
        status: 'pending',
      };

      // Parse request body
      let bodyText: string | undefined;
      try {
        if (init?.body) {
          bodyText = typeof init.body === 'string' ? init.body : init.body instanceof FormData ? undefined : await new Response(init.body as BodyInit).text();
        } else if (typeof input !== 'string' && !(input instanceof URL)) {
          const cloned = input.clone();
          bodyText = await cloned.text();
        }
        if (bodyText) {
          const parsed = JSON.parse(bodyText);
          call.rawRequest = parsed;
          parseRequest(provider, parsed, url, call);
        }
      } catch { /* non-JSON body; ignore */ }

      self.addCall(call);

      try {
        const response = await self.originalFetch!(input, init);
        const contentType = response.headers.get('content-type') ?? '';
        self.updateCall(id, { statusCode: response.status });

        if (call.streaming || contentType.includes('text/event-stream')) {
          // Tee the body so we can read it without breaking the consumer.
          if (!response.body) {
            self.updateCall(id, { status: 'error', error: 'No response body for stream', endedAt: Date.now() });
            return response;
          }
          const [forUser, forUs] = response.body.tee();
          self.consumeStream(id, provider, forUs).catch((e) => {
            self.updateCall(id, { status: 'error', error: String(e), endedAt: Date.now() });
          });
          return new Response(forUser, { status: response.status, statusText: response.statusText, headers: response.headers });
        }

        // Non-streaming: clone, parse, and pass through.
        const cloned = response.clone();
        const text = await cloned.text();
        let json: unknown;
        try { json = JSON.parse(text); } catch { json = text; }
        const current = self.calls().find((c) => c.id === id);
        if (current) {
          current.rawResponse = json;
          parseResponse(provider, json, current);
          self.updateCall(id, {
            rawResponse: current.rawResponse,
            response: current.response,
            tokens: current.tokens,
            toolCalls: current.toolCalls,
            finishReason: current.finishReason,
            status: response.ok ? 'success' : 'error',
            endedAt: Date.now(),
            error: response.ok ? undefined : `HTTP ${response.status}`,
          });
        }
        return response;
      } catch (err) {
        self.updateCall(id, { status: 'error', error: err instanceof Error ? err.message : String(err), endedAt: Date.now() });
        throw err;
      }
    } as typeof fetch;
  }

  private async consumeStream(id: string, provider: ReturnType<typeof detectProvider>, stream: ReadableStream<Uint8Array>): Promise<void> {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let firstTokenLogged = false;
    const accumulatedRaw: string[] = [];

    this.updateCall(id, { status: 'streaming' });

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      accumulatedRaw.push(chunk);
      buffer += chunk;

      // SSE: events separated by blank line; lines starting "data: " carry JSON.
      const events = buffer.split('\n\n');
      buffer = events.pop() ?? '';

      for (const event of events) {
        const lines = event.split('\n');
        let eventType = 'message';
        let dataLine = '';
        for (const line of lines) {
          if (line.startsWith('event:')) eventType = line.slice(6).trim();
          else if (line.startsWith('data:')) dataLine += line.slice(5).trim();
        }
        if (!dataLine || dataLine === '[DONE]') continue;
        let parsed: unknown;
        try { parsed = JSON.parse(dataLine); } catch { continue; }

        const current = this.calls().find((c) => c.id === id);
        if (!current) return;
        accumulateStream(provider, eventType, parsed, current);
        if (!firstTokenLogged && current.response) {
          current.firstTokenMs = Date.now() - current.startedAt;
          firstTokenLogged = true;
        }
        this.updateCall(id, {
          response: current.response,
          toolCalls: current.toolCalls,
          tokens: current.tokens,
          finishReason: current.finishReason,
          firstTokenMs: current.firstTokenMs,
        });
      }
    }

    this.updateCall(id, {
      status: 'success',
      endedAt: Date.now(),
      rawResponse: accumulatedRaw.join(''),
    });
  }

  private mountUi(): void {
    if (this.mounted) return;
    this.mounted = true;
    // Lazy-import to avoid circular dep at module init.
    import('./ai-devtools.component').then(({ AiDevtoolsComponent }) => {
      const host = this.doc.createElement('ngx-ai-devtools-host');
      this.doc.body.appendChild(host);
      const ref = createComponent(AiDevtoolsComponent, {
        hostElement: host,
        environmentInjector: this.envInjector,
      });
      this.appRef.attachView(ref.hostView);
    });
  }
}
