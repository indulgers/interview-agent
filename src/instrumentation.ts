export async function register() {
  if (process.env.NEXT_RUNTIME === 'edge') return;
  const { getServerInterviewHistory } = await import('./modules/interview-history/server-history');
  await getServerInterviewHistory().recoverAbandoned();
}
