'use client';

export function Controls(props: {
  microphoneOn: boolean;
  cameraOn: boolean;
  onToggleMicrophone(): void;
  onToggleCamera(): void;
  onEndAnswer(): void;
  onRequestEnd(trigger: HTMLButtonElement): void;
}) {
  return <div className="room-controls" aria-label="面试控制">
    <button type="button" aria-pressed={!props.microphoneOn} onClick={props.onToggleMicrophone}>{props.microphoneOn ? '关闭麦克风' : '打开麦克风'}</button>
    <button type="button" aria-pressed={!props.cameraOn} onClick={props.onToggleCamera}>{props.cameraOn ? '关闭摄像头' : '打开摄像头'}</button>
    <button className="answer-button" type="button" onClick={props.onEndAnswer}>我回答完了</button>
    <button className="end-button" type="button" onClick={(event) => props.onRequestEnd(event.currentTarget)}>结束面试</button>
  </div>;
}
