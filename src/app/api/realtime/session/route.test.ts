import { afterEach, describe, expect, it, vi } from 'vitest';

import { postSession } from './handler';

const env = {
  DASHSCOPE_API_KEY: 'route-test-key',
  DASHSCOPE_WORKSPACE_ID: 'workspace-test',
  DATABASE_URL: 'file:./test.db',
};

describe('POST /api/realtime/session', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('forwards a valid SDP offer to the fixed Beijing endpoint and returns the SDP answer', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('v=0\r\na=answer\r\n', { status: 200, headers: { 'content-type': 'application/sdp' } }));
    vi.stubGlobal('fetch', fetch);

    const response = await postSession(new Request('http://localhost/api/realtime/session', {
      method: 'POST', headers: { 'content-type': 'application/sdp' }, body: 'v=0\r\no=- 1 1 IN IP4 0.0.0.0\r\n',
    }), { readEnv: () => env });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/sdp');
    expect(await response.text()).toBe('v=0\r\na=answer\r\n');
    expect(fetch).toHaveBeenCalledWith(
      'https://workspace-test.cn-beijing.maas.aliyuncs.com/api/v1/webrtc/realtime?model=qwen3.5-omni-flash-realtime',
      expect.objectContaining({ method: 'POST', body: 'v=0\r\no=- 1 1 IN IP4 0.0.0.0\r\n', headers: { 'Content-Type': 'application/sdp', Authorization: 'Bearer route-test-key' } }),
    );
  });

  it.each([
    ['missing SDP content type', undefined, 'v=0\r\n'],
    ['missing SDP content type', 'text/plain', 'v=0\r\n'],
    ['SDP-prefix content type', 'application/sdp-anything', 'v=0\r\n'],
    ['non-SDP body', 'application/sdp', 'not an offer'],
    ['oversized offer', 'application/sdp', `v=0\r\n${'a'.repeat(65_537)}`],
    ['offer oversized in UTF-8 bytes', 'application/sdp', `v=0\r\n${'测'.repeat(22_000)}`],
  ])('rejects %s before contacting the provider', async (_label, contentType, body) => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    const response = await postSession(new Request('http://localhost/api/realtime/session', { method: 'POST', headers: contentType ? { 'content-type': contentType } : {}, body }), { readEnv: () => env });
    expect(response.status).toBe(400);
    expect(await response.text()).toBe('无效的 SDP 建连请求。');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('accepts a text/plain upstream answer when its body is valid SDP', async () => {
    const response = await postSession(new Request('http://localhost/api/realtime/session', { method: 'POST', headers: { 'content-type': 'application/sdp' }, body: 'v=0\r\n' }), {
      readEnv: () => env, fetch: vi.fn().mockResolvedValue(new Response('v=0\na=answer\n', { headers: { 'content-type': 'text/plain; charset=utf-8' } })),
    });
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('v=0\r\na=answer\r\n');
  });

  it('rejects an unsafe workspace identifier before constructing an upstream URL', async () => {
    const fetch = vi.fn();
    const response = await postSession(new Request('http://localhost/api/realtime/session', { method: 'POST', headers: { 'content-type': 'application/sdp' }, body: 'v=0\r\n' }), {
      readEnv: () => ({ ...env, DASHSCOPE_WORKSPACE_ID: 'workspace-test.evil.example' }), fetch,
    });
    expect(response.status).toBe(500);
    expect(await response.text()).toBe('实时语音服务配置不可用。');
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    ['unexpected success MIME', new Response('v=0\r\na=answer\r\n', { headers: { 'content-type': 'application/json' } })],
    ['non-SDP success body', new Response('not an SDP answer', { headers: { 'content-type': 'text/plain' } })],
  ])('sanitizes %s', async (_label, upstream) => {
    const response = await postSession(new Request('http://localhost/api/realtime/session', { method: 'POST', headers: { 'content-type': 'application/sdp' }, body: 'v=0\r\n' }), {
      readEnv: () => env, fetch: vi.fn().mockResolvedValue(upstream),
    });
    expect(response.status).toBe(502);
    expect(await response.text()).toBe('实时语音服务暂时不可用。');
  });

  it('rejects chunked offers once their UTF-8 byte budget is exceeded', async () => {
    const fetch = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new TextEncoder().encode('v=0\r\n')); controller.enqueue(new TextEncoder().encode('测'.repeat(22_000))); controller.close(); },
    });
    const response = await postSession(new Request('http://localhost/api/realtime/session', { method: 'POST', headers: { 'content-type': 'application/sdp' }, body, duplex: 'half' } as RequestInit), { readEnv: () => env, fetch });
    expect(response.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('sanitizes upstream and configuration failures without exposing the response body or credentials', async () => {
    const leaked = 'provider-body-and-secret';
    const fetch = vi.fn().mockResolvedValue(new Response(leaked, { status: 401 })); vi.stubGlobal('fetch', fetch);
    const offer = new Request('http://localhost/api/realtime/session', { method: 'POST', headers: { 'content-type': 'application/sdp' }, body: 'v=0\r\n' });
    const upstream = await postSession(offer, { readEnv: () => env });
    expect(upstream.status).toBe(502);
    const upstreamText = await upstream.text();
    expect(upstreamText).toBe('实时语音服务暂时不可用。');
    expect(upstreamText).not.toContain(leaked);

    const config = await postSession(new Request('http://localhost/api/realtime/session', { method: 'POST', headers: { 'content-type': 'application/sdp' }, body: 'v=0\r\n' }), { readEnv: () => { throw new Error('contains route-test-key'); } });
    expect(config.status).toBe(500);
    expect(await config.text()).toBe('实时语音服务配置不可用。');
  });

  it('aborts a stalled upstream request and returns a sanitized timeout response', async () => {
    let signal: AbortSignal | undefined;
    const response = await postSession(new Request('http://localhost/api/realtime/session', { method: 'POST', headers: { 'content-type': 'application/sdp' }, body: 'v=0\r\n' }), {
      readEnv: () => env,
      timeoutMs: 1,
      fetch: async (_input, init) => {
        signal = init.signal ?? undefined;
        return new Promise(() => {});
      },
    });
    expect(response.status).toBe(502);
    expect(await response.text()).toBe('实时语音服务暂时不可用。');
    expect(signal?.aborted).toBe(true);
  });
});
