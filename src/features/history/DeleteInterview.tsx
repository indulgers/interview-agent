'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function DeleteConfirmation({ onCancel, onConfirm }: { onCancel(): void; onConfirm(): void }) {
  return <div className="delete-confirm" role="alertdialog"><strong>只删除这一场面试？</strong><p>转写、反馈和内容快照会一起删除。没有回收站，无法恢复。</p><button type="button" onClick={onCancel}>取消</button><button className="danger-button" type="button" onClick={onConfirm}>确认删除</button></div>;
}

export function DeleteInterview({ id }: { id: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState(false);
  const remove = async () => {
    const response = await fetch(`/api/interviews/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!response.ok) { setError(true); return; }
    router.push('/history'); router.refresh();
  };
  return <div className="delete-area">{error && <p role="alert">删除失败，请重试。</p>}{confirming ? <DeleteConfirmation onCancel={() => setConfirming(false)} onConfirm={() => { void remove(); }} /> : <button className="delete-trigger" type="button" onClick={() => setConfirming(true)}>删除这场面试</button>}</div>;
}
