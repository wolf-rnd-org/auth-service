import dns from 'node:dns';
dns.setDefaultResultOrder('ipv4first');
import { z } from 'zod';
import { supabase } from '../utils/supabase.js';
import { RegisterSchema, LoginSchema, ChangePasswordSchema } from '../schemas/auth.schemas.js';
import type { MeResponse } from '../dto/auth.dto.js';
// Note: hashing removed per request; passwords stored in plaintext (not recommended)
import { HttpError } from '../errors.js';
import { signJwtHS256, verifyJwtHS256 } from '../utils/jwt.js';

export async function getUsers(req: any, res: any, _next: any) {
  try {
    // Pagination: page (1-based), page_size (max 100)
    const PageSchema = z.object({
      page: z.coerce.number().int().min(1).default(1),
      page_size: z.coerce.number().int().min(1).max(100).default(20),
    });
    const { page, page_size } = PageSchema.parse(req.query ?? {});
    const from = (page - 1) * page_size;
    const to = from + page_size - 1;

    // Try to include role column if it exists; fallback if not
    let data: any[] | null = null;
    let count: number | null = null;
    {
      const res1 = await supabase
        .from('users')
        .select('user_id, email, first_name, last_name, role_label, password', { count: 'exact' })
        .range(from, to);
      if (!res1.error) {
        data = res1.data ?? [];
        count = res1.count ?? 0;
      } else {
        // Fallback without role (column may not exist)
        const res2 = await supabase
          .from('users')
          .select('user_id, email, first_name, last_name, password', { count: 'exact' })
          .range(from, to);
        if (res2.error) throw res2.error;
        data = (res2.data ?? []).map((u: any) => ({ ...u, role_label: null }));
        count = res2.count ?? 0;
      }
    }

    // Expose pagination via headers while keeping array body shape for compatibility
    res.setHeader('X-Total-Count', String(count ?? 0));
    res.setHeader('X-Page', String(page));
    res.setHeader('X-Page-Size', String(page_size));
    res.setHeader('Access-Control-Expose-Headers', 'X-Total-Count, X-Page, X-Page-Size');

    return res.json(data ?? []);
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: 'INTERNAL', message: err?.message ?? 'Unexpected error' });
  }
}

export async function getUserClaims(userId: number, applicationName: string): Promise<MeResponse> {
  const { data: userRow, error: userErr } = await supabase
    .from('users')
    .select('user_id, email, first_name, last_name')
    .eq('user_id', userId)
    .single();

  if (userErr || !userRow) throw userErr ?? new Error('User not found');

  const { data: actionRows, error: rpcErr } = await supabase.rpc('get_user_claims', {
    p_user_id: userId,
    p_application_name: applicationName,
  });
  if (rpcErr) throw rpcErr;

  const actions: string[] = (actionRows ?? []).map((r: any) => r.action_name);

  return {
    userId: userRow.user_id,
    email: userRow.email,
    firstName: userRow.first_name,
    lastName: userRow.last_name,
    actions,
  };
}

export async function me(req: any, res: any, _next: any) {
  try {
    // Parse only application_name from query (default to BUDGETS)
    const OnlyApp = z.object({ application_name: z.string().default('BUDGETS') });
    const { application_name } = OnlyApp.parse(req.query ?? {});

    // Extract token from cookies (auth_token) or Authorization header
    let token: string | undefined;
    const cookieHeader: string | undefined = req.headers?.cookie;
    if (cookieHeader) {
      const parts = cookieHeader.split(';').map((p: string) => p.trim());
      for (const p of parts) {
        const idx = p.indexOf('=');
        if (idx > 0) {
          const name = p.slice(0, idx);
          const val = p.slice(idx + 1);
          if (name === 'auth_token') {
            token = decodeURIComponent(val);
            break;
          }
        }
      }
    }
    if (!token && typeof req.headers?.authorization === 'string') {
      const m = /^Bearer\s+(.+)$/i.exec(req.headers.authorization);
      if (m) token = m[1];
    }

    if (!token) {
      return res.status(401).json({ ok: false, error: 'UNAUTHORIZED', message: 'Missing auth token' });
    }

    let userId: number;
    try {
      const payload = verifyJwtHS256<{ userId: number }>(token);
      userId = Number(payload.userId);
      if (!Number.isFinite(userId)) throw new Error('Bad userId');
    } catch {
      return res.status(401).json({ ok: false, error: 'UNAUTHORIZED', message: 'Invalid auth token' });
    }

    const me = await getUserClaims(userId, application_name);
    return res.json(me);
  } catch (e) {
    return res.status(500).json(e);
  }
}

