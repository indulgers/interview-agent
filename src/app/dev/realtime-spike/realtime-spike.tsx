'use client';

import { useEffect, useRef, useState } from 'react';

import { createBrowserBailianRealtimeVoice } from '../../../modules/realtime-voice/bailian/adapter';
import type { RealtimeConnection, VoiceEvent } from '../../../modules/realtime-voice/port';
import { closeSpikeConnection, spikeControlsEnabled } from './realtime-spike-state';

export function RealtimeSpike() {
  const connection = useRef<RealtimeConnection | null>(null);
  const [status, setStatus] = useState('未连接');
  const [events, setEvents] = useState<string[]>([]);
  const [candidate, setCandidate] = useState('');
  const [assistant, setAssistant] = useState('');
  const [bargeIn, setBargeIn] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const controlsEnabled = spikeControlsEnabled(isConnected);
  useEffect(() => () => { void closeSpikeConnection(connection.current); }, []);

  const observe = async (event: VoiceEvent) => {
    const at = event.type === 'final_turn' ? event.endedAt : event.at;
    setEvents((previous) => [`${new Date(at).toLocaleTimeString()} ${event.type}`, ...previous].slice(0, 30));
    if (event.type === 'connection') setStatus(event.state === 'connected' ? '已连接' : '已断开');
    if (event.type === 'candidate_speech') setBargeIn(event.state === 'started');
    if (event.type === 'final_turn') {
      if (event.speaker === 'candidate') setCandidate(event.text);
      else setAssistant(event.text);
    }
    if (event.type === 'error') setStatus(event.message);
  };

  const connect = async () => {
    try {
      setStatus('正在连接…');
      const next = await createBrowserBailianRealtimeVoice().connect({
        instructions: '你是一位中文技术面试官。每次只问一个简短问题，并等待候选人回答。',
        resumeFromSequence: 0,
      });
      connection.current = next;
      next.subscribe(observe);
      setIsConnected(true);
      setStatus('已连接');
    } catch {
      setStatus('连接不可用；请检查本机开发环境配置。');
    }
  };

  const disconnect = async () => {
    await closeSpikeConnection(connection.current);
    connection.current = null;
    setIsConnected(false);
    setStatus('已断开');
  };

  return (
    <main style={{ maxWidth: 720, margin: '48px auto', fontFamily: 'sans-serif' }}>
      <h1>百炼 WebRTC 开发验证</h1>
      <p>状态：{status} · 打断：{bargeIn ? '候选人正在说话' : '无'}</p>
      <button type="button" onClick={connect} disabled={controlsEnabled}>连接</button>{' '}
      <button type="button" onClick={() => connection.current?.signalEndOfAnswer()} disabled={!controlsEnabled}>结束回答（辅助静音）</button>{' '}
      <button type="button" onClick={() => connection.current?.cancelAssistantSpeech()} disabled={!controlsEnabled}>停止 AI</button>
      {' '}<button type="button" onClick={disconnect} disabled={!controlsEnabled}>断开</button>
      <h2>候选人最终转写</h2><p>{candidate || '—'}</p>
      <h2>面试官最终转写</h2><p>{assistant || '—'}</p>
      <h2>最近事件</h2>
      <ol>{events.map((event, index) => <li key={`${event}-${index}`}>{event}</li>)}</ol>
    </main>
  );
}
