'use client';

import { useEffect, useId, useLayoutEffect, useRef } from 'react';

export function EndInterviewDialog({ open, pending, error, restoreFocusTarget, onCancel, onConfirm }: {
  open: boolean;
  pending: boolean;
  error: string | null;
  restoreFocusTarget: HTMLElement | null;
  onCancel(): void;
  onConfirm(): void | Promise<void>;
}) {
  const continueButton = useRef<HTMLButtonElement>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);
  const status = useRef<HTMLParagraphElement>(null);
  const confirming = useRef(false);
  const latest = useRef({ onCancel, pending });
  const wasPending = useRef(false);
  const titleId = useId();
  const descriptionId = useId();

  useLayoutEffect(() => {
    latest.current = { onCancel, pending };
  }, [onCancel, pending]);

  useEffect(() => {
    if (!open) return;
    const trigger = restoreFocusTarget ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !latest.current.pending) latest.current.onCancel();
    };
    document.addEventListener('keydown', onKeyDown);
    continueButton.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      window.requestAnimationFrame(() => trigger?.focus());
    };
  }, [open, restoreFocusTarget]);

  useLayoutEffect(() => {
    const pendingBegan = open && pending && !wasPending.current;
    wasPending.current = pending;
    if (pendingBegan) window.requestAnimationFrame(() => status.current?.focus());
  }, [open, pending]);

  useEffect(() => {
    if (!pending) confirming.current = false;
  }, [error, pending]);

  if (!open) return null;

  const confirm = () => {
    if (pending || confirming.current) return;
    confirming.current = true;
    void Promise.resolve(onConfirm()).catch(() => { confirming.current = false; });
  };

  return <div className="end-dialog-overlay">
    <div className="end-confirm end-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId}>
      <span className="end-dialog__mark" aria-hidden="true">?</span>
      <strong id={titleId}>确定结束这场面试？</strong>
      <span id={descriptionId}>已完成内容会保存并生成总结。你也可以继续完成当前问题。</span>
      <p ref={status} role={error ? 'alert' : 'status'} tabIndex={-1}>{error ?? (pending ? '正在保存…' : null)}</p>
      <button ref={continueButton} type="button" autoFocus disabled={pending} onClick={onCancel}>继续面试</button>
      <button ref={confirmButton} className="danger-button" type="button" disabled={pending} onClick={confirm}>{pending ? '正在保存…' : error ? '重试结束' : '确认结束并查看总结'}</button>
    </div>
  </div>;
}
