'use client';

import { useEffect, useId, useRef } from 'react';

export function EndInterviewDialog({ open, pending, error, onCancel, onConfirm }: {
  open: boolean;
  pending: boolean;
  error: string | null;
  onCancel(): void;
  onConfirm(): void | Promise<void>;
}) {
  const continueButton = useRef<HTMLButtonElement>(null);
  const confirming = useRef(false);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !pending) onCancel();
    };
    document.addEventListener('keydown', onKeyDown);
    continueButton.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      trigger?.focus();
    };
  }, [onCancel, open, pending]);

  useEffect(() => {
    if (!pending) confirming.current = false;
  }, [error, pending]);

  if (!open) return null;

  const confirm = () => {
    if (pending || confirming.current) return;
    confirming.current = true;
    void Promise.resolve(onConfirm()).catch(() => { confirming.current = false; });
  };

  return <div className="end-dialog-overlay" style={{ position: 'fixed', inset: 0, zIndex: 10, display: 'grid', placeItems: 'center', padding: '1rem', background: 'rgb(0 0 0 / 45%)' }}>
    <div className="end-confirm" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId}>
      <strong id={titleId}>确定结束这场面试？</strong>
      <span id={descriptionId}>已完成内容会保存并生成总结。</span>
      {error && <p role="alert">{error}</p>}
      <button ref={continueButton} type="button" autoFocus disabled={pending} onClick={onCancel}>继续面试</button>
      <button className="danger-button" type="button" disabled={pending} onClick={confirm}>{pending ? '正在保存…' : error ? '重试结束' : '确认结束并查看总结'}</button>
    </div>
  </div>;
}
