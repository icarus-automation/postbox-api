import type { NextFunction, Request, Response } from 'express';

const PUBLIC_PREFIX = '/api/v1/public/';

// Any site may call /public with its integration key. x-api-key is left off the
// list on purpose: a browser must never be able to send an admin key.
export function publicApiCors(req: Request, res: Response, next: NextFunction): void {
  const path = req.originalUrl.split('?')[0] ?? '';
  if (!path.startsWith(PUBLIC_PREFIX)) {
    next();
    return;
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'x-integration-key, Content-Type');
    res.status(204).end();
    return;
  }

  next();
}
