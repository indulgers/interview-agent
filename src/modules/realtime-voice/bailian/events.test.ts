import { describe, expect, it } from 'vitest';

import { parseBailianEvent } from './events';

describe('parseBailianEvent', () => {
  const now = 1_728_000_000_000;

  it('maps the official session-created sample to an internal connection event', () => {
    expect(parseBailianEvent({ type: 'session.created', session: { object: 'realtime.session', model: 'qwen3.5-omni-flash-realtime' } }, now)).toEqual([
      { type: 'connection', state: 'connected', at: now },
    ]);
  });

  it('maps official VAD and response lifecycle samples to timestamped voice events', () => {
    expect(parseBailianEvent({ type: 'input_audio_buffer.speech_started', item_id: 'item-user', audio_start_ms: 3647 }, now)).toEqual([
      { type: 'candidate_speech', state: 'started', at: now },
      { type: 'transcript', state: 'pending', speaker: 'candidate', providerTurnId: 'item-user', at: now },
    ]);
    expect(parseBailianEvent({ type: 'input_audio_buffer.speech_stopped', item_id: 'item-user', audio_end_ms: 4453 }, now)).toEqual([
      { type: 'candidate_speech', state: 'stopped', at: now },
    ]);
    expect(parseBailianEvent({ type: 'response.created', response: { id: 'resp-1', status: 'in_progress' } }, now)).toEqual([
      { type: 'response', state: 'started', at: now },
      { type: 'assistant_speech', state: 'started', at: now },
    ]);
    expect(parseBailianEvent({ type: 'response.done', response: { id: 'resp-1', status: 'completed' } }, now)).toEqual([
      { type: 'assistant_speech', state: 'stopped', at: now },
      { type: 'response', state: 'completed', at: now },
    ]);
  });

  it('maps official final input and assistant transcript samples with their stable item IDs', () => {
    expect(parseBailianEvent({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'item-user', content_index: 0, transcript: '我会先说明方案。' }, now)).toEqual([
      { type: 'final_turn', providerTurnId: 'item-user', speaker: 'candidate', text: '我会先说明方案。', startedAt: now, endedAt: now },
    ]);
    expect(parseBailianEvent({ type: 'response.audio_transcript.done', response_id: 'resp-1', item_id: 'item-assistant', output_index: 0, content_index: 0, transcript: '请继续。' }, now)).toEqual([
      { type: 'final_turn', providerTurnId: 'item-assistant', speaker: 'assistant', text: '请继续。', startedAt: now, endedAt: now },
    ]);
  });

  it('maps the official assistant output-item sample to a pending stable turn ID', () => {
    expect(parseBailianEvent({ type: 'response.output_item.added', response_id: 'resp-1', output_index: 0, item: { id: 'item-assistant', type: 'message', status: 'in_progress', role: 'assistant' } }, now)).toEqual([
      { type: 'transcript', state: 'pending', speaker: 'assistant', providerTurnId: 'item-assistant', at: now },
    ]);
  });

  it('maps official error payloads without forwarding their provider message', () => {
    expect(parseBailianEvent({ type: 'error', error: { type: 'invalid_request_error', code: 'invalid_value', message: 'private provider detail', param: 'session.modalities' } }, now)).toEqual([
      { type: 'error', category: 'configuration', message: '实时语音配置不可用。', at: now },
    ]);
  });

  it('keeps unknown or malformed provider payloads diagnostic-only', () => {
    expect(parseBailianEvent({ type: 'new.provider.event', secret: 'must-not-reach-ui' }, now)).toEqual([]);
    expect(parseBailianEvent({ type: 'response.audio_transcript.done', response_id: 'resp-1' }, now)).toEqual([]);
  });
});
