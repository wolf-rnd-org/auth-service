export class HttpError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    if (code !== undefined) {
      this.code = code;
    }
  }
}

export function errorMiddleware(err: any, _req: any, res: any, _next: any) {
  console.error(err);
  if (err instanceof HttpError) {
    return res.status(err.status).json({ ok: false, error: err.code ?? 'ERR', message: err.message });
  }
  return res.status(500).json({ ok: false, error: 'INTERNAL', message: 'Unexpected error' });
}
