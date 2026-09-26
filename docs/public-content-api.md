# Public content API

A website reads published posts and pages with a public key. Drafts are never returned. Session routes and API keys are not part of this API.

Base URL: `https://<your-cms-host>/api/v1`

Send the key on every request:

```
x-public-key: pub_...
```

A missing key, a wrong key, and an unknown organization slug all respond `401`. An unknown slug, or a slug that is still a draft, responds `404`.

Responses from these endpoints send `Cache-Control: public, max-age=60` when they succeed. Browsers on any origin may call them. The preflight allows `GET` and `OPTIONS`, headers `x-public-key` and `Content-Type`, and does not allow credentials.

## List published content

`GET /api/v1/public/:orgSlug/content`

Query: `page` (default 1), `limit` (default 10, max 50), optional `kind` of `post` or `page`.

```json
{
  "data": [
    {
      "kind": "post",
      "title": "Spring openings",
      "slug": "spring-openings",
      "excerpt": "Roles we are hiring for.",
      "publishedAt": "2026-09-24T08:00:00.000Z",
      "coverImage": null
    }
  ],
  "meta": { "total": 1, "page": 1, "limit": 10, "lastPage": 1 }
}
```

## One published entry

`GET /api/v1/public/:orgSlug/content/:slug`

```json
{
  "kind": "post",
  "title": "Spring openings",
  "slug": "spring-openings",
  "excerpt": "Roles we are hiring for.",
  "metaTitle": "Spring openings",
  "metaDescription": "Roles we are hiring for.",
  "ogImage": null,
  "coverImage": null,
  "publishedAt": "2026-09-24T08:00:00.000Z",
  "blocks": [
    {
      "kind": "rich_text",
      "doc": {
        "type": "doc",
        "content": [
          {
            "type": "paragraph",
            "content": [{ "type": "text", "text": "We are hiring." }]
          }
        ]
      },
      "html": "<p>We are hiring.</p>"
    }
  ]
}
```

`doc` is ProseMirror JSON. `html` is the sanitized HTML stored with the block. Render `html`. Do not treat `doc` as HTML.

### Block shapes

`rich_text`

```json
{ "kind": "rich_text", "doc": { "type": "doc", "content": [] }, "html": "<p></p>" }
```

`image` — `image` is `null` when the slot is empty.

```json
{
  "kind": "image",
  "image": { "url": "https://media.example.com/orgs/org/media/file", "alt": "Lobby", "contentType": "image/jpeg" }
}
```

`contentType` is `image/jpeg`, `image/png`, `image/webp`, or `image/gif`.

`media_text` — `side` is `image_left` or `image_right`. `heading` is a string or `null`.

```json
{
  "kind": "media_text",
  "side": "image_left",
  "heading": "Section",
  "image": null,
  "doc": { "type": "doc", "content": [{ "type": "paragraph" }] },
  "html": "<p>Describe this section.</p>"
}
```

`heading` — `level` is `1`, `2`, or `3`.

```json
{ "kind": "heading", "level": 2, "text": "Section" }
```

`divider`

```json
{ "kind": "divider" }
```

Rich text HTML uses only `p`, `blockquote`, `ul`, `ol`, `li`, `br`, `strong`, `em`, and `a` with an `http` or `https` `href`.

## Webhooks

When a public key's organization has a webhook URL, the CMS `POST`s that URL after a publish, an unpublish, and an edit of something that is already published. Delivery is not retried. A failed delivery does not roll back the save.

```json
{
  "type": "content.published",
  "organizationSlug": "acme",
  "entry": {
    "status": "published",
    "kind": "post",
    "title": "Spring openings",
    "slug": "spring-openings",
    "excerpt": "",
    "metaTitle": "",
    "metaDescription": "",
    "ogImage": null,
    "coverImage": null,
    "publishedAt": "2026-09-24T08:00:00.000Z",
    "blocks": []
  }
}
```

`type` is `content.published`, `content.unpublished`, or `content.updated`. An unpublish still includes `slug` and `blocks`, with `status` `draft` and `publishedAt` `null`, so the site can drop the page.

The body is the raw JSON above. The request header is:

```
X-Content-Signature: sha256=<hex>
```

`<hex>` is HMAC-SHA256 of that raw body, keyed with the webhook secret. Compare the hex digest you compute with the hex in the header using a timing-safe compare. Reject the request when they differ or when the header is missing.

```js
const crypto = require('crypto');

function signatureIsValid(rawBody, header, secret) {
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const given = header.startsWith('sha256=') ? header.slice('sha256='.length) : '';
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(given, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
```

Read the body as bytes before you parse JSON. A re-serialized object will not match the signature.
