import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getServerInterviewHistory } from '../../../../modules/interview-history/server-history';

const RequestBody = z.object({ operation: z.string().min(1), input: z.unknown() });

export async function POST(request: Request) {
  try {
    const { operation, input } = RequestBody.parse(await request.json());
    const history = await getServerInterviewHistory();
    const data = input as never;
    switch (operation) {
      case 'start': return NextResponse.json(await history.start(data));
      case 'append': return NextResponse.json(await history.appendFinalTurn(data));
      case 'finish': {
        const value = input as { id: string; result: 'completed' | 'interrupted' | 'cancelled'; completeness: 'complete' | 'missing'; actualDurationMs: number };
        await history.finish(value.id, value.result, value.completeness, value.actualDurationMs); return NextResponse.json(null);
      }
      case 'setFeedback': { const value = input as { id: string; update: never }; await history.setFeedback(value.id, value.update); return NextResponse.json(null); }
      case 'list': return NextResponse.json(await history.list());
      case 'detail': return NextResponse.json(await history.detail((input as { id: string }).id));
      case 'delete': await history.delete((input as { id: string }).id); return NextResponse.json(null);
      case 'recover': return NextResponse.json(await history.recoverAbandoned());
      default: return NextResponse.json({ error: '不支持的操作' }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: '面试记录服务不可用' }, { status: 400 });
  }
}
