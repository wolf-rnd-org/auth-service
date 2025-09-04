// index.ts
import 'dotenv/config';
import express from 'express';
import authRoutes from './auth.routes';
import { errorMiddleware } from './errors';


const app = express();
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => res.json({ ok: "success" }));

app.use('/auth', authRoutes);

// error handler בסוף
app.use(errorMiddleware);

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => {
  console.log(`AuthService listening on http://localhost:${port}`);
});
