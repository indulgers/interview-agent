import 'server-only';

import { createDatabase, migrateDatabase } from '../../db/client';
import { readServerEnv } from '../../lib/env';
import { createInterviewHistory } from './history';

const globalHistory = globalThis as typeof globalThis & { __interviewHistory?: ReturnType<typeof createInterviewHistory> };

export function getServerInterviewHistory() {
  if (!globalHistory.__interviewHistory) {
    const handle = createDatabase(readServerEnv().DATABASE_URL);
    migrateDatabase(handle);
    globalHistory.__interviewHistory = createInterviewHistory(handle.db);
  }
  return globalHistory.__interviewHistory;
}
