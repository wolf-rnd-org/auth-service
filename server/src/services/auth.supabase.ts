// src/services/auth.supabase.ts
import { supabase } from "../../utils/supabase.js";

export async function createSupabaseAuthUser(
  email: string,
  password: string,
  metadata?: Record<string, any>
) {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // אם לא רוצים אישור מייל אוטומטי - העבירי ל false
    user_metadata: metadata ?? {},
  });

  if (error || !data?.user) {
    // מיפוי שגיאות שימושי
    const code = (error as any)?.status === 422 ? "EMAIL_EXISTS" : "AUTH_CREATE_FAILED";
    const message = error?.message ?? "Failed to create auth user";
    const err = new Error(message) as any;
    err.code = code;
    throw err;
  }

  return data.user; // כולל user.id (UUID), email וכו'
}


export async function deleteSupabaseAuthUser(uid: string) {
  await supabase.auth.admin.deleteUser(uid);
}
