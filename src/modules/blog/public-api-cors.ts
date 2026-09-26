import type { NextFunction, Request, Response } from 'express';

const PUBLIC_PREFIX = '/api/v1/public';

export function publicApiCors(req: Request, res: Response, next: NextFunction): void {
  const path = req.originalUrl.split('?')[0] ?? '';
  if (!path.startsWith(PUBLIC_PREFIX)) {
    next();
    return;
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'x-public-key, Content-Type');
    res.status(204).end();
    return;
  }

  next();
}
