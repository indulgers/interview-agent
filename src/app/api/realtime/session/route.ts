import 'server-only';

import { readServerEnv, type ServerEnv } from '../../../../lib/env';

const MAX_SDP_BYTES = 65_536;
const BAILIAN_MODEL = 'qwen3.5-omni-flash-realtime';

type Dependencies = { readEnv?: () => ServerEnv; fetch?: typeof fetch };

function safeText(status: number, text: string) {
  return new Response(text, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } });
}

function isSdpOffer(body: string) {
  return body.length > 0 && new TextEncoder().encode(body).byteLength <= MAX_SDP_BYTES && /^v=0(?:\r?\n|$)/.test(body);
}

export async function POST(request: Request, dependencies: Dependencies = {}) {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/sdp')) {
    return safeText(400, '无效的 SDP 建连请求。');
  }

  const offer = await request.text();
  if (!isSdpOffer(offer)) return safeText(400, '无效的 SDP 建连请求。');

  let env: ServerEnv;
  try {
    env = (dependencies.readEnv ?? readServerEnv)();
  } catch {
    return safeText(500, '实时语音服务配置不可用。');
  }

  try {
    const response = await (dependencies.fetch ?? fetch)(
      `https://${env.DASHSCOPE_WORKSPACE_ID}.cn-beijing.maas.aliyuncs.com/api/v1/webrtc/realtime?model=${BAILIAN_MODEL}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/sdp',
          Authorization: `Bearer ${env.DASHSCOPE_API_KEY}`,
        },
        body: offer,
      },
    );
    if (!response.ok) return safeText(502, '实时语音服务暂时不可用。');
    return new Response(await response.text(), { status: 200, headers: { 'content-type': 'application/sdp; charset=utf-8' } });
  } catch {
    return safeText(502, '实时语音服务暂时不可用。');
  }
}
