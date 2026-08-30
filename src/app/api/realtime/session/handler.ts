import { readServerEnv, type ServerEnv } from '../../../../lib/env';

const MAX_SDP_BYTES = 65_536;
const BAILIAN_MODEL = 'qwen3.5-omni-flash-realtime';
const TIMEOUT_MS = 10_000;
type FetchResponse = Pick<Response, 'ok' | 'headers' | 'body' | 'text'>;
type Dependencies = { readEnv?: () => ServerEnv; fetch?: (input: string, init: RequestInit) => Promise<FetchResponse>; timeoutMs?: number };

function safeText(status: number, text: string) { return new Response(text, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } }); }
function isRequestSdpMime(value: string | null) { return value !== null && /^application\/sdp(?:\s*;|$)/i.test(value); }
function isAnswerSdpMime(value: string | null) { return value === null || /^(?:application\/sdp|text\/plain)(?:\s*;|$)/i.test(value); }
function isSdp(value: string) { return /^v=0(?:\r?\n|$)/.test(value); }
function isWorkspaceId(value: string) { return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(value); }
function normalizeSdp(value: string) { const normalized = value.trim().replace(/\r?\n/g, '\r\n'); return normalized.endsWith('\r\n') ? normalized : `${normalized}\r\n`; }

async function abortable<T>(operation: Promise<T>, signal: AbortSignal) {
  if (signal.aborted) throw new Error('aborted');
  let onAbort!: () => void;
  try {
    return await Promise.race([operation, new Promise<T>((_, reject) => {
      onAbort = () => reject(new Error('aborted'));
      signal.addEventListener('abort', onAbort, { once: true });
    })]);
  } finally { signal.removeEventListener('abort', onAbort); }
}

async function readBounded(body: ReadableStream<Uint8Array> | null, fallback: () => Promise<string>, signal?: AbortSignal) {
  if (!body) {
    const text = signal ? await abortable(fallback(), signal) : await fallback();
    if (new TextEncoder().encode(text).byteLength > MAX_SDP_BYTES) throw new Error('too large');
    return text;
  }
  const reader = body.getReader(); const decoder = new TextDecoder(); let size = 0; let text = '';
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    while (true) {
      const chunk = signal ? await abortable(reader.read(), signal) : await reader.read(); if (chunk.done) break;
      size += chunk.value.byteLength; if (size > MAX_SDP_BYTES) { await reader.cancel(); throw new Error('too large'); }
      text += decoder.decode(chunk.value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    signal?.removeEventListener('abort', cancel);
    try { reader.releaseLock(); } catch { /* an aborted pending read releases asynchronously */ }
  }
}

async function timed<T>(operation: (signal: AbortSignal) => Promise<T>, timeoutMs: number) {
  const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([operation(controller.signal), new Promise<T>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('timeout')); }, timeoutMs); })]);
  } finally { if (timer) clearTimeout(timer); }
}

export async function postSession(request: Request, dependencies: Dependencies = {}) {
  if (!isRequestSdpMime(request.headers.get('content-type'))) return safeText(400, '无效的 SDP 建连请求。');
  let offer: string;
  try { offer = await readBounded(request.body, () => request.text()); } catch { return safeText(400, '无效的 SDP 建连请求。'); }
  if (!isSdp(offer)) return safeText(400, '无效的 SDP 建连请求。');
  let env: ServerEnv;
  try { env = (dependencies.readEnv ?? readServerEnv)(); if (!isWorkspaceId(env.DASHSCOPE_WORKSPACE_ID)) throw new Error('unsafe workspace'); } catch { return safeText(500, '实时语音服务配置不可用。'); }
  try {
    const answer = await timed(async (signal) => {
      const response = await (dependencies.fetch ?? fetch)(
        `https://${env.DASHSCOPE_WORKSPACE_ID}.cn-beijing.maas.aliyuncs.com/api/v1/webrtc/realtime?model=${BAILIAN_MODEL}`,
        { method: 'POST', headers: { 'Content-Type': 'application/sdp', Authorization: `Bearer ${env.DASHSCOPE_API_KEY}` }, body: offer, signal },
      );
      if (!response.ok || !isAnswerSdpMime(response.headers.get('content-type'))) throw new Error('invalid upstream response');
      return readBounded(response.body, () => response.text(), signal);
    }, dependencies.timeoutMs ?? TIMEOUT_MS);
    if (!isSdp(answer)) return safeText(502, '实时语音服务暂时不可用。');
    return new Response(normalizeSdp(answer), { status: 200, headers: { 'content-type': 'application/sdp; charset=utf-8' } });
  } catch { return safeText(502, '实时语音服务暂时不可用。'); }
}
