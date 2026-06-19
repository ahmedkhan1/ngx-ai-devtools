/**
 * Public types for ngx-ai-devtools.
 */

export type Provider = 'openai' | 'anthropic' | 'google' | 'mistral' | 'cohere' | 'groq' | 'unknown';

export type CallStatus = 'pending' | 'streaming' | 'success' | 'error';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  tool_call_id?: string;
}

export interface ToolCall {
  name: string;
  arguments: unknown;
  result?: unknown;
}

export interface TokenUsage {
  input: number;
  output: number;
  total: number;
}

export interface CostBreakdown {
  input: number;
  output: number;
  total: number;
  currency: 'USD';
}

export interface LlmCall {
  /** Stable id, used for selection and replay. */
  id: string;
  /** Unix ms when the request started. */
  startedAt: number;
  /** Unix ms when the response completed (or errored). */
  endedAt?: number;
  /** Milliseconds from request to first byte (TTFB-ish). */
  firstTokenMs?: number;
  /** Provider detected from the URL. */
  provider: Provider;
  /** Model identifier reported in the request body. */
  model?: string;
  /** Endpoint hit (path only, no query). */
  endpoint: string;
  /** Full URL of the request. */
  url: string;
  /** HTTP method. */
  method: string;
  /** True when the response is a server-sent-event stream. */
  streaming: boolean;
  /** Lifecycle state. */
  status: CallStatus;
  /** HTTP status code, when available. */
  statusCode?: number;
  /** Parsed request messages, if the body looked like a chat request. */
  messages?: ChatMessage[];
  /** System prompt extracted from the request (Anthropic-style or messages[0]). */
  system?: string;
  /** Tools declared in the request. */
  tools?: { name: string; description?: string }[];
  /** Tool calls returned by the model. */
  toolCalls?: ToolCall[];
  /** Final response text from the model. */
  response?: string;
  /** Reason the model stopped (stop, length, tool_calls, etc). */
  finishReason?: string;
  /** Token usage as reported by the provider. */
  tokens?: TokenUsage;
  /** Calculated cost based on the local price table. */
  cost?: CostBreakdown;
  /** Error message, if the call failed. */
  error?: string;
  /** Raw request body (parsed JSON). Captured for replay and inspection. */
  rawRequest?: unknown;
  /** Raw response body (parsed JSON or accumulated SSE). */
  rawResponse?: unknown;
}

/**
 * An endpoint hint tells the library which provider's response shape to
 * expect for a given URL pattern. Use the object form when your proxy path
 * doesn't contain a provider keyword (anthropic, openai, gemini, etc.).
 *
 * Examples:
 *   '/api/chat'                                    // detect by URL keyword
 *   { path: '/api/chat', provider: 'anthropic' }   // explicit provider
 */
export type EndpointHint = string | { path: string; provider: Provider };

export interface AiDevtoolsConfig {
  /**
   * When false, the devtools do not patch fetch and do not render. Defaults to true.
   * Most users will gate this on `!environment.production`.
   */
  enabled?: boolean;
  /**
   * Maximum number of calls retained in memory. Older calls are dropped FIFO.
   * Defaults to 100.
   */
  maxCalls?: number;
  /**
   * If true, persist call history to localStorage so it survives page reloads.
   * Defaults to false.
   */
  persist?: boolean;
  /**
   * If true, automatically mount the floating panel into document.body when the
   * service is instantiated. If false, use `<ngx-ai-devtools />` explicitly.
   * Defaults to true.
   */
  autoMount?: boolean;
  /**
   * Initial position of the launcher. Defaults to bottom-right.
   */
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  /**
   * If true, redact request and response bodies in the UI (still recorded).
   * Useful when sharing screenshots. Defaults to false.
   */
  redact?: boolean;
  /**
   * URL patterns to treat as LLM endpoints, beyond the built-in provider URLs.
   *
   * Two forms supported:
   * - string: URL substring. Provider is detected from URL keywords
   *   (anthropic, openai, claude, gemini, etc).
   * - object: `{ path, provider }`. Explicit provider, no URL renaming required.
   *
   * Example:
   * ```ts
   * additionalEndpoints: [
   *   { path: '/api/chat', provider: 'anthropic' },
   *   { path: '/api/llm-stream', provider: 'openai' },
   *   '/api/legacy-llm',  // string form, falls back to keyword detection
   * ]
   * ```
   */
  additionalEndpoints?: EndpointHint[];
}

export interface PriceEntry {
  /** USD per 1M input tokens. */
  input: number;
  /** USD per 1M output tokens. */
  output: number;
}
