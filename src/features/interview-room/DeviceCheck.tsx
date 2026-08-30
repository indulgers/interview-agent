'use client';

import { useEffect, useRef } from 'react';

export type DeviceStatus = 'idle' | 'checking' | 'denied' | 'missing' | 'silent' | 'frozen' | 'ready';

export function classifyDeviceReadiness(input: {
  permission: 'granted' | 'denied';
  microphoneTrack: boolean;
  cameraTrack: boolean;
  heardVoice: boolean;
  videoAdvanced: boolean;
}): DeviceStatus {
  if (input.permission === 'denied') return 'denied';
  if (!input.microphoneTrack || !input.cameraTrack) return 'missing';
  if (!input.heardVoice) return 'silent';
  if (!input.videoAdvanced) return 'frozen';
  return 'ready';
}

export async function inspectMediaStream(stream: MediaStream, timeoutMs = 4_000): Promise<DeviceStatus> {
  const microphoneTrack = stream.getAudioTracks().some((track) => track.readyState === 'live');
  const cameraTrack = stream.getVideoTracks().some((track) => track.readyState === 'live');
  if (!microphoneTrack || !cameraTrack) return 'missing';

  const audioContext = new AudioContext();
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 256;
  audioContext.createMediaStreamSource(stream).connect(analyser);
  const levels = new Uint8Array(analyser.frequencyBinCount);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  await video.play();
  let videoAdvanced = false;
  let heardVoice = false;
  const started = performance.now();
  while (performance.now() - started < timeoutMs && (!videoAdvanced || !heardVoice)) {
    analyser.getByteTimeDomainData(levels);
    heardVoice ||= levels.some((level) => Math.abs(level - 128) > 4);
    videoAdvanced ||= video.currentTime > 0;
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  video.pause();
  video.srcObject = null;
  await audioContext.close();
  return classifyDeviceReadiness({ permission: 'granted', microphoneTrack, cameraTrack, heardVoice, videoAdvanced });
}

const messages: Record<DeviceStatus, string> = {
  idle: '开始前，先确认麦克风和摄像头正常。',
  checking: '正在检查设备…',
  denied: '没有获得设备权限。请在浏览器中允许麦克风和摄像头。',
  missing: '未检测到麦克风或摄像头。请连接设备后重试。',
  silent: '请对着麦克风说句话，让我确认能听见你。',
  frozen: '摄像头画面还没有准备好，请检查是否被其他应用占用。',
  ready: '设备已就绪。坐直、看向镜头，然后开始。',
};

export function bindPreviewStream(video: HTMLVideoElement, stream: MediaStream) {
  video.srcObject = stream;
  return () => { if (video.srcObject === stream) video.srcObject = null; };
}

export function DeviceCheck({ status, stream, starting, error, onRequest, onStart }: {
  status: DeviceStatus;
  stream: MediaStream | null;
  starting: boolean;
  error?: string | null;
  onRequest(): void;
  onStart(): void;
}) {
  const ready = status === 'ready';
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (!video.current || !stream) return;
    return bindPreviewStream(video.current, stream);
  }, [stream]);
  return (
    <main className="device-shell">
      <div className="device-layout">
        <section className="device-intro" aria-labelledby="device-title">
          <p className="room-kicker">面试准备 · 45 分钟</p>
          <h1 id="device-title">把环境调整好，<br />再从容开始。</h1>
          <p>这是一场围绕 Node.js 全栈与 AI Agent 实践的中文模拟面试。你可以自然停顿，完成回答后再主动交给面试官。</p>
          <ol className="device-steps">
            <li><span>1</span><strong>检查麦克风与摄像头</strong></li>
            <li><span>2</span><strong>调整坐姿与环境光线</strong></li>
            <li><span>3</span><strong>准备好后开始面试</strong></li>
          </ol>
        </section>
        <section className="device-card" aria-label="设备检查">
          <div className={`device-preview${stream ? ' device-preview--live' : ''}`}>
            {stream
              ? <video ref={video} autoPlay muted playsInline aria-label="本机摄像头画面" />
              : <span>设备就绪后显示本机画面</span>}
          </div>
          <p className={`device-status device-status--${status}`}><span aria-hidden="true" />{messages[status]}</p>
          {error && <p className="device-error" role="alert">{error}</p>}
          <div className="device-grid" aria-label="设备要求"><span>麦克风有声音</span><span>摄像头有画面</span><span>安静的空间</span></div>
          <p className="privacy-note">本机预览，不会上传或保存音视频</p>
          <div className="device-actions">{!ready && <button className="secondary-button" type="button" onClick={onRequest} disabled={status === 'checking'}>{status === 'checking' ? '正在检查…' : '检查设备'}</button>}<button className="start-interview" type="button" onClick={onStart} disabled={!ready || starting} aria-busy={starting}>{starting ? '正在连接…' : '开始 45 分钟面试'}</button></div>
        </section>
      </div>
    </main>
  );
}
