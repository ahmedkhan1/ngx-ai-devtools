# ngx-ai-devtools

> Network-tab-style DevTools for LLM calls in Angular apps. See every prompt, response, token, and dollar your app spends — without leaving the browser.

[![npm](https://img.shields.io/npm/v/ngx-ai-devtools.svg?style=flat-square&color=f5a524)](https://www.npmjs.com/package/ngx-ai-devtools)
[![license](https://img.shields.io/npm/l/ngx-ai-devtools.svg?style=flat-square)](LICENSE)
[![Angular](https://img.shields.io/badge/Angular-18.1%2B-DD0031.svg?style=flat-square)](https://angular.dev)
[![bundle size](https://img.shields.io/bundlephobia/minzip/ngx-ai-devtools?style=flat-square&color=4ade80)](https://bundlephobia.com/package/ngx-ai-devtools)

<p align="center">
  <img src="./docs/screenshot.png" alt="ngx-ai-devtools panel showing intercepted OpenAI, Anthropic, and Gemini calls with cost, tokens, and tool-use details" width="100%" />
</p>

You're building an Angular app that talks to OpenAI, Anthropic, or Gemini. Every call you make is a small mystery: what did you actually send, what came back, how many tokens did it cost, and was the streaming response chunked the way you expected? `console.log` doesn't cut it. The browser Network tab won't pretty-print the body. You end up writing yet another logger every project.

`ngx-ai-devtools` is that logger — except it's already written, looks good, and ships inside your app behind one provider call.

---

## What it does

- **Intercepts every LLM call** your app makes (`fetch`, `HttpClient`, the OpenAI SDK, the Anthropic SDK, the Vercel AI SDK — anything that ultimately uses `fetch`).
- **Auto-detects the provider** (OpenAI, Anthropic, Google Gemini, Mistral, Groq, Cohere) and parses both request and response into a structured view.
- **Calculates cost** per call using an embedded price table. A running session total lives right inside the launcher pill.
- **Handles streaming** (Server-Sent Events) for OpenAI and Anthropic. Accumulates deltas in real time and tracks time-to-first-token.
- **Shows tool calls** as a first-class view — declared tools, model-issued calls with their arguments.
- **Replays a call** with one click so you can iterate on prompts without leaving the page.
- **Filters and searches** the call list by model name, provider, or content.
- **Persists across reloads** (optional) via `localStorage`.
- **Built on signals.** Zero RxJS in the public API. Standalone components. SSR-safe. Tree-shakeable. Zoneless-compatible.

---

## Install

```bash
npm install ngx-ai-devtools
```

Requires **Angular 18.1+** (uses `@let`, signals, and standalone APIs).

---

## Quick start

Add `provideAiDevtools()` to your application config. That's the whole setup.

```ts
// app.config.ts
import { ApplicationConfig } from '@angular/core';
import { provideAiDevtools } from 'ngx-ai-devtools';
import { environment } from './environments/environment';

export const appConfig: ApplicationConfig = {
  providers: [
    provideAiDevtools({
      enabled: !environment.production,
    }),
  ],
};
```

A floating launcher pill appears in the bottom-right corner of your app. Make an LLM call — from anywhere, with any SDK — and it shows up.

```ts
// Works with the official OpenAI SDK:
import OpenAI from 'openai';
const openai = new OpenAI({ apiKey: '...', dangerouslyAllowBrowser: true });
await openai.chat.completions.create({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Hello' }],
});

// Works with raw fetch:
await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: { 'x-api-key': '...', 'content-type': 'application/json' },
  body: JSON.stringify({ model: 'claude-sonnet-4', messages: [...] }),
});

// Works with Angular's HttpClient:
this.http.post('https://api.openai.com/v1/chat/completions', payload).subscribe();
```

No SDK-specific configuration, no wrapping, no interceptor boilerplate.

---

## Try it without writing any code

The repo ships with a runnable demo that fires simulated calls — no API keys needed:

```bash
git clone https://github.com/ahmedkhan1/ngx-ai-devtools.git
cd ngx-ai-devtools
npm install
npm start
```

Then open `http://localhost:4200` and click the buttons.

---

## Configuration

Every option is optional. The defaults are chosen for the most common case.

| Option | Type | Default | What it does |
|---|---|---|---|
| `enabled` | `boolean` | `true` | When `false`, no patching, no UI, no overhead. Gate this on `!environment.production`. |
| `maxCalls` | `number` | `100` | Maximum calls retained in memory. Older ones drop FIFO. |
| `persist` | `boolean` | `false` | Persist call history to `localStorage` across reloads. |
| `autoMount` | `boolean` | `true` | Auto-inject the UI into `document.body`. Set to `false` if you'd rather place `<ngx-ai-devtools />` explicitly. |
| `position` | `'bottom-right' \| 'bottom-left' \| 'top-right' \| 'top-left'` | `'bottom-right'` | Launcher position. |
| `redact` | `boolean` | `false` | Hide request/response bodies in the UI (still recorded). Useful when sharing screenshots. |
| `additionalEndpoints` | `string[]` | `[]` | Extra URL substrings to treat as LLM endpoints. Use this for custom proxies and self-hosted gateways. |

Example with everything turned on:

```ts
provideAiDevtools({
  enabled: !environment.production,
  maxCalls: 200,
  persist: true,
  position: 'bottom-left',
  redact: false,
  additionalEndpoints: ['/api/llm-proxy', '/v1/internal-gateway'],
});
```

---

## Programmatic API

The store is a public signal-based service. Use it in your own components, dashboards, regression tests, or budget alerts.

```ts
import { Component, computed, inject } from '@angular/core';
import { AiDevtoolsService } from 'ngx-ai-devtools';

@Component({
  selector: 'app-cost-badge',
  template: `<span>Spent today: ${{ totalCost() | number:'1.4-4' }}</span>`,
})
export class CostBadge {
  private svc = inject(AiDevtoolsService);
  totalCost = computed(() => this.svc.stats().totalCost);
}
```

The service exposes:

| Member | Type | Purpose |
|---|---|---|
| `calls` | `Signal<LlmCall[]>` | All recorded calls, newest first. |
| `filtered` | `Signal<LlmCall[]>` | The current filtered view (matches the search box). |
| `selected` | `Signal<LlmCall \| null>` | The currently selected call in the detail pane. |
| `stats` | `Signal<{ count, totalCost, totalTokens, avgLatency }>` | Running aggregates over the call list. |
| `ui` | `Signal<{ open, selectedId, filter }>` | UI state of the panel. |
| `clear()` | `() => void` | Drop all calls. |
| `setOpen(b)` | `(boolean) => void` | Open or close the panel. |
| `select(id)` | `(string \| null) => void` | Select a call programmatically. |
| `setFilter(s)` | `(string) => void` | Set the search filter. |
| `replay(id)` | `(string) => Promise<string \| null>` | Re-issue a recorded call. |

All call records conform to the `LlmCall` type, which is exported from the package root.

---

## Provider support

| Provider | Request parsing | Response parsing | Streaming | Cost |
|---|---|---|---|---|
| OpenAI | ✅ | ✅ | ✅ SSE deltas | ✅ |
| Anthropic | ✅ | ✅ | ✅ named events + JSON deltas | ✅ |
| Google Gemini | ✅ | ✅ | partial | ✅ |
| Mistral | ✅ (OpenAI shape) | ✅ | ✅ | ✅ |
| Groq | ✅ (OpenAI shape) | ✅ | ✅ | ✅ |
| Cohere | detected only | partial | — | — |

Pricing data lives in `src/lib/pricing.ts` and ships with current rates for the major models (GPT-4o, o1/o3-mini, Claude Opus/Sonnet/Haiku 4, Gemini 2.5 Pro/Flash, Llama variants on Groq, etc). If a model isn't in the table, the call still records — it just won't have a cost attached. PRs welcome to keep the table fresh.

---

## How it works

At bootstrap, the library monkey-patches `window.fetch`. Calls to any URL matching a known provider (or your `additionalEndpoints`) are recorded into a signal store; everything else flows through untouched. For streaming responses, the response body is `tee()`'d so the consumer still receives the original stream while the devtools consume a copy, parsing SSE events and accumulating deltas as they arrive.

The UI mounts itself into `document.body` (or anywhere you place `<ngx-ai-devtools />`) and renders directly from the signal store with `OnPush` change detection. No global state library, no zone.js dependency, no extra runtime.

In production builds where `enabled: false`, neither the patch nor the UI is installed.

---

## Why this exists

I kept building AI features in Angular apps and kept doing the same dance: open Chrome DevTools, find the request in the Network tab, copy the request body into a JSON viewer, do the same with the response, mentally calculate the cost from token counts, then repeat the whole thing ten minutes later when I tweaked the prompt.

So I built the panel I wanted. It looks good, it does the thing, it stays out of your way until you call it.

It's not a replacement for production observability — LangSmith, Helicone, and Langfuse are excellent at that and you should reach for them once you're past prototyping. `ngx-ai-devtools` is the debugger you want *while* you're still figuring out what to ship.

---

## What's intentionally not here yet

- LangSmith / Helicone / Langfuse export
- Cost budgets and alerts
- Diff view between two calls
- React, Vue, or Svelte adapters (this is Angular-first on purpose)
- Persistent storage beyond `localStorage`
- Tool-call result piping (showing what the tool returned to the model on the next turn)

If any of those would change your day, open an issue. PRs welcome.

---

## Versus production observability tools

| | ngx-ai-devtools | LangSmith / Helicone / Langfuse |
|---|---|---|
| Runs in | the browser, in dev | a hosted service, in prod |
| Setup | one provider call | account + API key + SDK wrap |
| Data lives in | your tab | their database |
| Cost | free, MIT | free tier → paid |
| Use it for | iterating on prompts and debugging your client-side AI features | monitoring production traffic, evaluations, traces across users |

Use both. They don't compete.

---

## Development

```bash
git clone https://github.com/ahmedkhan1/ngx-ai-devtools.git
cd ngx-ai-devtools
npm install
npm start            # serves the demo at http://localhost:4200
npm run build:lib    # produces dist/ngx-ai-devtools
npm run pack         # produces a .tgz you can install in another project
```

To test a local build inside another Angular app:

```bash
npm run build:lib && npm run pack
# In the other project:
npm install /absolute/path/to/dist/ngx-ai-devtools/ngx-ai-devtools-0.1.0.tgz
```

---

## Contributing

Issues and pull requests welcome. If you're adding a new provider, the pattern is:

1. Add a parser in `src/lib/providers/<provider>.parser.ts` exporting `is<Provider>`, `parse<Provider>Request`, `parse<Provider>Response`, and (if streamed) `accumulate<Provider>Stream`.
2. Wire it into `src/lib/providers/index.ts`.
3. Add the model's pricing to `src/lib/pricing.ts`.
4. Add a card to the demo so it can be tested in the browser.

Keep the public surface small — every new option is one more thing to maintain.

---

## License

MIT © [Ahmed Khan](https://github.com/ahmedkhan1)

If this saved you a frustrating afternoon, a star is a kind way to say thanks.