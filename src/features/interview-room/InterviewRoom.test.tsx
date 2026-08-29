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
      endDialogOpen={false}
      ending={false}
      endError={null}
      onEndAnswer={vi.fn()}
      onRetry={vi.fn()}
      onRequestEnd={vi.fn()}
      onCancelEnd={vi.fn()}
      onEndInterview={vi.fn()}
    />);
    expect(html).toContain('AI 技术面试官');
    expect(html).toContain('正在思考你的回答');
    expect(html).toContain('如何处理背压');
    expect(html).toContain('本机画面 · 不保存');
    expect(html).not.toContain('实时转写');
  });

  it('offers an end-interview trigger from the control bar', () => {
    const html = renderToStaticMarkup(<Controls
      microphoneOn cameraOn
      onToggleMicrophone={vi.fn()} onToggleCamera={vi.fn()}
      onEndAnswer={vi.fn()} onRequestEnd={vi.fn()}
    />);
    expect(html).toContain('结束面试');
    expect(html).not.toContain('确定结束这场面试？');
  });

  it('keeps the room visible with a retryable ending error', () => {
    const html = renderToStaticMarkup(<InterviewRoom
      state="listening"
      elapsedMs={0}
      currentQuestion={null}
      error={null}
      candidateStream={null}
      endDialogOpen
      ending={false}
      endError="保存会话结果失败"
      onEndAnswer={vi.fn()}
      onRetry={vi.fn()}
      onRequestEnd={vi.fn()}
      onCancelEnd={vi.fn()}
      onEndInterview={vi.fn()}
    />);

    expect(html).toContain('保存会话结果失败');
    expect(html).toContain('重试结束');
    expect(html).toContain('请开始回答');
  });

  it('closes the avatar mouth whenever remote playback is stopped', () => {
    expect(renderToStaticMarkup(<Avatar speaking={false} />)).toContain('avatar-mouth-closed.svg');
    expect(renderToStaticMarkup(<Avatar speaking />)).toContain('avatar-mouth-open.svg');
  });
});
