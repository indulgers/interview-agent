'use client';

import { useEffect, useState } from 'react';
import type { ContentSnapshot } from '../../modules/interview-content/types';
import { DeviceCheck, inspectMediaStream, type DeviceStatus } from './DeviceCheck';
import { InterviewRoom } from './InterviewRoom';
import { useInterviewSession } from './useInterviewSession';

export function InterviewExperience({ snapshot, testMode = false }: { snapshot: ContentSnapshot; testMode?: boolean }) {
  const [deviceStatus, setDeviceStatus] = useState<DeviceStatus>('idle');
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [started, setStarted] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const session = useInterviewSession(snapshot, stream, testMode);
  useEffect(() => () => stream?.getTracks().forEach((track) => track.stop()), [stream]);
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
    onEndAnswer={() => { void session.endAnswer(); }} onRetry={() => { void session.retry(); }} onEndInterview={() => { void session.end(); }} />;
}
