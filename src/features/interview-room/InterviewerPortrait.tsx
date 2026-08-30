'use client';

import Image from 'next/image';
import { useEffect, useReducer } from 'react';

import type { SessionState } from '../../modules/interview-session/types';

const BASE_PORTRAIT = '/interviewer/base.webp';
const SPEAKING_PORTRAIT = '/interviewer/speaking.webp';

const portraitByState: Record<SessionState, string> = {
  ready: BASE_PORTRAIT,
  connecting: '/interviewer/thinking.webp',
  listening: '/interviewer/listening.webp',
  thinking: '/interviewer/thinking.webp',
  speaking: SPEAKING_PORTRAIT,
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

type PortraitFrame = {
  key: string;
  source: string;
  state: SessionState;
  loaded: boolean;
};

export type PortraitModel = {
  current: PortraitFrame | null;
  previous: PortraitFrame | null;
  pending: PortraitFrame | null;
  failedSources: ReadonlySet<string>;
  failedOverlayKeys: ReadonlySet<string>;
  placeholderState: SessionState | null;
  intentState: SessionState;
  nextKey: number;
};

export type PortraitAction =
  | { type: 'target'; state: SessionState }
  | { type: 'loaded'; key: string }
  | { type: 'settled'; key: string }
  | { type: 'failed'; key: string; source: string }
  | { type: 'overlay-failed'; key: string; source: string };

export function portraitSourceAfterError(source: string): string | null {
  return source === BASE_PORTRAIT ? null : BASE_PORTRAIT;
}

function resolvedSource(state: SessionState, failedSources: ReadonlySet<string>) {
  const desired = portraitByState[state];
  if (!failedSources.has(desired)) return desired;
  const fallback = portraitSourceAfterError(desired);
  return fallback && !failedSources.has(fallback) ? fallback : null;
}

function frameFor(state: SessionState, source: string, key: number, loaded = false): PortraitFrame {
  return { key: `portrait-${key}`, source, state, loaded };
}

export function createPortraitModel(state: SessionState): PortraitModel {
  return {
    current: frameFor(state, portraitByState[state], 0, true),
    previous: null,
    pending: null,
    failedSources: new Set(),
    failedOverlayKeys: new Set(),
    placeholderState: null,
    intentState: state,
    nextKey: 1,
  };
}

export function reducePortraitModel(model: PortraitModel, action: PortraitAction): PortraitModel {
  if (action.type === 'target') {
    const source = portraitByState[action.state];
    if (model.pending?.source === source && model.pending.state === action.state && model.intentState === action.state) return model;
    const failedSources = new Set<string>();
    if (model.current?.source === source && !model.failedSources.has(source) && model.placeholderState === null) {
      return {
        ...model,
        current: { ...model.current, state: action.state },
        pending: null,
        failedSources,
        intentState: action.state,
      };
    }
    return {
      ...model,
      pending: frameFor(action.state, source, model.nextKey),
      failedSources,
      placeholderState: model.current ? null : action.state,
      intentState: action.state,
      nextKey: model.nextKey + 1,
    };
  }

  if (action.type === 'loaded') {
    if (model.pending?.key !== action.key) return model;
    if (model.pending.loaded) return model;
    const loaded = { ...model.pending, loaded: true };
    if (model.previous) return { ...model, pending: loaded };
    return {
      ...model,
      previous: model.current,
      current: loaded,
      pending: null,
      placeholderState: null,
    };
  }

  if (action.type === 'settled') {
    if (!model.previous || model.current?.key !== action.key) return model;
    if (model.pending?.loaded) {
      return {
        ...model,
        previous: model.current,
        current: model.pending,
        pending: null,
        placeholderState: null,
      };
    }
    return { ...model, previous: null };
  }

  if (action.type === 'overlay-failed') {
    const key = action.key;
    const belongsToNewestFrame = model.current?.key === key || model.pending?.key === key;
    if (!key || model.intentState !== 'speaking' || !belongsToNewestFrame) return model;
    return { ...model, failedOverlayKeys: new Set(model.failedOverlayKeys).add(key) };
  }

  if (model.pending?.key === action.key) {
    if (model.pending.source !== action.source) return model;
    const failedSources = new Set(model.failedSources).add(action.source);
    const fallback = resolvedSource(model.pending.state, failedSources);
    if (!fallback) {
      return {
        ...model,
        current: null,
        previous: null,
        pending: null,
        failedSources,
        placeholderState: model.pending.state,
      };
    }
    return {
      ...model,
      failedSources,
      pending: frameFor(model.pending.state, fallback, model.nextKey),
      nextKey: model.nextKey + 1,
    };
  }

  if (!model.pending && model.current?.key === action.key && model.current.source === action.source) {
    const failedSources = new Set(model.failedSources).add(action.source);
    const fallback = resolvedSource(model.current.state, failedSources);
    if (!fallback) {
      return {
        ...model,
        current: null,
        previous: null,
        pending: null,
        failedSources,
        placeholderState: model.current.state,
      };
    }
    return {
      ...model,
      failedSources,
      pending: frameFor(model.current.state, fallback, model.nextKey),
      nextKey: model.nextKey + 1,
    };
  }

  return model;
}

export function InterviewerPortrait({ state }: { state: SessionState }) {
  const [model, dispatch] = useReducer(reducePortraitModel, state, createPortraitModel);
  useEffect(() => { dispatch({ type: 'target', state }); }, [state]);

  const renderFrame = (frame: PortraitFrame, role: 'current' | 'previous' | 'pending') => {
    const speaking = frame.state === 'speaking' && frame.source === SPEAKING_PORTRAIT;
    const crossfading = role !== 'pending' && model.previous !== null;
    const className = [
      'interviewer-portrait__layer',
      `interviewer-portrait__layer--${role}`,
      crossfading && role === 'current' ? 'interviewer-portrait__layer--entering' : '',
      crossfading && role === 'previous' ? 'interviewer-portrait__layer--leaving' : '',
    ].filter(Boolean).join(' ');
    return <div
      className={className}
      data-portrait-key={frame.key}
      data-portrait-source={frame.source}
      key={frame.key}
      onAnimationEnd={(event) => {
        if (role === 'current' && event.currentTarget === event.target) dispatch({ type: 'settled', key: frame.key });
      }}
    >
      <Image
        className={`interviewer-portrait__image interviewer-portrait__image--primary${speaking ? ' interviewer-portrait__layer--speaking' : ''}`}
        src={frame.source}
        width={1600}
        height={900}
        sizes="(max-width: 700px) 100vw, (max-width: 1100px) 68vw, 72vw"
        preload={role !== 'previous'}
        unoptimized
        alt={role === 'current' ? labelByState[frame.state] : ''}
        onLoad={() => { if (role === 'pending') dispatch({ type: 'loaded', key: frame.key }); }}
        onError={() => dispatch({ type: 'failed', key: frame.key, source: frame.source })}
      />
      {speaking && !model.failedOverlayKeys.has(frame.key) && <Image
        className="interviewer-portrait__image interviewer-portrait__image--speaking-base"
        src={BASE_PORTRAIT}
        width={1600}
        height={900}
        sizes="(max-width: 700px) 100vw, (max-width: 1100px) 68vw, 72vw"
        unoptimized
        alt=""
        onError={() => dispatch({ type: 'overlay-failed', key: frame.key, source: BASE_PORTRAIT })}
      />}
    </div>;
  };

  return <figure className="interviewer-portrait interviewer-portrait--motion-safe">
    <div className="interviewer-portrait__media">
      {model.previous && renderFrame(model.previous, 'previous')}
      {model.current ? renderFrame(model.current, 'current') : <div className="interviewer-portrait__placeholder" role="img" aria-label={`${labelByState[model.placeholderState ?? state]}，面试官画面暂时不可用`}><span>面试官画面暂时不可用</span></div>}
      {model.pending && renderFrame(model.pending, 'pending')}
    </div>
    <figcaption><strong>张老师</strong><span>AI 技术面试官</span></figcaption>
  </figure>;
}
