import { z } from 'zod';
import { query } from './utils/db.js';
import { hashPassword, verifyPassword } from './security.js';
import { getUserGroups, getUserAppActions } from './permission.query.js';
import { createOTT } from './ott.store.js';
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

const createUserSchema = registerSchema;

// ---------- Helpers ----------
type DbUser = {
  user_id: number;
  email: string;
  first_name: string;
  last_name: string;
  password_hash: string;
};

async function findUserByEmail(email: string): Promise<DbUser | undefined> {
  const sql = `SELECT user_id, email, first_name, last_name, password_hash
               FROM users WHERE email = $1`;
               
  const { rows } = await query<DbUser>(sql, [email]);
  return rows[0];
}

function buildClaims(
  userId: number,
  email: string,
  groups: string[],
  apps: { application_name: string; actions: string[] }[],
): Claims {
  const features = Object.fromEntries(apps.map(a => [a.application_name, a.actions]));
  return { sub: userId, email, groups, features };
}

// ---------- Controllers ----------

// GET /check-email?email=...
export async function checkEmailExists(req: any, res: any) {
  try {
    const email = z.string().email().parse(req.query.email);
    const existing = await findUserByEmail(email);
    return res.json({ ok: true, exists: !!existing, source: existing ? 'db' : null });
  } catch (e: any) {
    const message = e?.message ?? 'Invalid request';
    return res.status(400).json({ ok: false, code: 'BAD_REQUEST', message });
  }
}

// POST /register
export async function createUser(req: any, res: any) {
  try {
    const dto = createUserSchema.parse(req.body);

    // 0) אימייל ייחודי בטבלת users
    const exists = await findUserByEmail(dto.email);
    if (exists) throw new HttpError(409, 'Email already exists', 'EMAIL_EXISTS');

    // 1) האש מקומי (bcrypt)
    const password_hash = await hashPassword(dto.password);

    // 2) הכנסת רשומה לטבלת users
    const sql = `
      INSERT INTO users (email, first_name, last_name, password_hash, created_at, updated_at)
      VALUES ($1, $2, $3, $4, NOW(), NOW())
      RETURNING user_id, email
    `;
    const { rows } = await query(sql, [dto.email, dto.first_name, dto.last_name, password_hash]);
    const u = rows[0];

    return res.status(201).json({ ok: true, user_id: u.user_id, email: u.email });
  } catch (e: any) {
    if (e instanceof HttpError) {
      return res.status(e.status).json({ ok: false, code: e.code, message: e.message });
    }
    const isBadRequest = e?.name === 'ZodError';
    const status = isBadRequest ? 400 : 500;
    const code = isBadRequest ? 'BAD_REQUEST' : 'INTERNAL_ERROR';
    const message = isBadRequest ? 'Invalid request payload' : (e?.message ?? 'Unexpected error');
    return res.status(status).json({ ok: false, code, message });
  }
}

// POST /login
export async function login(req: any, res: any) {
  try {
    const dto = loginSchema.parse(req.body);

    const user = await findUserByEmail(dto.email);
    if (!user) throw new HttpError(401, 'Invalid credentials', 'AUTH_FAILED');

    const ok = await verifyPassword(dto.password, user.password_hash);
    if (!ok) throw new HttpError(401, 'Invalid credentials', 'AUTH_FAILED');

    const groups = (await getUserGroups(user.user_id)).map((g: any) => g.group_name);
    const apps = await getUserAppActions(user.user_id);

    const claims = buildClaims(user.user_id, user.email, groups, apps);
    const { token, expiresInSec } = createOTT({ email: user.email, sub: user.user_id, claims });

    const nextUrlBase = req.body.nextUrlBase ?? 'http://localhost:5173/login';
    const nextUrl = `${nextUrlBase}?ott=${token}`;

    return res.json({ ok: true, ott: token, expiresInSec, nextUrl });
  } catch (e: any) {
    if (e instanceof HttpError) {
      return res.status(e.status).json({ ok: false, code: e.code, message: e.message });
    }
    const isBadRequest = e?.name === 'ZodError';
    const status = isBadRequest ? 400 : 500;
    const code = isBadRequest ? 'BAD_REQUEST' : 'INTERNAL_ERROR';
    const message = isBadRequest ? 'Invalid request payload' : (e?.message ?? 'Unexpected error');
    return res.status(status).json({ ok: false, code, message });
  }
}
