import type { NextFunction, Request, Response } from 'express';
import { mock, mockReset } from 'jest-mock-extended';

import { publicApiCors } from './public-api-cors';

function requestFor(method: string, originalUrl: string): Request {
  return { method, originalUrl } as Request;
}

describe('publicApiCors', () => {
  const res = mock<Response>();
  const next = jest.fn<void, []>() as unknown as NextFunction;

  beforeEach(() => {
    mockReset(res);
    res.status.mockReturnValue(res);
    (next as unknown as jest.Mock).mockReset();
  });

  it('answers a preflight on a public route and names the integration key header', () => {
    publicApiCors(requestFor('OPTIONS', '/api/v1/public/acme/leads'), res, next);

    expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Origin', '*');
    expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    expect(res.setHeader).toHaveBeenCalledWith(
      'Access-Control-Allow-Headers',
      'x-integration-key, Content-Type',
    );
    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.end).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('never allows a browser to send an admin API key', () => {
    publicApiCors(requestFor('OPTIONS', '/api/v1/public/acme/blog/posts'), res, next);

    const allowed = res.setHeader.mock.calls.find(
      ([name]) => name === 'Access-Control-Allow-Headers',
    )?.[1];
    expect(String(allowed)).not.toMatch(/x-api-key/i);
    expect(String(allowed)).not.toMatch(/x-public-key/i);
  });

  it('lets any origin read the answer to a public call, then carries on', () => {
    publicApiCors(requestFor('GET', '/api/v1/public/acme/blog/posts?tag=news'), res, next);

    expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Origin', '*');
    expect(res.status).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('leaves every other route to the cookie CORS rules', () => {
    publicApiCors(requestFor('OPTIONS', '/api/v1/leads'), res, next);
    publicApiCors(requestFor('POST', '/api/v1/leads'), res, next);
    publicApiCors(requestFor('GET', '/api/v1/publicity'), res, next);

    expect(res.setHeader).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(3);
  });
});
