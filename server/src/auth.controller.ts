import { z } from 'zod';
import { query } from './db.js';
import { hashPassword, verifyPassword } from './security.js';
import { getUserGroups, getUserAppActions } from './permission.query.js';
import { createOTT, consumeOTT } from './ott.store.js';
import { HttpError } from './errors.js';
import type { Claims } from './types.js';
import { supabase } from "../utils/supabase.js";
import { createSupabaseAuthUser, deleteSupabaseAuthUser } from './services/auth.supabase.js';
import { de } from 'zod/locales';

// ---------- Validators ----------
const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  first_name: z.string().min(1),
  last_name: z.string().min(1),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const createUserSchema = registerSchema; // כרגע זהה

// ---------- Helpers ----------
async function findUserByEmail(email: string) {
  const sql = `SELECT * FROM users WHERE email = $1`;
  const { rows } = await query(sql, [email]);
  return rows[0] as any | undefined;
}

function buildClaims(userId: number, email: string, groups: string[], apps: { application_name: string, actions: string[] }[]): Claims {
  const features = Object.fromEntries(apps.map(a => [a.application_name, a.actions]));
  return { sub: userId, email, groups, features };
}

// ---------- Controllers ----------
async function emailExistsInSupabaseAuth(email: string): Promise<boolean> {
  // שימוש ב-admin.listUsers כי אין חיפוש ישיר לפי אימייל בגרסאות מסוימות
  const { data, error } = await supabase.auth.admin.listUsers();
  if (error) throw error;
  const target = email.toLowerCase();
  return data.users.some(u => (u.email ?? "").toLowerCase() === target);
}

// 1) CheckEmailExists
export async function checkEmailExists(req: any, res: any) {
  try {
    console.log(req.query, "sdfjlkdjflkds");
    
    const email = z.string().email().parse(req.query.email);
console.log(email, "email");

    // בדיקה בטבלה המקומית
    const existing = await findUserByEmail(email);
    if (existing) {
      return res.json({ ok: true, exists: true, source: "db" });
    }

    // אופציונלי: בדיקה גם ב-Supabase Auth (השאירי אם חשוב למנוע כפילויות חוצות-מערכות)
    let existsInAuth = false;
    try {
      existsInAuth = await emailExistsInSupabaseAuth(email);
    } catch {
      // אם לא קריטי לבדוק ב-Auth, ניתן להתעלם משגיאה כאן
    }

    return res.json({ ok: true, exists: existsInAuth, source: existsInAuth ? "auth" : null });
  } catch (e: any) {
    const message = e?.message ?? "Invalid request";
    return res.status(400).json({ ok: false, code: "BAD_REQUEST", message });
  }
}



export async function createUser(req: any, res: any) {
  const dto = createUserSchema.parse(req.body);

  // 0) בדיקה בטבלת users כמו היום
  const exists = await findUserByEmail(dto.email);
  if (exists) throw new HttpError(409, "Email already exists", "EMAIL_EXISTS");

  // 1) יצירת משתמש ב-Supabase Auth (שומר את הסיסמה ב-Auth)
  let supaUid: string | null = null;
  try {
    const supaUser = await createSupabaseAuthUser(dto.email, dto.password, {
      first_name: dto.first_name,
      last_name: dto.last_name,
    });
    supaUid = supaUser.id; // לא נשמר בסכמה – רק לשם rollback במקרה כשל ב-DB
  } catch (e: any) {
    const code = e?.code === "EMAIL_EXISTS" ? "EMAIL_EXISTS" : "AUTH_CREATE_FAILED";
    const status = code === "EMAIL_EXISTS" ? 409 : 500;
    return res.status(status).json({ ok: false, code, message: e?.message ?? "Failed to create auth user" });
  }

  // 2) יצירת האש מקומי כדי שה-login הקיים ימשיך לעבוד
  const password_hash = await hashPassword(dto.password);

  // 3) הכנסת רשומה לטבלת users (ללא שינוי סכמה)
  const sql = `
    INSERT INTO users (email, first_name, last_name, password_hash, created_at, updated_at)
    VALUES ($1, $2, $3, $4, NOW(), NOW())
    RETURNING user_id, email;
  `;

  try {
    const { rows } = await query(sql, [dto.email, dto.first_name, dto.last_name, password_hash]);
    const u = rows[0];
    return res.status(201).json({ ok: true, user_id: u.user_id, email: u.email });
  } catch (e: any) {
    // 4) אם הכנסת ה-DB נכשלה – מוחקים את המשתמש מה-Auth (Rollback)
    if (supaUid) {
      try { await deleteSupabaseAuthUser(supaUid); } catch { }
    }
    return res.status(500).json({ ok: false, code: "DB_INSERT_FAILED", message: e?.message ?? "DB insert failed" });
  }
}
export async function login(req: any, res: any) {
  try {
    const dto = loginSchema.parse(req.body);

    const user = await findUserByEmail(dto.email);
    if (!user) throw new HttpError(401, "Invalid credentials", "AUTH_FAILED");

    const ok = await verifyPassword(dto.password, user.password_hash);
    if (!ok) throw new HttpError(401, "Invalid credentials", "AUTH_FAILED");

    // שליפת קבוצות והרשאות
    const groups = (await getUserGroups(user.user_id)).map((g: any) => g.group_name);
    const apps = await getUserAppActions(user.user_id);

    // בניית Claims
    const claims = buildClaims(user.user_id, user.email, groups, apps);

    // יצירת OTT
    const { token, expiresInSec } = createOTT({ email: user.email, sub: user.user_id, claims });

    // nextUrl (ניתן להעביר פרמטר מהקליינט)
    const nextUrlBase = req.body.nextUrlBase ?? "http://localhost:5173/login";
    const nextUrl = `${nextUrlBase}?ott=${token}`;

    return res.json({ ok: true, ott: token, expiresInSec, nextUrl });
  } catch (e: any) {
    if (e instanceof HttpError) {
      return res.status(e.status).json({ ok: false, code: e.code, message: e.message });
    }
    // ולידציה של Zod וכו'
    const isBadRequest = e?.name === "ZodError";
    const status = isBadRequest ? 400 : 500;
    const code = isBadRequest ? "BAD_REQUEST" : "INTERNAL_ERROR";
    const message = isBadRequest ? "Invalid request payload" : (e?.message ?? "Unexpected error");
    return res.status(status).json({ ok: false, code, message });
  }
}

// export async function exchangeOtt(req: any, res: any) {
//   const token = z.string().min(10).parse(req.body.ott);
//   const ctx = consumeOTT(token);
//   if (!ctx) throw new HttpError(400, 'Invalid or expired OTT', 'OTT_EXPIRED');

//   const { claims } = ctx as { claims: Claims };
//   return res.json({ ok: true, claims });
// }

// export async function googleStart(_req: any, res: any) {
//   return res.status(501).json({ ok: false, error: 'NOT_IMPLEMENTED' });
// }

// export async function googleCallback(_req: any, res: any) {
//   return res.status(501).json({ ok: false, error: 'NOT_IMPLEMENTED' });
// }
