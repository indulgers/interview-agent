import 'server-only';

import { createDatabase, migrateDatabase } from '../../db/client';
import { readServerEnv } from '../../lib/env';
import { createInterviewHistory } from './history';

const globalHistory = globalThis as typeof globalThis & { __interviewHistory?: Promise<ReturnType<typeof createInterviewHistory>> };

export async function createServerInterviewHistory(databaseUrl: string) {
  const handle = createDatabase(databaseUrl);
  migrateDatabase(handle);
  const history = createInterviewHistory(handle.db);
  await history.recoverAbandoned();
  return history;
}

export function getServerInterviewHistory() {
  globalHistory.__interviewHistory ??= createServerInterviewHistory(readServerEnv().DATABASE_URL);
  return globalHistory.__interviewHistory;
}
