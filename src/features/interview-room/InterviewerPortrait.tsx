'use client';

import Image from 'next/image';
import { useState } from 'react';

import type { SessionState } from '../../modules/interview-session/types';

const BASE_PORTRAIT = '/interviewer/base.webp';

const portraitByState: Record<SessionState, string> = {
  ready: BASE_PORTRAIT,
  connecting: '/interviewer/thinking.webp',
  listening: '/interviewer/listening.webp',
  thinking: '/interviewer/thinking.webp',
  speaking: '/interviewer/speaking.webp',
  paused: BASE_PORTRAIT,
  reconnecting: '/interviewer/thinking.webp',
  closing: BASE_PORTRAIT,
  finished: BASE_PORTRAIT,
};

const labelByState: Record<SessionState, string> = {
  ready: '技术面试官张老师',
  connecting: '面试官正在进入会议',
  listening: '面试官正在聆听你的回答',
  thinking: '面试官正在思考你的回答',
  speaking: '面试官正在提问',
  paused: '面试官画面已暂停',
  reconnecting: '面试官正在重新连接',
  closing: '面试官正在结束本场面试',
  finished: '本场面试已结束',
};

export function portraitSourceAfterError(source: string): string | null {
  return source === BASE_PORTRAIT ? null : BASE_PORTRAIT;
}

export function InterviewerPortrait({ state }: { state: SessionState }) {
  const [failedSources, setFailedSources] = useState<ReadonlySet<string>>(() => new Set());
  const desiredSource = portraitByState[state];
  const fallbackSource = failedSources.has(desiredSource) ? portraitSourceAfterError(desiredSource) : desiredSource;
  const source = fallbackSource && !failedSources.has(fallbackSource) ? fallbackSource : null;
  const speaking = state === 'speaking' && source === desiredSource;
  const markFailed = (failedSource: string) => {
    setFailedSources((current) => new Set(current).add(failedSource));
  };

  return <figure className={`interviewer-portrait interviewer-portrait--motion-safe${speaking ? ' interviewer-portrait--speaking' : ''}`}>
    <div className="interviewer-portrait__media">
      {source ? <Image
        className="interviewer-portrait__layer interviewer-portrait__layer--primary"
        src={speaking ? BASE_PORTRAIT : source}
        width={1600}
        height={900}
        sizes="(max-width: 700px) 100vw, (max-width: 1100px) 68vw, 72vw"
        preload={!speaking}
        unoptimized
        alt={labelByState[state]}
        onError={() => markFailed(speaking ? BASE_PORTRAIT : source)}
      /> : <div className="interviewer-portrait__placeholder" role="img" aria-label={labelByState[state]} />}
      {speaking && <Image
        className="interviewer-portrait__layer interviewer-portrait__layer--speaking"
        src={source}
        width={1600}
        height={900}
        sizes="(max-width: 700px) 100vw, (max-width: 1100px) 68vw, 72vw"
        preload
        unoptimized
        alt=""
        onError={() => markFailed(source)}
      />}
    </div>
    <figcaption><strong>张老师</strong><span>AI 技术面试官</span></figcaption>
  </figure>;
}
