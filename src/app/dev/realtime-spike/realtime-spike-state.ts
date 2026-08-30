import type { VoiceEvent } from '../../../modules/realtime-voice/port';

export function spikeControlsEnabled(isConnected: boolean) {
  return isConnected;
}

export async function closeSpikeConnection(connection: { close(): Promise<void> } | null) {
  await connection?.close();
}

export function spikeConnectionState(isConnected: boolean, event: VoiceEvent) {
  return event.type === 'connection' ? event.state === 'connected' : isConnected;
}

export async function runSpikeAction(action: () => Promise<void>, onFailure: () => void) {
  try { await action(); } catch { onFailure(); }
}
