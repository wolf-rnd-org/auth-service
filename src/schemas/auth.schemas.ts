import { z } from 'zod';

export const RegisterSchema = z.object({
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(['accountant', 'regular_user', 'global_user', 'assistant', 'admin']),
  application_name: z.string().default('BUDGETS'),
});

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const ChangePasswordSchema = z.object({
  email: z.string().email(),
  current_password: z.string().min(1),
  new_password: z.string().min(6),
});

export const MeQuerySchema = z.object({
  application_name: z.string().default('BUDGETS'),
  user_id: z.string(),
});



export const QuerySchema = z.object({
  application_name: z.string().default("BUDGETS"),
  user_id:  z.string(), // לזמן קצר, עד שנוסיף אימות
});
