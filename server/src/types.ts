export type UserRow = {
  user_id: number;
  email: string;
  first_name: string | null;
  last_name: string | null;
  password_hash: string;
  created_at: string | Date;
  updated_at: string | Date;
};

export type Group = { group_id: number; group_name: string };

export type AppActions = {
  application_id: number;
  application_name: string;
  actions: string[];
};

export type Claims = {
  sub: number;
  email: string;
  groups: string[];
  features: Record<string, string[]>; // { [application_name]: [action_name,...] }
  iat?: number;
  exp?: number;
};
