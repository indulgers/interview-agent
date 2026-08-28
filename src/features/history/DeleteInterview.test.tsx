import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { DeleteConfirmation } from './DeleteInterview';

describe('DeleteConfirmation', () => {
  it('states that one interview is permanently deleted with no recycle bin', () => {
    const html = renderToStaticMarkup(<DeleteConfirmation onCancel={vi.fn()} onConfirm={vi.fn()} />);
    expect(html).toContain('只删除这一场面试'); expect(html).toContain('没有回收站'); expect(html).toContain('确认删除');
  });
});
