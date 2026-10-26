# Postbox integration guide

How a website reads a Postbox blog and sends leads to a Postbox inbox. It is written for developers and for AI coding agents.

- API base URL: `{{apiBaseUrl}}`
- This guide: `{{apiBaseUrl}}/docs/integration.md`
- The integration key, the organization slug and a ready-made agent prompt are on the Developers page in Postbox.

## 1. Keys

**Integration key.** It starts with `pbi_`. Each organization has exactly one, made when the organization is created. It can:

- read published posts, categories and tags
- submit leads

It cannot read leads, create drafts, publish or change anything else. A route that takes an admin API key answers an integration key with `403`, and every other route answers `401`. That is why it is safe to put in website code, including a browser bundle. Send it in the `x-integration-key` header.

Owners and admins see the key on the Developers page and in Settings, Integration key. Rotating it there makes the old key stop working at once, so update every site that uses it.

**Admin API keys.** They start with `cms_` and go in the `x-api-key` header. Agents and servers use them to file drafts and read leads. They are made in Settings, Advanced. Never put one in website code. A website does not need one.

## 2. Conventions

- Website routes live under `{{apiBaseUrl}}/public/{orgSlug}`. The organization slug is on the Developers page.
- Requests and responses are JSON. Dates are ISO 8601 strings in UTC.
- Browsers can call the `/public` routes from any origin. CORS allows `GET` and `POST` with the `x-integration-key` and `Content-Type` headers.
- Reads send `Cache-Control: public, max-age=60`. Cache them on your side as well.
- An error looks like `{ "statusCode": 401, "message": "Unauthorized", "error": "UnauthorizedException", "path": "/api/v1/...", "timestamp": "..." }`. `message` is a string, or an array of strings when validation fails.

| Status | Meaning |
| --- | --- |
| 400 | The query or body is invalid. `message` lists what is wrong. |
| 401 | The key is missing or wrong, or it belongs to another organization than the slug in the path. |
| 403 | The key is valid but its route is for admin API keys. |
| 404 | The post does not exist or is not published. |
| 429 | Too many requests. The API allows 100 per minute per IP, and lead submit allows 10. |

## 3. Read posts

Every call below sends the header `x-integration-key: $POSTBOX_INTEGRATION_KEY`.

### List posts

`GET /public/{orgSlug}/blog/posts`

| Query | Default | Notes |
| --- | --- | --- |
| `page` | `1` | Starts at 1. |
| `limit` | `10` | From 1 to 50. |
| `category` | none | A category slug. Only posts in that category. |
| `tag` | none | A tag slug. Only posts with that tag. |

Only published posts come back, newest first. `category` and `tag` can be combined. A slug that matches nothing gives an empty list. A value that is not a slug (lowercase letters, digits and single hyphens) gives `400`.

```bash
curl -H "x-integration-key: $POSTBOX_INTEGRATION_KEY" \
  "{{apiBaseUrl}}/public/acme-inc/blog/posts?category=news&tag=hiring&limit=5"
```

```json
{
  "data": [
    {
      "title": "Spring openings",
      "slug": "spring-openings",
      "excerpt": "Roles we are hiring for.",
      "publishedAt": "2026-09-24T08:00:00.000Z",
      "coverImage": { "url": "https://media.example.com/cover.jpg", "alt": "The team" },
      "category": { "name": "News", "slug": "news" },
      "tags": [{ "name": "Hiring", "slug": "hiring" }]
    }
  ],
  "meta": { "total": 1, "page": 1, "limit": 5, "lastPage": 1 }
}
```

`coverImage` and `category` are `null` when the post has none. A summary has no body. Fetch the post for that.

### Get a post

`GET /public/{orgSlug}/blog/posts/{slug}`

```bash
curl -H "x-integration-key: $POSTBOX_INTEGRATION_KEY" \
  "{{apiBaseUrl}}/public/acme-inc/blog/posts/spring-openings"
```