export async function register(req: any, res: any, _next: any) {
  try {
    const dto = RegisterSchema.parse(req.body);
    const { first_name, last_name, email, password, role_label, application_name } = dto;

    // Check email existence via Supabase
    const { data: existing, error: existsErr } = await supabase
      .from('users')
      .select('user_id')
      .eq('email', email)
      .maybeSingle();
    if (existsErr) throw existsErr;
    if (existing?.user_id) {
      throw new HttpError(409, 'Email already registered', 'EMAIL_EXISTS');
    }

    // Map role to actions to grant (direct permissions)
    const actionsByRole: Record<string, string[]> = {
      admin: ['expenses.view', 'reports.view', 'users.create', 'expenses.admin.view'],
      regular_user: ['expenses.create', 'expenses.view', 'program_budgets.view', 'assistants.create'],
      accountant: ['expenses.admin.view'],
      global_user: ['expenses.admin.view'],
      assistant: [],
    };
    const actions = actionsByRole[role_label] ?? [];

    // Resolve application and actions BEFORE creating user to fail fast on config issues
    let applicationId: number | null = null;
    let actionRows: { action_id: number; action_name: string }[] = [];
    if (actions.length > 0) {
      const { data: app, error: appErr } = await supabase
        .from('applications')
        .select('application_id')
        .eq('application_name', application_name)
        .maybeSingle();
      if (appErr) throw appErr;
      if (!app) throw new HttpError(400, 'Unknown application', 'APP_NOT_FOUND');
      applicationId = app.application_id;

      const { data: act, error: actErr } = await supabase
        .from('actions')
        .select('action_id, action_name')
        .in('action_name', actions);
      if (actErr) throw actErr;
      actionRows = act ?? [];

      const foundNames = new Set(actionRows.map((r) => r.action_name));
      const missing = actions.filter((a) => !foundNames.has(a));
      if (missing.length > 0) {
        throw new HttpError(400, `Unknown actions: ${missing.join(', ')}`, 'ACTIONS_NOT_FOUND');
      }
    }

    // Create user (store password as plaintext)
    const { data: newUser, error: insErr } = await supabase
      .from('users')
      .insert({ email, first_name, last_name, password , role_label})
      .select('user_id')
      .single();
    if (insErr) throw insErr;
    const userId = newUser.user_id as number;

    // Insert permissions if needed
    if (actions.length > 0 && applicationId !== null) {
      const actionIds = actionRows.map((a) => a.action_id);
      // Find existing permissions to avoid conflicts
      const { data: existingPerms, error: selPermErr } = await supabase
        .from('permissions')
        .select('action_id')
        .eq('user_id', userId)
        .eq('application_id', applicationId!)
        .in('action_id', actionIds);
      if (selPermErr) {
        // Best-effort rollback of user to avoid orphaned account when perms fail
        await supabase.from('users').delete().eq('user_id', userId);
        throw selPermErr;
      }
      const existingIds = new Set((existingPerms ?? []).map((p) => p.action_id));
      const rows = actionRows
        .filter((a) => !existingIds.has(a.action_id))
        .map((a) => ({ user_id: userId, application_id: applicationId!, action_id: a.action_id }));

      if (rows.length > 0) {
        const { error: insPermErr } = await supabase.from('permissions').insert(rows).select('*');
        if (insPermErr) {
          // Best-effort rollback of user to avoid orphaned account when perms fail
          await supabase.from('users').delete().eq('user_id', userId);
          throw insPermErr;
        }
      }
    }

    return res.json({ user_id: userId });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ ok: false, error: 'BAD_INPUT', message: err.message });
    }
    if (err instanceof HttpError) {
      return res.status(err.status).json({ ok: false, error: err.code ?? 'ERR', message: err.message });
    }
    return res.status(500).json({ ok: false, error: 'INTERNAL', message: err?.message ?? 'Unexpected error' });
  }
}

export async function login(req: any, res: any, _next: any) {
  try {
    const { email, password } = LoginSchema.parse(req.body);

    // Fetch user by email including password
    const { data: user, error: userErr } = await supabase
      .from('users')
      .select('user_id, email, first_name, last_name, password')
      .eq('email', email)
      .maybeSingle();
    if (userErr) throw userErr;
    if (!user) {
      return res.status(401).json({ ok: false, error: 'UNAUTHORIZED', message: 'Invalid credentials' });
    }

    // Verify password (plaintext comparison)
    const ok = password === user.password;
    if (!ok) {
      return res.status(401).json({ ok: false, error: 'UNAUTHORIZED', message: 'Invalid credentials' });
    }

    // Create JWT with userId in payload
    const token = signJwtHS256({ userId: user.user_id });

    // Set httpOnly cookie
    const isProd = (process.env.NODE_ENV ?? 'development') === 'production';
    const crossSite = process.env.CROSS_SITE_COOKIES === 'true';
    res.cookie('auth_token', token, {
      httpOnly: true,
      secure: crossSite ? true : isProd,
      sameSite: crossSite ? 'none' : 'lax',
      path: '/',
    });

    return res.json({
      userId: user.user_id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
    });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ ok: false, error: 'BAD_INPUT', message: err.message });
    }
    return res.status(500).json({ ok: false, error: 'INTERNAL', message: err?.message ?? 'Unexpected error' });
  }
}

export async function logout(_req: any, res: any, _next: any) {
  const isProd = (process.env.NODE_ENV ?? 'development') === 'production';
  const crossSite = process.env.CROSS_SITE_COOKIES === 'true';
  res.clearCookie('auth_token', {
    httpOnly: true,
    secure: crossSite ? true : isProd,
    sameSite: crossSite ? 'none' : 'lax',
    path: '/',
  });
  return res.json({ ok: true });
}

export async function changePassword(req: any, res: any, _next: any) {
  try {
    const { email, current_password, new_password } = ChangePasswordSchema.parse(req.body);

    // Fetch user with password
    const { data: user, error: userErr } = await supabase
      .from('users')
      .select('user_id, password')
      .eq('email', email)
      .maybeSingle();
    if (userErr) throw userErr;
    if (!user) {
      return res.status(401).json({ ok: false, error: 'UNAUTHORIZED', message: 'Invalid credentials' });
    }

    // Verify current password (plaintext comparison)
    const ok = current_password === user.password;
    if (!ok) {
      return res.status(401).json({ ok: false, error: 'UNAUTHORIZED', message: 'Invalid credentials' });
    }

    // Update new password as plaintext
    const passwordHashed2 = new_password;
    const { error: updErr } = await supabase
      .from('users')
      .update({ password: passwordHashed2 })
      .eq('user_id', user.user_id);
    if (updErr) throw updErr;

    return res.json({ ok: true });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ ok: false, error: 'BAD_INPUT', message: err.message });
    }
    return res.status(500).json({ ok: false, error: 'INTERNAL', message: err?.message ?? 'Unexpected error' });
  }
}
