'use client';

import { useEffect, useRef, useState } from 'react';
import type { InterviewSessionView, SessionState } from '../../modules/interview-session/types';
import { Controls } from './Controls';
import { EndInterviewDialog } from './EndInterviewDialog';
import { InterviewerPortrait } from './InterviewerPortrait';
import { AppNavigation } from '../navigation/AppNavigation';

const stateCopy: Record<SessionState, string> = {
  ready: '准备中', connecting: '正在连接面试官', listening: '请开始回答',
  thinking: '正在思考你的回答', speaking: '面试官正在提问', paused: '面试已暂停',
  reconnecting: '连接波动，正在恢复', closing: '正在收尾并保存', finished: '面试已结束',
};

function formatTime(ms: number) {
  const seconds = Math.floor(ms / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export function InterviewRoom({ state, elapsedMs, currentQuestion, error, answerSubmission, candidateStream, endDialogOpen, ending, endError, onEndAnswer, onRetry, onRequestEnd, onCancelEnd, onEndInterview }: {
  state: SessionState;
  elapsedMs: number;
  currentQuestion: string | null;
  error: string | null;
  answerSubmission: InterviewSessionView['answerSubmission'];
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
  const [endTrigger, setEndTrigger] = useState<HTMLButtonElement | null>(null);
  const [microphoneOn, setMicrophoneOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  useEffect(() => { if (video.current) video.current.srcObject = candidateStream; }, [candidateStream]);
  const toggle = (kind: 'audio' | 'video', active: boolean) => {
    candidateStream?.getTracks().filter((track) => track.kind === kind).forEach((track) => { track.enabled = !active; });
  };
  return <main className="interview-shell interview-room">
    <header className="room-header app-nav">
      <AppNavigation active="interview" compact onAttemptLeave={onRequestEnd} />
      <div className="room-clock"><time>{formatTime(elapsedMs)} <small>/ 45:00</small></time><span className="recording-dot">进行中</span></div>
    </header>
    <section className="room-layout">
      <div className="interviewer-frame">
        <InterviewerPortrait state={state} />
        <div className="state-overlay" aria-live="polite"><span>{stateCopy[state]}</span>{currentQuestion && <q>{currentQuestion}</q>}{state === 'listening' && <small>可以慢慢组织，完成后点击“我回答完了”</small>}</div>
        {error && <div className="room-error" role="alert"><span>{error}</span>{state === 'paused' && <button type="button" onClick={onRetry}>重试连接</button>}</div>}
      </div>
      <aside className="room-sidebar" aria-label="面试信息">
        <div className={`candidate-pip${cameraOn ? '' : ' candidate-pip--off'}`}><video ref={video} autoPlay muted playsInline />{!cameraOn && <strong>摄像头已关闭</strong>}<span>本机画面 · 不保存</span></div>
        <section className="room-info-card"><p>当前问题</p><q>{currentQuestion ?? '面试官正在准备第一个问题…'}</q></section>
        <section className="room-info-card room-info-card--status"><p>当前状态</p><strong>{stateCopy[state]}</strong><span>{microphoneOn ? '麦克风已开启' : '麦克风已关闭'}</span></section>
      </aside>
    </section>
    <Controls microphoneOn={microphoneOn} cameraOn={cameraOn} answerSubmission={answerSubmission} canSubmitAnswer={state === 'listening'}
      onToggleMicrophone={() => { toggle('audio', microphoneOn); setMicrophoneOn(!microphoneOn); }}
      onToggleCamera={() => { toggle('video', cameraOn); setCameraOn(!cameraOn); }}
      onEndAnswer={onEndAnswer} onRequestEnd={(trigger) => { setEndTrigger(trigger); onRequestEnd(); }} />
    <EndInterviewDialog open={endDialogOpen} pending={ending} error={endError} restoreFocusTarget={endTrigger} onCancel={onCancelEnd} onConfirm={onEndInterview} />
  </main>;
}
