# test-ngx-ai-devtools-real

Real-API test harness for ngx-ai-devtools. Calls go through a local Node proxy so keys stay server-side and CORS is satisfied.

## Architecture

```
Browser (Angular app, port 4200)
    │
    │  fetch http://localhost:8787/openai/v1/chat/completions
    ▼
Local proxy (Node, port 8787) ──► api.openai.com (with your key in env var)
    ▲
    │  forwards response back with CORS headers
```

The ngx-ai-devtools library intercepts the `fetch(localhost:8787/...)` calls, sees the URL contains `/openai/`, `/anthropic/`, or `/google/`, and parses request and response shape accordingly. The `additionalEndpoints: ['localhost:8787']` config tells it to treat that hostname as an LLM endpoint.

## Setup

### 1. Get API keys

| Provider | Where | Cost guide |
|---|---|---|
| OpenAI | https://platform.openai.com/api-keys | `gpt-4o-mini` is ~$0.15/$0.60 per 1M tokens |
| Anthropic | https://console.anthropic.com/settings/keys | `claude-3-5-haiku` is ~$0.80/$4 per 1M tokens |
| Google | https://aistudio.google.com/app/apikey | `gemini-2.5-flash` is ~$0.30/$2.50 per 1M tokens, generous free tier |

You don't need all three. Any one of them is enough to verify the library.

Typical per-click cost: $0.0001 to $0.001. A full round of all five buttons is under one cent.

### 2. Start the proxy

```bash
cd proxy
```

Set whichever keys you have (Windows cmd):

```bash
set OPENAI_API_KEY=sk-...
set ANTHROPIC_API_KEY=sk-ant-...
set GOOGLE_API_KEY=AIza...
npm start
```

Or PowerShell:

```powershell
$env:OPENAI_API_KEY = "sk-..."
$env:ANTHROPIC_API_KEY = "sk-ant-..."
$env:GOOGLE_API_KEY = "AIza..."
npm start
```

The proxy logs which keys it detected. If a key is missing, calls to that provider return 400 — fine, just don't click that button.

### 3. Start the Angular app (separate terminal)

```bash
cd ..
npm install
npm start
```

Open http://localhost:4200. The "Proxy status" line at the top should say "online ✓".

### 4. Click buttons, watch the panel

Real token counts, real cost, real streaming.

## What you're verifying

Compared to the mock version, this proves:

- Real provider response shapes parse correctly (not just the shapes I happened to write)
- Real streaming SSE chunks accumulate properly (variable timing, real backpressure)
- Real cost calculation matches actual usage
- Real tool-use payloads come back parsed
- `additionalEndpoints` config option works as documented

## Security note

The proxy has no auth. Don't deploy it. It's meant to run on `localhost` only. The CORS header is `*` which is fine for localhost but would be reckless on a public URL.

## Files

```
proxy/
  package.json    no deps, runs on plain Node
  server.js       3 routes (OpenAI, Anthropic, Google), forwards with key

src/
  main.ts         standard bootstrap
  app/
    app.config.ts provideAiDevtools with additionalEndpoints
    app.component.ts five test buttons
```
