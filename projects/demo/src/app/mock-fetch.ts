/**
 * Mock fetch responder. Installed before Angular bootstraps so the devtools
 * library captures THIS as its "original fetch". When the library's patched
 * fetch then calls through, our mock returns a canned LLM-shaped Response.
 *
 * Real apps don't need any of this — they just call the real provider APIs.
 */

type MockResponse = {
  body?: unknown;           // <-- add the ?
  status?: number;
  delay?: number;
  /** If provided, returned as a Server-Sent-Event stream. */
  stream?: string[];
};

const responders = new Map<string, () => MockResponse>();

export function mockRespond(url: string, factory: () => MockResponse): void {
  responders.set(url, factory);
}

export function installMockFetch(): void {
  const native = window.fetch.bind(window);

  window.fetch = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const responder = responders.get(url);
    if (!responder) {
      // Fall through to real fetch for anything we haven't mocked (e.g. assets).
      return native(input, init);
    }

    const spec = responder();
    await new Promise((r) => setTimeout(r, spec.delay ?? 100 + Math.random() * 250));

    if (spec.stream) {
      const encoder = new TextEncoder();
      const chunks = spec.stream;
      const body = new ReadableStream<Uint8Array>({
        async start(controller) {
          for (const chunk of chunks) {
            await new Promise((r) => setTimeout(r, 120));
            controller.enqueue(encoder.encode(chunk));
          }
          controller.close();
        },
      });
      return new Response(body, {
        status: spec.status ?? 200,
        headers: { 'content-type': 'text/event-stream' },
      });
    }

    return new Response(JSON.stringify(spec.body), {
      status: spec.status ?? 200,
      headers: { 'content-type': 'application/json' },
    });
  } as typeof fetch;
}
