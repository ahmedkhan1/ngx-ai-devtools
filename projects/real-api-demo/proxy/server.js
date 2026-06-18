/**
 * Local-only LLM proxy. Holds API keys server-side, forwards browser requests
 * to OpenAI, Anthropic, and Google Gemini, returns the response with CORS
 * headers so the browser can read it.
 *
 * Run: node server.js
 * Then the Angular app can fetch http://localhost:8787/openai etc.
 *
 * NEVER deploy this without auth. It's a local dev tool only.
 */
import http from 'node:http';
import { config } from 'node:process';

const PORT = 8787;

// Read keys from environment. Set them in your shell before running:
//   set OPENAI_API_KEY=sk-...   (Windows cmd)
//   $env:OPENAI_API_KEY="sk-..." (Windows PowerShell)
//   export OPENAI_API_KEY=sk-... (macOS/Linux)
const KEYS = {
  openai: process.env.OPENAI_API_KEY,
  anthropic: process.env.ANTHROPIC_API_KEY,
  google: process.env.GOOGLE_API_KEY,
};

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
};

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

async function forward(targetUrl, body, headers, res, opts = {}) {
  try {
    const upstream = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body,
    });
    const contentType = upstream.headers.get('content-type') ?? 'application/json';
    res.writeHead(upstream.status, { ...CORS_HEADERS, 'content-type': contentType });

    if (contentType.includes('text/event-stream') && upstream.body) {
      // Pipe SSE through chunk-by-chunk so the library sees a real stream.
      const reader = upstream.body.getReader();
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        res.write(Buffer.from(value));
      }
      res.end();
    } else {
      const text = await upstream.text();
      res.end(text);
    }
  } catch (err) {
    res.writeHead(500, { ...CORS_HEADERS, 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: String(err) }));
  }
}

const server = http.createServer(async (req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    return res.end();
  }

  if (req.method !== 'POST') {
    res.writeHead(405, CORS_HEADERS);
    return res.end('Method not allowed');
  }

  const body = await readBody(req);
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // Route by path. The browser hits these; we forward to real providers.
  if (url.pathname === '/openai/v1/chat/completions') {
    if (!KEYS.openai) return failNoKey(res, 'OPENAI_API_KEY');
    return forward(
      'https://api.openai.com/v1/chat/completions',
      body,
      { authorization: `Bearer ${KEYS.openai}` },
      res,
    );
  }

  if (url.pathname === '/anthropic/v1/messages') {
    if (!KEYS.anthropic) return failNoKey(res, 'ANTHROPIC_API_KEY');
    return forward(
      'https://api.anthropic.com/v1/messages',
      body,
      {
        'x-api-key': KEYS.anthropic,
        'anthropic-version': '2023-06-01',
      },
      res,
    );
  }

  // Google Gemini: model is in the URL.
  const geminiMatch = url.pathname.match(/^\/google\/v1beta\/models\/(.+):(generateContent|streamGenerateContent)$/);
  if (geminiMatch) {
    if (!KEYS.google) return failNoKey(res, 'GOOGLE_API_KEY');
    const [, model, action] = geminiMatch;
    const target = `https://generativelanguage.googleapis.com/v1beta/models/${model}:${action}?key=${KEYS.google}`;
    return forward(target, body, {}, res);
  }

  res.writeHead(404, CORS_HEADERS);
  res.end(JSON.stringify({ error: 'Unknown route: ' + url.pathname }));
});

function failNoKey(res, name) {
  res.writeHead(400, { ...CORS_HEADERS, 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: `${name} not set in environment` }));
}

server.listen(PORT, () => {
  console.log(`\nLLM proxy running at http://localhost:${PORT}`);
  console.log('Keys detected:');
  console.log('  OpenAI:    ' + (KEYS.openai ? 'yes' : 'NO (set OPENAI_API_KEY)'));
  console.log('  Anthropic: ' + (KEYS.anthropic ? 'yes' : 'NO (set ANTHROPIC_API_KEY)'));
  console.log('  Google:    ' + (KEYS.google ? 'yes' : 'NO (set GOOGLE_API_KEY)'));
  console.log('\nRoutes:');
  console.log('  POST /openai/v1/chat/completions');
  console.log('  POST /anthropic/v1/messages');
  console.log('  POST /google/v1beta/models/<model>:generateContent');
  console.log('\nPress Ctrl+C to stop.\n');
});
