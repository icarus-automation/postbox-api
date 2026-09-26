# Public blog API

A website reads published blog posts, and the categories and tags they are filed under, with a public key. Drafts are never returned. Session routes and API keys are not part of this API.

Base URL: `https://<your-cms-host>/api/v1/public/:orgSlug/blog`

Send the key on every request:

```
x-public-key: pub_...
```

A missing key, a wrong key, and an unknown organization slug all respond `401`. A slug that does not exist, or that belongs to a draft, responds `404`.

Responses from these endpoints send `Cache-Control: public, max-age=60` when they succeed. Browsers on any origin may call them. The preflight allows `GET` and `OPTIONS`, headers `x-public-key` and `Content-Type`, and does not allow credentials.

| Route | Returns |
| --- | --- |
| `GET /api/v1/public/:orgSlug/blog/posts` | A page of published posts, newest first |
| `GET /api/v1/public/:orgSlug/blog/posts/:slug` | One published post with its blocks |
| `GET /api/v1/public/:orgSlug/blog/categories` | Categories that have a published post |
| `GET /api/v1/public/:orgSlug/blog/tags` | Tags that have a published post |

## List published posts

`GET /api/v1/public/:orgSlug/blog/posts`

Query:

- `page`: default 1.
- `limit`: default 10, max 50.
- `category`: a category slug. Only posts in that category.
- `tag`: a tag slug. Only posts with that tag.

`category` and `tag` can be sent together, and a post then has to match both. A filter that is not a slug (lowercase letters, digits and single hyphens) responds `400`. A slug that no category or tag has returns an empty page.

```bash
curl -H "x-public-key: $PUBLIC_KEY" \
  "https://cms.example.com/api/v1/public/acme/blog/posts?page=1&limit=10"
```

```json
{
  "data": [
    {
      "title": "Spring openings",
      "slug": "spring-openings",
      "excerpt": "Roles we are hiring for.",
      "publishedAt": "2026-09-24T08:00:00.000Z",
      "coverImage": { "url": "https://media.example.com/orgs/org/media/file", "alt": "Our office" },
      "category": { "name": "News", "slug": "news" },
      "tags": [
        { "name": "Careers", "slug": "careers" },
        { "name": "Hiring", "slug": "hiring" }
      ]
    }
  ],
  "meta": { "total": 1, "page": 1, "limit": 10, "lastPage": 1 }
}
```

`category` is `null` for a post without one, and `tags` is `[]` for a post without any. Tags are sorted by name.

### Filter by category

Every published post in the `news` category:

```bash
curl -H "x-public-key: $PUBLIC_KEY" \
  "https://cms.example.com/api/v1/public/acme/blog/posts?category=news"
```

### Filter by tag

Every published post tagged `hiring`, twenty to a page:

```bash
curl -H "x-public-key: $PUBLIC_KEY" \
  "https://cms.example.com/api/v1/public/acme/blog/posts?tag=hiring&limit=20"
```

### Both at once

Posts in `news` that are also tagged `hiring`:

```bash
curl -H "x-public-key: $PUBLIC_KEY" \
  "https://cms.example.com/api/v1/public/acme/blog/posts?category=news&tag=hiring"
```

From a browser:

```js
const response = await fetch(
  'https://cms.example.com/api/v1/public/acme/blog/posts?tag=hiring',
  { headers: { 'x-public-key': PUBLIC_KEY } },
);
const { data, meta } = await response.json();
```

## One published post

`GET /api/v1/public/:orgSlug/blog/posts/:slug`

```json
{
  "title": "Spring openings",
  "slug": "spring-openings",
  "excerpt": "Roles we are hiring for.",
  "metaTitle": "Spring openings",
  "metaDescription": "Roles we are hiring for.",
  "ogImage": null,
  "coverImage": null,
  "category": { "name": "News", "slug": "news" },
  "tags": [{ "name": "Hiring", "slug": "hiring" }],
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

A slug is unique within the organization. A post's slug can change after it is published, so a link to the old slug then answers `404`. The `post.updated` webhook below carries the new slug.

### Block shapes

`rich_text`

```json
{ "kind": "rich_text", "doc": { "type": "doc", "content": [] }, "html": "<p></p>" }
```

`image`: `image` is `null` when the slot is empty.

```json
{
  "kind": "image",
  "image": { "url": "https://media.example.com/orgs/org/media/file", "alt": "Lobby", "contentType": "image/jpeg" }
}
```

`contentType` is `image/jpeg`, `image/png`, `image/webp`, or `image/gif`.

`media_text`: `side` is `image_left` or `image_right`. `heading` is a string or `null`.

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

`heading`: `level` is `1`, `2`, or `3`.

```json
{ "kind": "heading", "level": 2, "text": "Section" }
```

`divider`

```json
{ "kind": "divider" }
```

Rich text HTML uses only `p`, `blockquote`, `ul`, `ol`, `li`, `br`, `strong`, `em`, and `a` with an `http` or `https` `href`.

## Categories

`GET /api/v1/public/:orgSlug/blog/categories`

Categories with at least one published post, sorted by name. `postCount` counts published posts only. A category that only drafts use is left out, so a name made for an unannounced post does not show before the post does.

```json
[
  { "name": "Events", "slug": "events", "postCount": 3 },
  { "name": "News", "slug": "news", "postCount": 12 }
]
```

A post has at most one category. Pass a category's `slug` to the post list as `category`.

## Tags

`GET /api/v1/public/:orgSlug/blog/tags`

Tags on at least one published post, sorted by name, with the same rules as categories.

```json
[
  { "name": "Careers", "slug": "careers", "postCount": 2 },
  { "name": "Hiring", "slug": "hiring", "postCount": 5 }
]
```

A post can have any number of tags. Pass a tag's `slug` to the post list as `tag`.

## Webhooks

When the organization has a webhook URL, the CMS `POST`s that URL:

- `post.published` after a post is published.
- `post.unpublished` after a post is unpublished.
- `post.updated` after a published post is saved and reads differently, and for each published post whose category or tag is renamed or deleted.

Delivery is not retried. A failed delivery does not roll back the save.

```json
{
  "type": "post.published",
  "organizationSlug": "acme",
  "post": {
    "status": "published",
    "title": "Spring openings",
    "slug": "spring-openings",
    "excerpt": "",
    "metaTitle": "",
    "metaDescription": "",
    "ogImage": null,
    "coverImage": null,
    "category": { "name": "News", "slug": "news" },
    "tags": [{ "name": "Hiring", "slug": "hiring" }],
    "publishedAt": "2026-09-24T08:00:00.000Z",
    "blocks": []
  }
}
```

An unpublish still includes `slug` and `blocks`, with `status` `draft` and `publishedAt` `null`, so the site can drop the page.

The body is the raw JSON above. The request header is:

```
X-Blog-Signature: sha256=<hex>
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
