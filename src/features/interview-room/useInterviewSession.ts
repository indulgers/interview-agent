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

export function useInterviewSession(snapshot: ContentSnapshot, mediaStream: MediaStream | null, testMode = false) {
  const session = useMemo(() => createInterviewSession({
    snapshot,
    history: createBrowserInterviewHistory(),
    voice: createRuntimeVoice(mediaStream ?? undefined, testMode),
    clock: browserClock,
    scheduler: browserScheduler,
  }), [snapshot, mediaStream, testMode]);
  const [view, setView] = useState<InterviewSessionView>(() => session.view());
  const refresh = useCallback(() => setView(session.view()), [session]);
  useEffect(() => {
    const id = window.setInterval(refresh, 200);
    return () => { window.clearInterval(id); void session.end(); };
  }, [refresh, session]);
  return {
    view,
    start: async () => {
      if (!mediaStream) throw new Error('设备还没有准备好');
      await session.start({ microphone: true, camera: true }); refresh();
    },
    retry: async () => { await session.retry(); refresh(); },
    endAnswer: async () => { await session.signalEndOfAnswer(); refresh(); },
    end: async () => { await session.end(); refresh(); },
  };
}
