import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { Avatar } from './Avatar';
import { Controls } from './Controls';
import { InterviewRoom } from './InterviewRoom';

describe('interview room', () => {
  it('shows the interviewer, candidate local-only label, state and no transcript panel', () => {
    const html = renderToStaticMarkup(<InterviewRoom
      state="thinking"
      elapsedMs={92_000}
      currentQuestion="请说说你在 Node.js 服务中如何处理背压。"
      error={null}
      candidateStream={null}
      onEndAnswer={vi.fn()}
      onRetry={vi.fn()}
      onEndInterview={vi.fn()}
    />);
    expect(html).toContain('AI 技术面试官');
    expect(html).toContain('正在思考你的回答');
    expect(html).toContain('如何处理背压');
    expect(html).toContain('本机画面 · 不保存');
    expect(html).not.toContain('实时转写');
  });

  it('requires confirmation before ending the interview', () => {
    const html = renderToStaticMarkup(<Controls
      microphoneOn cameraOn confirmEnd
      onToggleMicrophone={vi.fn()} onToggleCamera={vi.fn()}
      onEndAnswer={vi.fn()} onRequestEnd={vi.fn()} onCancelEnd={vi.fn()} onConfirmEnd={vi.fn()}
    />);
    expect(html).toContain('确定结束这场面试？');
    expect(html).toContain('继续面试');
    expect(html).toContain('确认结束');
  });

  it('closes the avatar mouth whenever remote playback is stopped', () => {
    expect(renderToStaticMarkup(<Avatar speaking={false} />)).toContain('avatar-mouth-closed.svg');
    expect(renderToStaticMarkup(<Avatar speaking />)).toContain('avatar-mouth-open.svg');
  });
});
