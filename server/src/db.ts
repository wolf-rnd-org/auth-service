import 'dotenv/config';
import { Pool } from 'pg';


function sslConfig() {
  if (process.env.DB_SSL === 'true' || /sslmode=require/i.test(process.env.DATABASE_URL || '')) {
    return { rejectUnauthorized: false } as const;
  }
  return undefined;
}

import type { QueryResultRow } from 'pg';
const pool = new Pool({
  connectionString: process.env.DATABASE_URL, // אם יש
  ssl: sslConfig(), // <--- פה נכנס התנאי

});

export async function query<T extends QueryResultRow = any>(text: string, params?: any[]) {
  const start = Date.now();
  const res = await pool.query<T>(text, params);
  const dur = Date.now() - start;
  if (dur > 200) {
    console.log(`slow query ${dur}ms: ${text} ${JSON.stringify(params)}`);
  }
  return res;
}