```json
{
  "title": "Spring openings",
  "slug": "spring-openings",
  "excerpt": "Roles we are hiring for.",
  "metaTitle": "Spring openings | Acme",
  "metaDescription": "Roles we are hiring for this spring.",
  "ogImage": { "url": "https://media.example.com/og.jpg", "alt": "The team" },
  "coverImage": { "url": "https://media.example.com/cover.jpg", "alt": "The team" },
  "category": { "name": "News", "slug": "news" },
  "tags": [{ "name": "Hiring", "slug": "hiring" }],
  "publishedAt": "2026-09-24T08:00:00.000Z",
  "blocks": [
    { "kind": "heading", "level": 2, "text": "Open roles" },
    {
      "kind": "rich_text",
      "doc": {
        "type": "doc",
        "content": [
          {
            "type": "paragraph",
            "content": [
              { "type": "text", "text": "We are " },
              { "type": "text", "text": "hiring", "marks": [{ "type": "bold" }] },
              { "type": "text", "text": "." }
            ]
          }
        ]
      },
      "html": "<p>We are <strong>hiring</strong>.</p>"
    }
  ],
  "html": "<h2 class=\"pb-heading\">Open roles</h2>\n<div class=\"pb-rich-text\"><p>We are <strong>hiring</strong>.</p></div>"
}
```

A slug that is a draft, unpublished or unknown gives `404`. `ogImage`, `coverImage` and `category` are `null` when the post has none. `metaTitle` and `metaDescription` can be empty strings.

### List categories and tags

`GET /public/{orgSlug}/blog/categories` and `GET /public/{orgSlug}/blog/tags`

```json
[{ "name": "News", "slug": "news", "postCount": 2 }]
```

Sorted by name. Only categories and tags with at least one published post appear, and `postCount` counts published posts. Use the `slug` as the `category` or `tag` filter above.

## 4. Blocks and the html field

A post body is an ordered list of `blocks`. The post also carries `html`, the same blocks rendered to one sanitized HTML string. Render `html`, or render `blocks` yourself. Do not mix the two.

`html` is the body only. The title, cover image and meta fields stay separate so your page decides how they look.

### Blocks

| `kind` | Fields |
| --- | --- |
| `heading` | `level` (1, 2 or 3) and `text` (plain text) |
| `rich_text` | `doc` (rich text JSON) and `html` (that text as HTML) |
| `image` | `image`: `{ url, alt, contentType }`, or `null` for an empty slot |
| `media_text` | `side` (`image_left` or `image_right`), `image` (as above, or `null`), `heading` (text or `null`), `doc` and `html` |
| `divider` | none |

`doc` is a rich text tree: `{ "type": "doc", "content": [...] }` where each node is a `paragraph`, `blockquote`, `bulletList` or `orderedList`. Text nodes carry the marks `bold`, `italic` and `link` (`href`, http or https only), and a `hardBreak` node is a line break. The `html` beside a `doc` already has this rendered, so most sites never read `doc`.

### The html field

Each block becomes one element with a stable class name: `pb-` plus the block type.

| Block | Markup |
| --- | --- |
| `heading` | `<h1 class="pb-heading">`, `<h2 ...>` or `<h3 ...>` by `level` |
| `rich_text` | `<div class="pb-rich-text">` holding `p`, `ul`, `ol`, `li`, `blockquote`, `strong`, `em`, `a` and `br` |
| `image` | `<figure class="pb-image"><img src alt loading="lazy"></figure>`. An empty slot adds nothing. |
| `media_text` | `<div class="pb-media-text pb-media-text--image-left">`, or `pb-media-text--image-right` in its place. Inside: `<figure class="pb-media-text__media">` with the image, then `<div class="pb-media-text__body">` with an optional `<h2 class="pb-media-text__heading">` and the text. With `image_right` the body comes first. The figure is left out when there is no image. |
| `divider` | `<hr class="pb-divider">` |

The string is sanitized on the server. It holds only the elements above, only `pb-` classes, only `href` on links and `src`, `alt` and `loading` on images, and only `http` and `https` addresses. There are no inline styles, scripts or event attributes, so it is safe to inject as is (`innerHTML`, `dangerouslySetInnerHTML`, `v-html`).

