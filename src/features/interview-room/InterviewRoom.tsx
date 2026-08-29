'use client';

import { useEffect, useRef, useState } from 'react';
import type { SessionState } from '../../modules/interview-session/types';
import { Avatar } from './Avatar';
import { Controls } from './Controls';
import { EndInterviewDialog } from './EndInterviewDialog';

const stateCopy: Record<SessionState, string> = {
  ready: '准备中', connecting: '正在连接面试官', listening: '请开始回答',
  thinking: '正在思考你的回答', speaking: '面试官正在提问', paused: '面试已暂停',
  reconnecting: '连接波动，正在恢复', closing: '正在收尾并保存', finished: '面试已结束',
};

function formatTime(ms: number) {
  const seconds = Math.floor(ms / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export function InterviewRoom({ state, elapsedMs, currentQuestion, error, candidateStream, endDialogOpen, ending, endError, onEndAnswer, onRetry, onRequestEnd, onCancelEnd, onEndInterview }: {
  state: SessionState;
  elapsedMs: number;
  currentQuestion: string | null;
  error: string | null;
  candidateStream: MediaStream | null;
  endDialogOpen: boolean;
  ending: boolean;
  endError: string | null;
  onEndAnswer(): void;
  onRetry(): void;
  onRequestEnd(): void;
  onCancelEnd(): void;
  onEndInterview(): void | Promise<void>;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [microphoneOn, setMicrophoneOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  useEffect(() => { if (video.current) video.current.srcObject = candidateStream; }, [candidateStream]);
  const toggle = (kind: 'audio' | 'video', active: boolean) => {
    candidateStream?.getTracks().filter((track) => track.kind === kind).forEach((track) => { track.enabled = !active; });
  };
  return <main className="interview-shell">
    <header className="room-header"><span className="room-brand">INTERVIEW / 01</span><time>{formatTime(elapsedMs)} <small>/ 45:00</small></time><span className="recording-dot">LIVE</span></header>
    <section className="interviewer-frame">
      <Avatar speaking={state === 'speaking'} />
      <div className="state-overlay"><span>{stateCopy[state]}</span>{currentQuestion && <q>{currentQuestion}</q>}{state === 'listening' && <small>结束时可点击“我回答完了”</small>}</div>
      {error && <div className="room-error" role="alert"><span>{error}</span>{state === 'paused' && <button type="button" onClick={onRetry}>重试连接</button>}</div>}
      <aside className="candidate-pip"><video ref={video} autoPlay muted playsInline /><span>本机画面 · 不保存</span></aside>
    </section>
    <Controls microphoneOn={microphoneOn} cameraOn={cameraOn}
      onToggleMicrophone={() => { toggle('audio', microphoneOn); setMicrophoneOn(!microphoneOn); }}
      onToggleCamera={() => { toggle('video', cameraOn); setCameraOn(!cameraOn); }}
      onEndAnswer={onEndAnswer} onRequestEnd={onRequestEnd} />
    <EndInterviewDialog open={endDialogOpen} pending={ending} error={endError} onCancel={onCancelEnd} onConfirm={onEndInterview} />
  </main>;
}
