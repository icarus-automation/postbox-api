## Outcome
The Content area becomes Blog. There is one post type built from blocks, per-org categories and tags, slugs generated automatically from the title, and a clearly better writing and managing experience for non-technical marketers. Implement this across cms-api and cms-client, including the public API and its doc.

## Context
- The workspace holds cms-api (NestJS, Prisma, Better Auth organization plugin) and cms-client (Angular, spartan/ui, Tailwind). Blog v1 already exists. It has org-scoped content with two types, Article and Landing page, both built from ordered blocks (rich_text, image, media_text, heading, divider). It also has R2 presigned uploads, a public read API guarded by a rotatable x-public-key, signed publish webhooks, and API keys that can create drafts only. The public API is documented in cms-api/docs/public-content-api.md.
- The Landing page type is removed. Blocks already cover every layout, so there is exactly one type, the post.
- Rename everything to Blog and post: UI labels and navigation, API routes, Prisma models, DTOs, webhook event names, and the public API doc. No external site uses the public API yet, so do not keep old routes or aliases.
- A DB reset is fine, and existing content rows can be dropped. Do not write any backfill.
- Categories: a post has zero or one category. Tags: a post has any number of tags. Both are per-org, with a name and a slug that is unique per org and generated from the name.
- Users create categories and tags inline from the post editor by typing a new name. Owners and admins manage them in a new Blog section in Settings, where they can rename and delete them and see the post count for each. Deleting a category or tag unassigns it from its posts and never deletes posts.
- The public API can list posts filtered by category slug and by tag slug. Post responses include their category and tags. The public API also lists an org's categories and tags.
- Slug rules:
  - While a post is a draft and its slug has not been edited by hand, the slug follows the title.
  - Once someone edits the slug, it stops following the title.
  - After publish, the slug is still editable, but the editor warns that old links will break.
  - Slugs are unique per org. On a collision, add a numeric suffix (-2, -3).
  - Drafts created through an API key get the same automatic slug.
- UX is your call. Design the Blog list, the post editor, and the Blog settings the way you think is best for this kind of feature, for marketers who are not technical.

## Scope
- This work is the Blog area (post list, post editor, categories and tags, Blog settings, public content API and its doc) only.

## Constraints
- Keep the existing block types and do not add new ones.
- Leave auth, leads, and organization settings unchanged, apart from adding the Blog section to Settings.
- Follow the existing module patterns in cms-api and the spartan/ui components in cms-client.

## Verify
- cms-api builds and its tests pass. cms-client builds and lints clean.
- No "Content", "Article", or "Landing page" wording remains in the UI, and the API routes, models, and webhook events use post and blog naming.
- In a new draft, typing a title fills the slug. After the slug is edited by hand, changing the title leaves the slug alone. A duplicate title gets a -2 slug. Editing the slug of a published post shows the broken-links warning.
- A category and a tag created inline from the editor are assigned to the post and show up in Settings, Blog, with correct post counts. Renaming works. Deleting leaves the post in place, unassigned.
- With a valid x-public-key, listing posts filtered by a category slug or a tag slug returns only matching published posts, drafts never appear, and the category and tag list endpoints work.
- Publishing a post still sends a signed webhook, using the renamed event.
- cms-api/docs/public-content-api.md matches the new routes and includes examples of the category and tag filters.
