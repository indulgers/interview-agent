import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { bindPreviewStream, classifyDeviceReadiness, DeviceCheck } from './DeviceCheck';

describe('DeviceCheck', () => {
  it.each([
    ['denied', '没有获得设备权限'],
    ['missing', '未检测到麦克风或摄像头'],
    ['silent', '请对着麦克风说句话'],
    ['frozen', '摄像头画面还没有准备好'],
  ] as const)('explains %s readiness failures', (status, copy) => {
    const html = renderToStaticMarkup(<DeviceCheck status={status} stream={null} starting={false} onRequest={vi.fn()} onStart={vi.fn()} />);
    expect(html).toContain(copy);
    expect(html).toContain('disabled');
  });

  it('enables start only when microphone and camera are proven live', () => {
    const stream = {} as MediaStream;
    const html = renderToStaticMarkup(<DeviceCheck status="ready" stream={stream} starting={false} onRequest={vi.fn()} onStart={vi.fn()} />);
    expect(html).toContain('设备已就绪');
    expect(html).toContain('开始 45 分钟面试');
    expect(html).not.toContain('disabled');
    expect(html).toContain('本机预览，不会上传或保存');
    expect(html).toContain('device-status');
    expect(html).toContain('device-steps');
    expect(html).toContain('<video');
    expect(html).toContain('autoPlay=""');
  });

  it('uses a neutral placeholder before a stream exists', () => {
    const html = renderToStaticMarkup(<DeviceCheck status="idle" stream={null} starting={false} onRequest={vi.fn()} onStart={vi.fn()} />);

    expect(html).toContain('设备就绪后显示本机画面');
    expect(html).not.toContain('<video');
    expect(html).not.toContain('摄像头预览');
  });

  it('binds and releases the acquired stream on the preview video', () => {
    const stream = {} as MediaStream;
    const video = { srcObject: null } as unknown as HTMLVideoElement;
    const release = bindPreviewStream(video, stream);

    expect(video.srcObject).toBe(stream);
    release();
    expect(video.srcObject).toBeNull();
  });

  it('disables duplicate starts and announces the connection in progress', () => {
    const html = renderToStaticMarkup(<DeviceCheck status="ready" stream={{} as MediaStream} starting onRequest={vi.fn()} onStart={vi.fn()} />);

    expect(html).toContain('正在连接…');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('disabled');
  });
});

describe('classifyDeviceReadiness', () => {
  it('requires two live tracks, observed voice and advancing video', () => {
    expect(classifyDeviceReadiness({ permission: 'granted', microphoneTrack: true, cameraTrack: true, heardVoice: false, videoAdvanced: true })).toBe('silent');
    expect(classifyDeviceReadiness({ permission: 'granted', microphoneTrack: true, cameraTrack: true, heardVoice: true, videoAdvanced: false })).toBe('frozen');
    expect(classifyDeviceReadiness({ permission: 'granted', microphoneTrack: true, cameraTrack: true, heardVoice: true, videoAdvanced: true })).toBe('ready');
  });
});
