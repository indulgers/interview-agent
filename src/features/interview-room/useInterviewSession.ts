'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import type { ContentSnapshot } from '../../modules/interview-content/types';
import { createBrowserInterviewHistory } from '../../modules/interview-history/browser-history';
import { createInterviewSession } from '../../modules/interview-session/machine';
import type { InterviewSessionView } from '../../modules/interview-session/types';
import { createRuntimeVoice } from '../../modules/realtime-voice/runtime-voice';

const browserClock = { now: () => Date.now() };
const browserScheduler = {
  schedule: (callback: () => void, delayMs: number) => {
    const id = window.setTimeout(callback, delayMs);
    return () => window.clearTimeout(id);
  },
};

function createEndTestControl() {
  let failNext = false;
  let endCalls = 0;
  let gate: { promise: Promise<void>; release(): void } | null = null;
  return {
    beforeFinish: async () => {
      if (failNext) {
        failNext = false;
        throw new Error('test end failure');
      }
      await gate?.promise;
    },
    deferNextEnd: () => {
      if (gate) {
        gate.release();
        gate = null;
        return;
      }
      let release!: () => void;
      const promise = new Promise<void>((resolve) => { release = resolve; });
      gate = { promise, release };
    },
    failNextEnd: () => { failNext = true; },
    recordEndCall: () => { endCalls++; },
    endCallCount: () => endCalls,
  };
}

export function useInterviewSession(snapshot: ContentSnapshot, mediaStream: MediaStream | null, testMode = false) {
  const { session, endTestControl } = useMemo(() => {
    const history = createBrowserInterviewHistory();
    const control = testMode ? createEndTestControl() : null;
    return {
      session: createInterviewSession({
        snapshot,
        history: control ? { ...history, finish: async (...input) => { await control.beforeFinish(); await history.finish(...input); } } : history,
        voice: createRuntimeVoice(mediaStream ?? undefined, testMode),
        clock: browserClock,
        scheduler: browserScheduler,
      }),
      endTestControl: control,
    };
  }, [snapshot, mediaStream, testMode]);
  const [view, setView] = useState<InterviewSessionView>(() => session.view());
  const refresh = useCallback(() => setView(session.view()), [session]);
  useEffect(() => {
    const id = window.setInterval(refresh, 200);
    return () => { window.clearInterval(id); void session.end(); };
  }, [refresh, session]);
  useEffect(() => {
    if (!testMode || !endTestControl) return;
    const target = window as Window & { __interviewE2E?: Record<string, unknown> };
    const previous = target.__interviewE2E;
    const controls = {
      ...previous,
      deferNextEnd: endTestControl.deferNextEnd,
      failNextEnd: endTestControl.failNextEnd,
      endCallCount: endTestControl.endCallCount,
      finishNaturally: () => session.end(),
    };
    target.__interviewE2E = controls;
    return () => { if (target.__interviewE2E === controls) target.__interviewE2E = previous; };
  }, [endTestControl, session, testMode]);
  return {
    view,
    start: async () => {
      if (!mediaStream) throw new Error('设备还没有准备好');
      await session.start({ microphone: true, camera: true }); refresh();
    },
    retry: async () => { await session.retry(); refresh(); },
    endAnswer: async () => { await session.signalEndOfAnswer(); refresh(); },
    end: async () => {
      endTestControl?.recordEndCall();
      if (!session.view().sessionId) throw new Error('面试会话尚未保存');
      const terminal = await session.end();
      refresh();
      if (!terminal.sessionId || !terminal.result) throw new Error('面试会话尚未完成保存');
      return { sessionId: terminal.sessionId, result: terminal.result };
    },
  };
}
