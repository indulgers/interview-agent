import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { EndInterviewDialog } from './EndInterviewDialog';

describe('EndInterviewDialog', () => {
  it('renders an accessible confirmation dialog with a continuing action as its initial focus', () => {
    const html = renderToStaticMarkup(<EndInterviewDialog
      open
      pending={false}
      error={null}
      restoreFocusTarget={null}
      onCancel={vi.fn()}
      onConfirm={vi.fn()}
    />);

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('已完成内容会保存并生成总结');
    expect(html).toContain('autofocus');
    expect(html).toContain('继续面试');
    expect(html).toContain('确认结束并查看总结');
  });

  it('disables both actions while durable saving is pending', () => {
    const html = renderToStaticMarkup(<EndInterviewDialog
      open
      pending
      error={null}
      restoreFocusTarget={null}
      onCancel={vi.fn()}
      onConfirm={vi.fn()}
    />);

    expect(html).toContain('正在保存…');
    expect((html.match(/disabled=""/g) ?? [])).toHaveLength(2);
  });

  it('restores a retry action after a save error', () => {
    const html = renderToStaticMarkup(<EndInterviewDialog
      open
      pending={false}
      error="保存会话结果失败"
      restoreFocusTarget={null}
      onCancel={vi.fn()}
      onConfirm={vi.fn()}
    />);

    expect(html).toContain('保存会话结果失败');
    expect(html).toContain('重试结束');
  });
});
