'use client';

export function Controls(props: {
  microphoneOn: boolean;
  cameraOn: boolean;
  confirmEnd: boolean;
  onToggleMicrophone(): void;
  onToggleCamera(): void;
  onEndAnswer(): void;
  onRequestEnd(): void;
  onCancelEnd(): void;
  onConfirmEnd(): void;
}) {
  if (props.confirmEnd) {
    return <div className="end-confirm" role="alertdialog" aria-label="结束面试确认">
      <strong>确定结束这场面试？</strong>
      <span>已完成的回答会保存，但面试无法恢复。</span>
      <button type="button" onClick={props.onCancelEnd}>继续面试</button>
      <button className="danger-button" type="button" onClick={props.onConfirmEnd}>确认结束</button>
    </div>;
  }
  return <div className="room-controls" aria-label="面试控制">
    <button type="button" aria-pressed={!props.microphoneOn} onClick={props.onToggleMicrophone}>{props.microphoneOn ? '关闭麦克风' : '打开麦克风'}</button>
    <button type="button" aria-pressed={!props.cameraOn} onClick={props.onToggleCamera}>{props.cameraOn ? '关闭摄像头' : '打开摄像头'}</button>
    <button className="answer-button" type="button" onClick={props.onEndAnswer}>我回答完了</button>
    <button className="end-button" type="button" onClick={props.onRequestEnd}>结束面试</button>
  </div>;
}
