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

Mount the sites folder in `~/self-hosted/caddy/compose.yaml`, under the `caddy` service `volumes`.
Without it `import sites/*` loads nothing:

```yaml
      - ./sites:/etc/caddy/sites:ro
```

Replace `~/self-hosted/caddy/sites/postbox.caddy`:

```caddyfile
postbox-api.geoplanph.com {
    encode zstd gzip
    reverse_proxy postbox-prod-api:8000
}
```

Recreate Caddy (every site drops for a few seconds) and test:

```bash
cd ~/self-hosted/caddy
docker compose up -d
curl -i https://postbox-api.geoplanph.com/api/v1/health
```

An HTTP `200` response means the backend is live. Test login from the frontend.
