## Outcome
A client org can connect its website to Postbox without help. It gets one integration key, a Developers page in the app with a short copy-paste prompt for an AI coding agent, a public integration doc, and post responses that include ready-made HTML as well as blocks. Implement this across cms-api and cms-client.

## Context
- Postbox is deployed. The client is at https://postbox.geoplanph.com and the API is at https://postbox-api.geoplanph.com/api/v1. A DB reset is fine. Do not write a migration that preserves data or any backfill.
- Today each org has a rotatable public key (x-public-key) for reading published posts, plus API keys for lead intake and API draft creation.
- Key model:
  - Integration key, exactly one per org. It is read-only plus lead submit: it can read published posts, categories, and tags, and it can submit leads. It is safe to put in website code. Replace the public key with the integration key. Each org gets one automatically when it is created. Copy and rotate live in Settings.
  - Admin API keys keep their current powers (create drafts, read leads) and move under an Advanced section in Settings, labeled as server-only.
  - Lead submit accepts the integration key, and the admin API key path keeps working.
- Post responses from the public API keep the ordered blocks and add an html field. That field is the whole post rendered to semantic HTML with stable class names, pb- plus the block type (pb-heading, pb-rich-text, pb-image, pb-media-text, pb-divider). Sites can either style those classes or render the blocks themselves. The HTML must be sanitized.
- Developers page:
  - It is a new sidebar item. Owners and admins see it.
  - At the top: the integration key with copy, the API base URL, the org slug, and a link to Settings to rotate the key.
  - "Paste this to your AI agent": one short prompt, at most about 12 lines, with a copy button, prefilled with this org's base URL, slug, and doc URL, and defaulting to Next.js App Router. It tells the agent to add a blog list page, a post page by slug (the html field with a pb-* stylesheet), category and tag filtering, an on-demand revalidate route for the publish webhook, and a lead form posting to the API. The key goes in an env var.
  - A compact quick reference: list posts, get a post, the category and tag filters, lead submit, the webhook payload and signature check. Each item has one short example.
  - A link to the full doc.
- Publish the integration doc (based on cms-api/docs/public-content-api.md, updated for the integration key and the html field) at a public, unauthenticated URL on the API, so agents can fetch it.

## Scope
- This work is the integration key, the html output, the Developers page, and the public integration doc only.

## Constraints
- Keep the blog editor, auth, and leads inbox unchanged, apart from the key wiring.
- Keep the agent prompt short and plain. It points to the doc for details instead of repeating it.

## Verify
- cms-api builds and its tests pass. cms-client builds and lints clean.
- A newly created org has an integration key straight away.
- The integration key can list and get published posts, categories, and tags, and can submit a lead. It cannot create drafts or read the lead list (403). Rotating the key cuts off the old one immediately.
- Admin API keys still create drafts and read leads, and they appear under Settings, Advanced.
- A post with every block type returns sanitized html with the pb-* classes, alongside the blocks.
- The Developers page shows the real key, base URL, slug, and a prefilled agent prompt, and copy works. The public doc URL loads without auth.
