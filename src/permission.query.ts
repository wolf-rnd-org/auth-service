import { query } from '../utils/db.js';
import type { AppActions, Group } from './types.js';

// קבוצות של משתמש
export async function getUserGroups(userId: number): Promise<Group[]> {
  const sql = `
    SELECT g.group_id, g.group_name
    FROM users_groups ug
    JOIN groups g ON g.group_id = ug.group_id
    WHERE ug.user_id = $1
    ORDER BY g.group_id;
  `;
  const { rows } = await query<Group>(sql, [userId]);
  return rows;
}

// פעולות מורשות לפי אפליקציה (הרשאות ישירות + קבוצתיות)
export async function getUserAppActions(userId: number): Promise<AppActions[]> {
  const sql = `
    WITH direct_perms AS (
      SELECT p.application_id, a.application_name, ac.action_name
      FROM permissions p
      JOIN actions ac ON ac.action_id = p.action_id
      JOIN applications a ON a.application_id = p.application_id
      WHERE p.user_id = $1
    ),
    group_perms AS (
      SELECT p.application_id, a.application_name, ac.action_name
      FROM users_groups ug
      JOIN permissions p ON p.group_id = ug.group_id
      JOIN actions ac ON ac.action_id = p.action_id
      JOIN applications a ON a.application_id = p.application_id
      WHERE ug.user_id = $1
    ),
    all_perms AS (
      SELECT * FROM direct_perms
      UNION
      SELECT * FROM group_perms
    )
    SELECT application_id, application_name,
           ARRAY_AGG(DISTINCT action_name ORDER BY action_name) AS actions
    FROM all_perms
    GROUP BY application_id, application_name
    ORDER BY application_id;
  `;
  const { rows } = await query<AppActions>(sql, [userId]);
  return rows;
}
