import { Router } from 'express';
import {
  // checkEmailExists,
  // createUser,
  // login,
  me,
  register,
  login,
  logout,
  changePassword,
  getUsers,
  // exchangeOtt,
  // googleStart,
  // googleCallback,
} from '../services/auth.service.js';

const r = Router();

// בסיס – אימייל וסיסמה
r.get('/me', me);
// r.get('/check-email', checkEmailExists);
r.post('/register', register);
r.post('/login', login);
r.post('/logout', logout);
r.post('/change-password', changePassword);
r.get('/users', getUsers);
// r.post('/admin/create-user', createUser);

// Google OAuth (בהמשך)
// r.post('/google/start', googleStart);
// r.get('/google/callback', googleCallback);

export default r;
