export function spikeControlsEnabled(isConnected: boolean) {
  return isConnected;
}

export async function closeSpikeConnection(connection: { close(): Promise<void> } | null) {
  await connection?.close();
}
