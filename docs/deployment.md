# Deployment: postbox-api.geoplanph.com

## 1. Push and let CI publish to GHCR

Push the release to `main`. GitHub Actions publishes both:

```text
ghcr.io/icarus-automation/cms-api:latest
ghcr.io/icarus-automation/cms-api:sha-<12-character-commit>
```

Wait for **Actions → Publish container image** to pass. Production uses `latest`; the immutable
SHA tag remains available for rollback.

## 2. Cloudflare DNS

In the `geoplanph.com` zone, add:

| Type | Name | Content | Proxy |
|---|---|---|---|
| A | `postbox-api` | `187.77.156.189` | **DNS only** |

Do not change the frontend record.

## 3. VPS files

In Termius:

```bash
mkdir -p ~/docker-apps/postbox/prod
cd ~/docker-apps/postbox/prod
nano compose.yaml   # paste compose.yaml from this repo
nano .env           # paste .env from this repo
chmod 600 .env
```

The prod `.env` has these auth values. `COOKIE_DOMAIN` scopes the session cookie to both hosts,
with `Secure` and `SameSite=Lax`:

```dotenv
BETTER_AUTH_URL=https://postbox-api.geoplanph.com
CORS_ALLOWED_ORIGINS=https://postbox.geoplanph.com
COOKIE_DOMAIN=geoplanph.com
```

On a running install, edit `.env` and run `docker compose up -d --force-recreate`. A browser that
signed in before `COOKIE_DOMAIN` was set keeps an older cookie for `postbox-api.geoplanph.com` alone,
and sends it ahead of the new one. Once its session is gone, sign-in keeps returning to the login
page. Clear the cookies for `postbox-api.geoplanph.com` once in that browser. A database reset does
not remove them.

The Google prod client needs origin `https://postbox.geoplanph.com` and redirect URI
`https://postbox-api.geoplanph.com/api/v1/auth/callback/google`. The R2 bucket CORS rule needs origin
`https://postbox.geoplanph.com`, method `PUT`, and headers `content-type` and `content-length`. Leave
R2 blank only when uploads are disabled.

## 4. Log in to GHCR

For a private package, use a GitHub token with `read:packages`:

```bash
docker login ghcr.io
```

Use your GitHub username and the token as the password.

## 5. Start it

```bash
cd ~/docker-apps/postbox/prod
docker compose pull
docker compose up -d
docker compose logs --tail=100 migrate api
```

The `migrate` container runs this automatically before the API starts:

```bash
node node_modules/prisma/build/index.js migrate deploy
```

## 6. Caddy

Two files change in `~/self-hosted/caddy`:

```bash
cd ~/self-hosted/caddy
nano compose.yaml          # add one line, see 6a
nano sites/postbox.caddy   # replace the whole file, see 6b
```

**6a. `compose.yaml`:** delete everything in the file and paste this. The only new line is
`./sites`. Without it, `import sites/*` loads nothing.

```yaml
name: proxy

services:
  caddy:
    image: caddy:2-alpine
    container_name: caddy
    restart: unless-stopped
    extra_hosts:
      - "host.docker.internal:host-gateway"
    environment:
      N8N_HOST: ${N8N_HOST}
    ports:
      - "80:80"
      - "443:443"
      - "443:443/udp"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - ./sites:/etc/caddy/sites:ro
      - caddy_data:/data
      - caddy_config:/config
    networks:
      - proxy

volumes:
  caddy_data:
    external: true
    name: n8n_caddy_data
  caddy_config:
    external: true
    name: n8n_caddy_config

networks:
  proxy:
    external: true
    name: proxy
```

**6b. `sites/postbox.caddy`:** delete everything in the file and paste:

```caddyfile
postbox-api.geoplanph.com {
    encode zstd gzip
    reverse_proxy postbox-prod-api:8000
}
```

Recreate Caddy (every site drops for a few seconds) and test:

```bash
docker compose config
docker compose up -d
curl -i https://postbox-api.geoplanph.com/api/v1/health
```

An HTTP `200` response means the backend is live. Test login from the frontend.
