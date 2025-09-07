// index.ts
import 'dotenv/config';
import express from 'express';
import authRoutes from './routes/auth.routes.js';
import { errorMiddleware } from './errors.js';
import { openApiSpec } from './docs/openapi.js';


const app = express();

// CORS: allow credentials and reflect only allowed origins (supports comma-separated list)
const normalizeOrigin = (value: string): string => {
  try {
    const u = new URL(value);
    // Reconstruct origin without trailing slash or path
    return `${u.protocol}//${u.host}`;
  } catch {
    // Fallback: strip trailing slash
    return value.replace(/\/$/, '');
  }
};

const allowedOriginsRaw = (process.env.CORS_ORIGIN ?? 'http://localhost:5173')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const allowedOrigins = allowedOriginsRaw.map(normalizeOrigin);

app.use((req, res, next) => {
  const requestOrigin = typeof req.headers.origin === 'string' ? normalizeOrigin(req.headers.origin) : '';
  const allow = requestOrigin && allowedOrigins.includes(requestOrigin) ? requestOrigin : allowedOrigins[0];

  // When sending credentials, do not use '*'
  if (allow && allow !== '*') {
    res.header('Access-Control-Allow-Origin', allow);
  }
  res.header('Vary', 'Origin');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => res.json({ ok: "success" }));

app.use('/auth', authRoutes);

// OpenAPI JSON
app.get('/openapi.json', (_req, res) => res.json(openApiSpec));

// Simple Swagger UI via CDN (no extra deps)
app.get('/docs', (_req, res) => {
  const html = `<!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Auth Service Docs</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
    <style>body { margin: 0; } #swagger-ui { height: 100vh; }</style>
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script>
      window.ui = SwaggerUIBundle({
        url: '/openapi.json',
        dom_id: '#swagger-ui',
        presets: [SwaggerUIBundle.presets.apis],
        layout: 'BaseLayout'
      });
    </script>
  </body>
  </html>`;
  res.type('html').send(html);
});

// error handler בסוף
app.use(errorMiddleware);

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => {
  console.log(`AuthService listening on http://localhost:${port}`);
});