The class names are stable. New block kinds get new classes and the existing ones do not change.

## 5. Starter stylesheet

Copy this and adjust it to the site.

```css
.pb-heading { margin: 2rem 0 0.75rem; line-height: 1.25; }
.pb-rich-text { margin: 1rem 0; line-height: 1.7; }
.pb-rich-text p, .pb-media-text__body p { margin: 0 0 1rem; }
.pb-rich-text ul, .pb-rich-text ol,
.pb-media-text__body ul, .pb-media-text__body ol { margin: 0 0 1rem; padding-left: 1.5rem; }
.pb-rich-text li p, .pb-media-text__body li p { margin: 0 0 0.25rem; }
.pb-rich-text blockquote, .pb-media-text__body blockquote {
  margin: 0 0 1rem; padding-left: 1rem; border-left: 3px solid currentColor;
}
.pb-rich-text a, .pb-media-text__body a { text-decoration: underline; }
.pb-image, .pb-media-text__media { margin: 1.5rem 0; }
.pb-image img, .pb-media-text__media img { display: block; max-width: 100%; height: auto; }
.pb-media-text { display: grid; gap: 1.5rem; align-items: start; margin: 1.5rem 0; }
.pb-media-text__media { margin: 0; }
.pb-media-text__heading { margin: 0 0 0.75rem; line-height: 1.25; }
.pb-media-text__body:only-child { grid-column: 1 / -1; }
.pb-divider { margin: 2rem 0; border: 0; border-top: 1px solid currentColor; opacity: 0.2; }
@media (min-width: 48rem) {
  .pb-media-text { grid-template-columns: 1fr 1fr; }
}
```

## 6. Send a lead

`POST /public/{orgSlug}/leads`

The body is `{ "values": { "<field key>": <value> } }`. The answer is `201` with `{ "id": "..." }`. A new lead has the status `new`. Only people in Postbox move it along.

```bash
curl -X POST "{{apiBaseUrl}}/public/acme-inc/leads" \
  -H "x-integration-key: $POSTBOX_INTEGRATION_KEY" \
  -H "content-type: application/json" \
  -d '{
    "values": {
      "candidate": "Dana Reyes",
      "product": "POS",
      "source": "https://acme.example/contact",
      "signal": "I would like a demo for our three cafes.",
      "whyLead": "Contact form on the website"
    }
  }'
```

Every organization starts with these fields. Required means the call fails without it.

| Key | Type | Required | Notes |
| --- | --- | --- | --- |
| `candidate` | text | yes | Who the lead is. Up to 500 characters. |
| `product` | select | yes | `POS`, `PMS` or `Other`. |
| `source` | url | yes | An `http` or `https` address, such as the page with the form. |
| `signal` | long text | yes | What they said. Up to 5000 characters. |
| `whyLead` | long text | yes | Why this counts as a lead. Up to 5000 characters. |

`status` and `receivedAt` are read-only and are refused if sent. The owner can add custom fields in Settings, Lead fields. Their keys work the same way, and a required one must be sent. Types are text (up to 500 characters), long text (up to 5000), number (a JSON number), select (one of its options), url and date (`YYYY-MM-DD`).

A bad body gives `400` with every problem at once, for example `["values.product must be one of: POS, PMS, Other"]`. A key that is not a lead field gives `values.<key> is not a lead field`.

Server code can also post the same body to `{{apiBaseUrl}}/leads` with the same header. That route answers with the whole lead instead of the id, and it does not allow browser calls from other origins.

## 7. Webhook

Postbox calls one URL per organization when a post is published, unpublished, or changed while it is published. That includes a rename or delete of its category or a tag. Use it to refresh a cache.

| `type` | When |
| --- | --- |
| `post.published` | A draft was published. |
| `post.unpublished` | A published post went back to draft. |
| `post.updated` | A published post changed in a way readers see. |

Postbox sends a `POST` with a JSON body and these headers:

