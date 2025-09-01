import { z } from 'zod';
import { query } from './db.js';
import { hashPassword, verifyPassword } from './security.js';
import { getUserGroups, getUserAppActions } from './permission.query.js';
import { createOTT, consumeOTT } from './ott.store.js';
import { HttpError } from './errors.js';
import type { Claims } from './types.js';

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

// 1) CheckEmailExists
export async function checkEmailExists(req: any, res: any) {
  const email = z.string().email().parse(req.query.email);
  const existing = await findUserByEmail(email);
  return res.json({ ok: true, exists: !!existing });
}

// 2) Register (self-service)
export async function register(req: any, res: any) {
  const dto = registerSchema.parse(req.body);

  const exists = await findUserByEmail(dto.email);
  if (exists) throw new HttpError(409, 'Email already exists', 'EMAIL_EXISTS');

  const password_hash = await hashPassword(dto.password);

  const sql = `
    INSERT INTO users (email, first_name, last_name, password_hash, created_at, updated_at)
    VALUES ($1, $2, $3, $4, NOW(), NOW())
    RETURNING user_id, email;
  `;
  const { rows } = await query(sql, [dto.email, dto.first_name, dto.last_name, password_hash]);
  const u = rows[0];

  // (אופציונלי) שיוך לקבוצות ברירת מחדל כאן

  return res.status(201).json({ ok: true, user_id: u.user_id, email: u.email });
}

// 3) CreateUser (by admin)
export async function createUser(req: any, res: any) {
  const dto = createUserSchema.parse(req.body);

  // TODO: לאכוף הרשאות מנהל (מנגנון נפרד—Session פנימי/Proxy וכו')

  const exists = await findUserByEmail(dto.email);
  if (exists) throw new HttpError(409, 'Email already exists', 'EMAIL_EXISTS');

  const password_hash = await hashPassword(dto.password);

  const sql = `
    INSERT INTO users (email, first_name, last_name, password_hash, created_at, updated_at)
    VALUES ($1, $2, $3, $4, NOW(), NOW())
    RETURNING user_id, email;
  `;
  const { rows } = await query(sql, [dto.email, dto.first_name, dto.last_name, password_hash]);
  const u = rows[0];

  return res.status(201).json({ ok: true, user_id: u.user_id, email: u.email });
}

// 4) Login (email+password) → OTT + redirectUrl (ללא JWT)
export async function login(req: any, res: any) {
  const dto = loginSchema.parse(req.body);
  const user = await findUserByEmail(dto.email);
  if (!user) throw new HttpError(401, 'Invalid credentials', 'AUTH_FAILED');

  const ok = await verifyPassword(dto.password, user.password_hash);
  if (!ok) throw new HttpError(401, 'Invalid credentials', 'AUTH_FAILED');

  const groups = (await getUserGroups(user.user_id)).map(g => g.group_name);
  const apps = await getUserAppActions(user.user_id);

  const claims = buildClaims(user.user_id, user.email, groups, apps);

  // OTT למעבר לאפליקציה (למשל budgetApp)
  const { token, expiresInSec } = createOTT({ email: user.email, sub: user.user_id, claims });

  // הכתובת הבאה יכולה להגיע מהקליינט או ממיפוי בצד השרת לפי האפליקציה
  const nextUrlBase = req.body.nextUrlBase ?? 'http://localhost:5173/login';
  const nextUrl = `${nextUrlBase}?ott=${token}`;

  return res.json({ ok: true, ott: token, expiresInSec, nextUrl });
}

// 5) Exchange OTT → מחזיר claims בלבד (ללא JWT)
export async function exchangeOtt(req: any, res: any) {
  const token = z.string().min(10).parse(req.body.ott);
  const ctx = consumeOTT(token);
  if (!ctx) throw new HttpError(400, 'Invalid or expired OTT', 'OTT_EXPIRED');

  const { claims } = ctx as { claims: Claims };
  return res.json({ ok: true, claims });
}

// 6) Google – יישום בהמשך, גם שם לא יונפק JWT ע"י AuthService
export async function googleStart(_req: any, res: any) {
  return res.status(501).json({ ok: false, error: 'NOT_IMPLEMENTED' });
}

export async function googleCallback(_req: any, res: any) {
  return res.status(501).json({ ok: false, error: 'NOT_IMPLEMENTED' });
}
