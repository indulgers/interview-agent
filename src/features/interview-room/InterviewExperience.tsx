'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ContentSnapshot } from '../../modules/interview-content/types';
import { DeviceCheck, inspectMediaStream, type DeviceStatus } from './DeviceCheck';
import { InterviewRoom } from './InterviewRoom';
import { useInterviewSession } from './useInterviewSession';

export function historySummaryPath(sessionId: string) {
  return `/history/${encodeURIComponent(sessionId)}`;
}

export function InterviewExperience({ snapshot, testMode = false }: { snapshot: ContentSnapshot; testMode?: boolean }) {
  const router = useRouter();
  const [deviceStatus, setDeviceStatus] = useState<DeviceStatus>('idle');
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [started, setStarted] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [endDialogOpen, setEndDialogOpen] = useState(false);
  const [ending, setEnding] = useState(false);
  const [endError, setEndError] = useState<string | null>(null);
  const session = useInterviewSession(snapshot, stream, testMode);
  useEffect(() => () => stream?.getTracks().forEach((track) => track.stop()), [stream]);
  useEffect(() => {
    if (!session.view.result || !session.view.sessionId) return;
    setEndDialogOpen(false);
    router.replace(historySummaryPath(session.view.sessionId));
  }, [router, session.view.result, session.view.sessionId]);
  const requestDevices = async () => {
    setDeviceStatus('checking');
    try {
      const next = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: { width: 1280, height: 720 } });
      setStream((previous) => { previous?.getTracks().forEach((track) => track.stop()); return next; });
      setDeviceStatus(await inspectMediaStream(next));
    } catch (error) {
      setDeviceStatus(error instanceof DOMException && error.name === 'NotFoundError' ? 'missing' : 'denied');
    }
  };
  if (!started) return <DeviceCheck status={deviceStatus} error={startError} onRequest={() => { setStartError(null); void requestDevices(); }} onStart={() => {
    setStartError(null);
    void session.start().then(() => setStarted(true)).catch(() => setStartError('面试官连接失败，请检查网络后重试。'));
  }} />;
  return <InterviewRoom state={session.view.state} elapsedMs={session.view.activeDurationMs} currentQuestion={session.view.currentQuestion} error={session.view.error} candidateStream={stream}
    endDialogOpen={endDialogOpen} ending={ending} endError={endError}
    onEndAnswer={() => { void session.endAnswer(); }}
    onRetry={() => { void session.retry(); }}
    onRequestEnd={() => { setEndError(null); setEndDialogOpen(true); }}
    onCancelEnd={() => { setEndError(null); setEndDialogOpen(false); }}
    onEndInterview={async () => {
      setEnding(true);
      setEndError(null);
      try {
        await session.end();
      } catch (cause) {
        setEnding(false);
        setEndError('结束保存失败，请重试。');
        throw cause;
      }
    }}
  />;
}