```
content-type: application/json
X-Blog-Signature: sha256=<hex>
```

```json
{
  "type": "post.published",
  "organizationSlug": "acme-inc",
  "post": {
    "status": "published",
    "title": "Spring openings",
    "slug": "spring-openings",
    "excerpt": "Roles we are hiring for.",
    "metaTitle": "",
    "metaDescription": "",
    "ogImage": null,
    "coverImage": null,
    "category": { "name": "News", "slug": "news" },
    "tags": [],
    "publishedAt": "2026-09-24T08:00:00.000Z",
    "blocks": [],
    "html": ""
  }
}
```

`post` has the fields of a post, plus `status`. For `post.unpublished`, `status` is `draft` and `publishedAt` is `null`.

**Check the signature.** `X-Blog-Signature` is `sha256=` followed by the hex HMAC-SHA256 of the raw request body, keyed with the secret saved with the URL. Compute it over the raw text before parsing, and compare in constant time.

```ts
import { createHmac, timingSafeEqual } from 'node:crypto';

export function isFromPostbox(rawBody: string, header: string | null, secret: string): boolean {
  const expected = Buffer.from(`sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`);
  const given = Buffer.from(header ?? '');
  return given.length === expected.length && timingSafeEqual(given, expected);
}
```

Answer with any `2xx` within 5 seconds. Postbox does not retry a failed delivery.

**Register the URL.** An owner or admin who is signed in saves it with `PUT {{apiBaseUrl}}/blog/access/webhook` and a session cookie. The body is `{ "url": "https://acme.example/api/postbox/revalidate", "secret": "<a long random string>" }`. `{ "url": null }` removes it.

## 8. Next.js App Router example

These examples are for Next.js 15. In Next.js 14, `params` and `searchParams` are plain objects, not promises.

Environment variables: `POSTBOX_INTEGRATION_KEY` and `POSTBOX_WEBHOOK_SECRET`. Do not hard-code them.

A small client for the read routes, in `lib/postbox.ts`:

```ts
const API = '{{apiBaseUrl}}';
const ORG = 'acme-inc';

export async function postbox<T>(path: string): Promise<T | null> {
  const response = await fetch(`${API}/public/${ORG}${path}`, {
    headers: { 'x-integration-key': process.env.POSTBOX_INTEGRATION_KEY ?? '' },
    next: { revalidate: 60, tags: ['postbox'] },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Postbox answered ${response.status}`);
  return (await response.json()) as T;
}
```

The post page renders `html` and loads the stylesheet from section 5 once in a global CSS file:

```tsx
// app/blog/[slug]/page.tsx
import { notFound } from 'next/navigation';
import { postbox } from '@/lib/postbox';

type Post = { title: string; publishedAt: string; html: string };

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await postbox<Post>(`/blog/posts/${slug}`);
  if (!post) notFound();

  return (
    <article>
      <h1>{post.title}</h1>
      <div dangerouslySetInnerHTML={{ __html: post.html }} />
    </article>
  );
}
```

The list page calls `/blog/posts?category=...&tag=...&page=...` with the filters from the URL, and `/blog/categories` and `/blog/tags` for the filter links.

The revalidate route checks the signature, then refreshes the pages:

```ts
// app/api/postbox/revalidate/route.ts
import { revalidatePath } from 'next/cache';
import { isFromPostbox } from '@/lib/signature';

export async function POST(request: Request) {
  const rawBody = await request.text();
  const secret = process.env.POSTBOX_WEBHOOK_SECRET ?? '';
  if (!isFromPostbox(rawBody, request.headers.get('x-blog-signature'), secret)) {
    return new Response('Invalid signature', { status: 401 });
  }

  const { post } = JSON.parse(rawBody) as { post: { slug: string } };
  revalidatePath('/blog');
  revalidatePath(`/blog/${post.slug}`);
  return Response.json({ revalidated: true });
}
```

The lead form can post from a server action or from the browser with `fetch`, as in section 6. The key is safe in either place, so use whichever fits the site.
