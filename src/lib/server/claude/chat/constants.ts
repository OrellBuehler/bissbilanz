export const CHAT_MAX_TOKENS = 16000;
// The reservation estimate (bytes / 2) of the first call of a run: system
// prompt, the MCP tool set and a short first message; a test keeps
// it above the real value (chat-policy.test.ts).
export const CHAT_FIRST_CALL_INPUT_TOKENS = 60_000;

export const MAX_CONCURRENT_CHAT_RUNS = 3;
export const MAX_CONCURRENT_CHAT_RUNS_PER_USER = 2;
export const MAX_CHAT_MESSAGES_PER_DAY = 60;
export const CHAT_DAY_WINDOW_MS = 24 * 60 * 60 * 1000;
export const MAX_USER_MESSAGES_PER_CONVERSATION = 40;
// Bytes of the API transcript, images excluded.
export const MAX_CONVERSATION_BYTES = 1_000_000;
export const AUTO_TITLE_CHARS = 60;
export const MAX_TOOL_CALLS_PER_RESPONSE = 20;
// After this many writes in one run, every further write waits for the user.
export const MAX_UNCONFIRMED_WRITES_PER_RUN = 10;
export const MAX_IMAGES_PER_CONVERSATION = 20;
// Base64 bytes of the photos a conversation sends with every request.
export const MAX_CONVERSATION_IMAGE_BYTES = 12_000_000;
export const RETRY_DELAYS_MS = [1_000, 4_000];

export const ACTION_TTL_MS = 60 * 60 * 1000;
export const TOOL_RESULT_MAX_CHARS = 12_000;
export const MCP_TOOL_TIMEOUT_MS = 120_000;

export const HEARTBEAT_INTERVAL_MS = 20_000;
export const STALE_RUN_MS = 60_000;
export const SWEEP_INTERVAL_MS = 30_000;
export const TEXT_FLUSH_MS = 250;
export const TEXT_DELTA_RETENTION_MS = 24 * 60 * 60 * 1000;

export const SSE_HEARTBEAT_MS = 20_000;
export const SSE_POLL_MS = 5_000;
export const SSE_MAX_DURATION_MS = 10 * 60 * 1000;
export const EVENTS_PAGE_LIMIT = 500;
export const EVENTS_RATE_LIMIT_PER_MINUTE = 240;
export const MAX_EVENT_STREAMS_PER_USER = 3;
