// // src/utils/db.ts
// import { Pool } from 'pg';
// import 'dotenv/config';

// function maskDbUrl(u?: string) {
//   if (!u) return '';
//   try {
//     const url = new URL(u);
//     if (url.password) url.password = '***';
//     return url.toString();
//   } catch { return '<invalid url>'; }
// }

// const { DATABASE_URL, NODE_ENV } = process.env;
// if (!DATABASE_URL) throw new Error('Missing DATABASE_URL');
// const url = new URL(process.env.DATABASE_URL!.trim());

// console.log('[DB] host:', url.hostname, 'port:', url.port);

// const pool = new Pool({
//   connectionString: DATABASE_URL,
//   // Supabase דורש SSL; למנוע בעיות cert בלוקאל:
//   ssl: { rejectUnauthorized: false },
// });

// // לוג על שגיאות לא־מטופלות מה-pool
// pool.on('error', (err) => {
//   console.error('[DB] Pool error', err);
// });

// export async function query<T = any>(text: string, params?: any[]) {
//   try {
//     // ודאי שמדובר במערך
//     const bind = Array.isArray(params) ? params : (params === undefined ? [] : [params]);
//     const res = await pool.query<T>(text, bind);
//     return res;
//   } catch (err: any) {
//     // לוג עשיר שיעזור לראות מה לא בסדר
//     console.error('[DB] Query failed', {
//       text,
//       params,
//       code: err?.code,
//       detail: err?.detail,
//       message: err?.message,
//       where: err?.where,
//       hint: err?.hint,
//       // stack: err?.stack, // אם תרצי
//     });
//     throw err;
//   }
// }

// // בדיקת חיבור בזמן עלייה (אופציונלי מאוד מומלץ)
// export async function dbHealthcheck() {
//   const { rows } = await query('select 1 as ok, current_user, current_database(), now()');
//   console.log('[DB] healthcheck', rows[0]);
// }
