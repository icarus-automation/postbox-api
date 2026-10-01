# Domain migration

Moving off `geoplanph.com` to your own domain. No rebuild, no image change, no database change. It is all runtime config.

## What changes

| Where | Setting | New value |
|---|---|---|
| VPS `.env` | `BETTER_AUTH_URL` | `https://<api-host>` |
| VPS `.env` | `CORS_ALLOWED_ORIGINS` | `https://<frontend-host>` |
| VPS `.env` | `WORKSPACE_URL_PREFIX` | `<frontend-host>/` |
| Caddy `sites/postbox.caddy` | site address | `<api-host>` |
| Cloudflare | A record, DNS only | `<api-host>` to `187.77.156.189` |
| Google OAuth client | origin, redirect URI | `https://<frontend-host>`, `https://<api-host>/api/v1/auth/callback/google` |
| R2 bucket CORS | allowed origin | `https://<frontend-host>` |
| Frontend | API base URL, hosting domain | `https://<api-host>` |
| Agents, n8n, Postman, websites | base URL | `https://<api-host>` |

Unchanged: image, compose, container names, database, API keys, webhook URLs, workspace slugs, R2 bucket and its public URL.

## Impact

- Everyone signs in again. Session cookies are host-only, so the old cookie never reaches the new host.
- Machine callers and every website reading `/api/v1/public/...` fail until their base URL is updated. API keys keep working.
- With no redirects, the old hosts stop answering when step 6 runs.

## Cutover

1. Add the new domain to Cloudflare and switch its nameservers.
2. Add DNS records: `<api-host>` A to `187.77.156.189`, **DNS only**, plus the frontend's record. Wait until `dig <api-host>` returns the VPS IP. Caddy needs it to issue the certificate.
3. Google Cloud, prod OAuth client: add the new origin and redirect URI, and add the new domain under the consent screen's authorized domains. Keep the old entries until step 9.
4. R2: add `https://<frontend-host>` to the bucket CORS rule. Keep the old origin until step 9.
5. VPS `.env`: set the three values above. Keep the old frontend origin in `CORS_ALLOWED_ORIGINS` (comma separated) until step 7 is done. Then:

```bash
cd ~/docker-apps/postbox/prod
nano .env
docker compose up -d --force-recreate
```

6. Caddy: change the host in `~/self-hosted/caddy/sites/postbox.caddy` to `<api-host>`, then:

```bash
docker exec caddy caddy reload --config /etc/caddy/Caddyfile
curl -i https://<api-host>/api/v1/health
```

7. Frontend: set the API base URL to `https://<api-host>` and deploy it on `<frontend-host>`. Then drop the old origin from `CORS_ALLOWED_ORIGINS` and run `docker compose up -d --force-recreate` again.
8. Update the base URL in every agent, n8n flow, Postman collection and website.
9. Test Google login from the new frontend and one API key request against the new host. Then delete the old Google origin and redirect URI, the old R2 CORS origin, and the old DNS records.
10. Replace the hosts in `docs/deployment.md`.

## Media domain

`R2_PUBLIC_BASE_URL` is separate from this move. If the media domain changes too, post media URLs follow the env because they are built per request. `organizations.logo` stores the full URL, so rewrite it:

```sql
UPDATE organizations SET logo = replace(logo, '<old-media-url>', '<new-media-url>');
```
