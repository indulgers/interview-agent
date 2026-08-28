import Image from 'next/image';

export function Avatar({ speaking }: { speaking: boolean }) {
  return (
    <div className={`avatar-stage${speaking ? ' is-speaking' : ''}`} aria-label={speaking ? '面试官正在说话' : '面试官正在聆听'}>
      <span className="voice-orbit" aria-hidden="true" />
      <Image className="avatar-face" src={speaking ? '/avatar-mouth-open.svg' : '/avatar-mouth-closed.svg'} alt="AI 技术面试官" width={320} height={320} priority />
      <span className="avatar-name">AI 技术面试官</span>
    </div>
  );
}
