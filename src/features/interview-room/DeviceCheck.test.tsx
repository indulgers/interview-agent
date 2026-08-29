import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { classifyDeviceReadiness, DeviceCheck } from './DeviceCheck';

describe('DeviceCheck', () => {
  it.each([
    ['denied', '没有获得设备权限'],
    ['missing', '未检测到麦克风或摄像头'],
    ['silent', '请对着麦克风说句话'],
    ['frozen', '摄像头画面还没有准备好'],
  ] as const)('explains %s readiness failures', (status, copy) => {
    const html = renderToStaticMarkup(<DeviceCheck status={status} onRequest={vi.fn()} onStart={vi.fn()} />);
    expect(html).toContain(copy);
    expect(html).toContain('disabled');
  });

  it('enables start only when microphone and camera are proven live', () => {
    const html = renderToStaticMarkup(<DeviceCheck status="ready" onRequest={vi.fn()} onStart={vi.fn()} />);
    expect(html).toContain('设备已就绪');
    expect(html).toContain('开始 45 分钟面试');
    expect(html).not.toContain('disabled');
    expect(html).toContain('本机预览，不会上传或保存');
    expect(html).toContain('device-status');
    expect(html).toContain('device-steps');
  });
});

describe('classifyDeviceReadiness', () => {
  it('requires two live tracks, observed voice and advancing video', () => {
    expect(classifyDeviceReadiness({ permission: 'granted', microphoneTrack: true, cameraTrack: true, heardVoice: false, videoAdvanced: true })).toBe('silent');
    expect(classifyDeviceReadiness({ permission: 'granted', microphoneTrack: true, cameraTrack: true, heardVoice: true, videoAdvanced: false })).toBe('frozen');
    expect(classifyDeviceReadiness({ permission: 'granted', microphoneTrack: true, cameraTrack: true, heardVoice: true, videoAdvanced: true })).toBe('ready');
  });
});
