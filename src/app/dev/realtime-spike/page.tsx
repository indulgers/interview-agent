import { notFound } from 'next/navigation';

import { RealtimeSpike } from './realtime-spike';

export default function RealtimeSpikePage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <RealtimeSpike />;
}
