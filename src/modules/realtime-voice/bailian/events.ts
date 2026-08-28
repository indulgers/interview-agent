import { z } from 'zod';

import type { VoiceEvent } from '../port';

const eventBase = z.object({ type: z.string() }).passthrough();
const sessionCreated = eventBase.extend({ type: z.literal('session.created'), session: z.object({ object: z.literal('realtime.session'), model: z.string() }).passthrough() });
const timing = z.number().finite().nonnegative();
const speechStarted = eventBase.extend({ type: z.literal('input_audio_buffer.speech_started'), item_id: z.string(), audio_start_ms: timing });
const speechStopped = eventBase.extend({ type: z.literal('input_audio_buffer.speech_stopped'), item_id: z.string(), audio_end_ms: timing });
const inputTranscript = eventBase.extend({ type: z.literal('conversation.item.input_audio_transcription.completed'), item_id: z.string(), content_index: z.number(), transcript: z.string() });
const assistantTranscript = eventBase.extend({ type: z.literal('response.audio_transcript.done'), response_id: z.string(), item_id: z.string(), output_index: z.number(), content_index: z.number(), transcript: z.string(), audio_start_ms: timing.optional(), audio_end_ms: timing.optional() });
const responseCreated = eventBase.extend({ type: z.literal('response.created'), response: z.object({ id: z.string(), status: z.string() }).passthrough() });
const responseDone = eventBase.extend({ type: z.literal('response.done'), response: z.object({ id: z.string(), status: z.string() }).passthrough() });
const outputItemAdded = eventBase.extend({ type: z.literal('response.output_item.added'), response_id: z.string(), output_index: z.number(), item: z.object({ id: z.string(), type: z.string() }).passthrough() });
const providerError = eventBase.extend({ type: z.literal('error'), error: z.object({ type: z.string(), code: z.string(), message: z.string(), param: z.string().optional() }).passthrough() });

export const BailianProviderEvent = z.union([sessionCreated, speechStarted, speechStopped, inputTranscript, assistantTranscript, responseCreated, responseDone, outputItemAdded, providerError]);
export type BailianProviderEvent = z.infer<typeof BailianProviderEvent>;

export interface BailianTiming {
  candidateStarts: Map<string, number>;
  candidateEnds: Map<string, number>;
}

export function createBailianTiming(): BailianTiming {
  return { candidateStarts: new Map(), candidateEnds: new Map() };
}

export function parseBailianEvent(payload: unknown, at: number, eventTiming = createBailianTiming()): VoiceEvent[] {
  const base = eventBase.safeParse(payload);
  if (!base.success) return [];
  const parsed = BailianProviderEvent.safeParse(payload);
  if (!parsed.success) return [];
  const event = parsed.data;
  if (event.type === 'input_audio_buffer.speech_started') eventTiming.candidateStarts.set(event.item_id, event.audio_start_ms);
  if (event.type === 'input_audio_buffer.speech_stopped') eventTiming.candidateEnds.set(event.item_id, event.audio_end_ms);
  switch (event.type) {
    case 'session.created':
      return [{ type: 'connection', state: 'connected', at }];
    case 'input_audio_buffer.speech_started':
      return [{ type: 'candidate_speech', state: 'started', at }, { type: 'transcript', state: 'pending', speaker: 'candidate', providerTurnId: event.item_id, at }];
    case 'input_audio_buffer.speech_stopped':
      return [{ type: 'candidate_speech', state: 'stopped', at }];
    case 'conversation.item.input_audio_transcription.completed': {
      const startedAt = eventTiming.candidateStarts.get(event.item_id) ?? at;
      const endedAt = Math.max(startedAt, eventTiming.candidateEnds.get(event.item_id) ?? at);
      eventTiming.candidateStarts.delete(event.item_id);
      eventTiming.candidateEnds.delete(event.item_id);
      return [{ type: 'final_turn', providerTurnId: event.item_id, speaker: 'candidate', text: event.transcript, startedAt, endedAt }];
    }
    case 'response.created':
      return [{ type: 'response', state: 'started', at }, { type: 'assistant_speech', state: 'started', at }];
    case 'response.output_item.added':
      return event.item.type === 'message' ? [{ type: 'transcript', state: 'pending', speaker: 'ai', providerTurnId: event.item.id, at }] : [];
    case 'response.audio_transcript.done': {
      const startedAt = event.audio_start_ms ?? at;
      return [{ type: 'final_turn', providerTurnId: event.item_id, speaker: 'ai', text: event.transcript, startedAt, endedAt: Math.max(startedAt, event.audio_end_ms ?? at) }];
    }
    case 'response.done':
      return [{ type: 'assistant_speech', state: 'stopped', at }, { type: 'response', state: 'completed', at }];
    case 'error':
      return [{ type: 'error', category: event.error.type === 'invalid_request_error' || event.error.code.includes('api_key') ? 'configuration' : 'ai_unavailable', message: event.error.type === 'invalid_request_error' || event.error.code.includes('api_key') ? '实时语音配置不可用。' : '实时语音服务暂时不可用。', at }];
  }
}
