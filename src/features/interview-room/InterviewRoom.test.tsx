import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { Controls } from './Controls';
import { InterviewRoom } from './InterviewRoom';

describe('interview room', () => {
  it('shows the interviewer, candidate local-only label, state and no transcript panel', () => {
    const html = renderToStaticMarkup(<InterviewRoom
      state="thinking"
      elapsedMs={92_000}
      currentQuestion="请说说你在 Node.js 服务中如何处理背压。"
      error={null}
      answerSubmission="idle"
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
    expect(html).toContain('interviewer-portrait');
    expect(html).toContain('/interviewer/thinking.webp');
    expect(html).toContain('interview-room');
    expect(html).toContain('room-sidebar');
    expect(html).not.toContain('实时转写');
  });

  it('offers an end-interview trigger from the control bar', () => {
    const html = renderToStaticMarkup(<Controls
      microphoneOn cameraOn
      answerSubmission="idle"
      canSubmitAnswer
      onToggleMicrophone={vi.fn()} onToggleCamera={vi.fn()}
      onEndAnswer={vi.fn()} onRequestEnd={vi.fn()}
    />);
    expect(html).toContain('结束面试');
    expect(html).toContain('room-toolbar');
    expect(html).not.toContain('确定结束这场面试？');
  });

  it('disables and announces the answer action while submission is in flight', () => {
    const html = renderToStaticMarkup(<Controls
      microphoneOn cameraOn answerSubmission="submitting" canSubmitAnswer
      onToggleMicrophone={vi.fn()} onToggleCamera={vi.fn()}
      onEndAnswer={vi.fn()} onRequestEnd={vi.fn()}
    />);

    expect(html).toContain('正在提交…');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('disabled');
  });

  it('offers an enabled retry after answer submission fails', () => {
    const html = renderToStaticMarkup(<Controls
      microphoneOn cameraOn answerSubmission="failed" canSubmitAnswer
      onToggleMicrophone={vi.fn()} onToggleCamera={vi.fn()}
      onEndAnswer={vi.fn()} onRequestEnd={vi.fn()}
    />);

    expect(html).toContain('重新提交回答');
    expect(html).not.toContain('disabled');
  });

  it.each(['thinking', 'speaking', 'reconnecting', 'paused', 'closing'] as const)('disables answer submission without retry semantics while %s', (state) => {
    const onEndAnswer = vi.fn();
    const html = renderToStaticMarkup(<InterviewRoom
      state={state} elapsedMs={0} currentQuestion={null} error={null} candidateStream={null}
      answerSubmission="failed"
      endDialogOpen={false} ending={false} endError={null}
      onEndAnswer={onEndAnswer} onRetry={vi.fn()} onRequestEnd={vi.fn()} onCancelEnd={vi.fn()} onEndInterview={vi.fn()}
    />);

    expect(html).toMatch(/class="answer-button"[^>]*disabled[^>]*>我回答完了<\/button>/);
    expect(html).not.toContain('重新提交回答');
  });

  it.each(['thinking', 'speaking', 'reconnecting', 'paused', 'closing'] as const)('does not invoke answer submission from the disabled %s control', () => {
    const onEndAnswer = vi.fn();
    const controls = Controls({
      microphoneOn: true,
      cameraOn: true,
      answerSubmission: 'failed',
      canSubmitAnswer: false,
      onToggleMicrophone: vi.fn(),
      onToggleCamera: vi.fn(),
      onEndAnswer,
      onRequestEnd: vi.fn(),
    }) as ReactElement<{ children: ReactNode }>;
    const answer = Children.toArray(controls.props.children).find((child) => (
      isValidElement<{ className?: string }>(child) && child.props.className === 'answer-button'
    ));
    if (!isValidElement<{ onClick(): void }>(answer)) throw new Error('answer control missing');

    answer.props.onClick();
    expect(onEndAnswer).not.toHaveBeenCalled();
  });

  it('keeps the room visible with a retryable ending error', () => {
    const html = renderToStaticMarkup(<InterviewRoom
      state="listening"
      elapsedMs={0}
      currentQuestion={null}
      error={null}
      answerSubmission="idle"
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

  it('uses the compact navigation safe exit while an interview is in progress', () => {
    const html = renderToStaticMarkup(<InterviewRoom
      state="listening" elapsedMs={0} currentQuestion={null} error={null} candidateStream={null}
      answerSubmission="idle"
      endDialogOpen={false} ending={false} endError={null}
      onEndAnswer={vi.fn()} onRetry={vi.fn()} onRequestEnd={vi.fn()} onCancelEnd={vi.fn()} onEndInterview={vi.fn()}
    />);

    expect(html).toContain('结束并离开');
    expect(html).not.toContain('href="/history"');
  });
});
