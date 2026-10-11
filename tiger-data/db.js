import pg from 'pg';
export function makePool() {
  if (!process.env.TIGER_DATABASE_URL) throw new Error('TIGER_DATABASE_URL is missing');
  return new pg.Pool({connectionString: process.env.TIGER_DATABASE_URL, max: 4, connectionTimeoutMillis: 15000, idleTimeoutMillis: 30000});
}
