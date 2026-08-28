import fs from 'node:fs';
import path from 'node:path';

import BetterSqlite3 from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

import { schema } from './schema';

export type AppDatabase = ReturnType<typeof drizzle<typeof schema>>;

export interface DatabaseHandle {
  sqlite: BetterSqlite3.Database;
  db: AppDatabase;
}

function sqliteFilename(databaseUrl: string): string {
  if (!databaseUrl.startsWith('file:')) return databaseUrl;
  const value = databaseUrl.slice('file:'.length);
  if (value === ':memory:' || value === '') return ':memory:';
  return decodeURIComponent(value);
}

/** Open SQLite with foreign key enforcement enabled for this connection. */
export function createDatabase(databaseUrl = process.env.DATABASE_URL ?? 'file:./data/interview-agent.db'): DatabaseHandle {
  const filename = sqliteFilename(databaseUrl);
  if (filename !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(filename)), { recursive: true });
  const sqlite = new BetterSqlite3(filename);
  sqlite.pragma('foreign_keys = ON');
  return { sqlite, db: drizzle(sqlite, { schema }) };
}

export function closeDatabase(handle: DatabaseHandle): void {
  handle.sqlite.close();
}

export function migrateDatabase(handle: DatabaseHandle, migrationsFolder = path.resolve(process.cwd(), 'drizzle')): void {
  migrate(handle.db, { migrationsFolder });
}
