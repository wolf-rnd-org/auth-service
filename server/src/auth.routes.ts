import { Router } from 'express';
import {
  checkEmailExists,
  register,
  createUser,
  login,
  exchangeOtt,
  googleStart,
  googleCallback,
} from './auth.controller.js';

const r = Router();

// בסיס – אימייל וסיסמה
r.get('/check-email', checkEmailExists);
r.post('/register', register);
r.post('/login', login);
r.post('/ott/exchange', exchangeOtt);

// ניהול (דורש הרשאות – להוסיף middleware בהמשך)
r.post('/admin/create-user', createUser);

// Google OAuth (בהמשך)
r.post('/google/start', googleStart);
r.get('/google/callback', googleCallback);

export default r;
