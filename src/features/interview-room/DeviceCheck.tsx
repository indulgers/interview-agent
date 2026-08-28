'use client';

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

export function DeviceCheck({ status, error, onRequest, onStart }: {
  status: DeviceStatus;
  error?: string | null;
  onRequest(): void;
  onStart(): void;
}) {
  const ready = status === 'ready';
  return (
    <main className="device-shell">
      <section className="device-card" aria-labelledby="device-title">
        <p className="room-kicker">45 MIN · NODE.JS FULLSTACK + AI AGENT</p>
        <h1 id="device-title">面试将在你准备好时开始</h1>
        <p className="device-copy">{messages[status]}</p>
        {error && <p className="device-error" role="alert">{error}</p>}
        <div className="device-grid" aria-label="设备要求">
          <span>麦克风有声音</span><span>摄像头有画面</span><span>安静的空间</span>
        </div>
        <p className="privacy-note">本机预览，不会上传或保存音视频</p>
        <div className="device-actions">
          {!ready && <button className="secondary-button" type="button" onClick={onRequest} disabled={status === 'checking'}>检查设备</button>}
          <button className="start-interview" type="button" onClick={onStart} disabled={!ready}>开始 45 分钟面试</button>
        </div>
      </section>
    </main>
  );
}
