'use client';

import type { InterviewSessionView } from '../../modules/interview-session/types';

export function Controls(props: {
  microphoneOn: boolean;
  cameraOn: boolean;
  answerSubmission: InterviewSessionView['answerSubmission'];
  canSubmitAnswer: boolean;
  endDisabled: boolean;
  onToggleMicrophone(): void;
  onToggleCamera(): void;
  onEndAnswer(): void;
  onRequestEnd(trigger: HTMLButtonElement): void;
}) {
  const submitting = props.canSubmitAnswer && props.answerSubmission === 'submitting';
  const answerCopy = submitting ? '正在提交…' : props.canSubmitAnswer && props.answerSubmission === 'failed' ? '重新提交回答' : '我回答完了';
  return <div className="room-controls room-toolbar" aria-label="面试控制">
    <button className="media-button" type="button" aria-pressed={!props.microphoneOn} onClick={props.onToggleMicrophone}><span aria-hidden="true">麦</span>{props.microphoneOn ? '关闭麦克风' : '打开麦克风'}</button>
    <button className="media-button" type="button" aria-pressed={!props.cameraOn} onClick={props.onToggleCamera}><span aria-hidden="true">像</span>{props.cameraOn ? '关闭摄像头' : '打开摄像头'}</button>
    <button className="answer-button" type="button" disabled={!props.canSubmitAnswer || submitting} aria-busy={submitting} onClick={() => { if (props.canSubmitAnswer) props.onEndAnswer(); }}>{answerCopy}</button>
    <button className="end-button" type="button" disabled={props.endDisabled} onClick={(event) => { if (!props.endDisabled) props.onRequestEnd(event.currentTarget); }}>结束面试</button>
  </div>;
}
