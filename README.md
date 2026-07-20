# Recipe Card Archive

Admin tool + public site for digitizing ~300 handwritten recipe cards scanned in batches of ~9 cards (numbered folders, each with `Front.jpeg` + `Back.jpeg`).

This is the **local-first admin + hosted public site**: upload, crop, back-align, AI extraction, and review run on your machine against `data/` (SQLite + image files). The production Supabase schema lives in `supabase/schema.sql`. Cropped card pairs and metadata sync to Supabase via the Library tab (requires `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`). The hosted `/admin` Library can edit/publish against Supabase after Supabase Auth login (`ADMIN_EMAILS`).

## Setup

```bash
npm install
cp .env.local.example .env.local   # add your ANTHROPIC_API_KEY
npm run dev
```

Open http://localhost:3000 for the public site, or http://localhost:3000/admin for the
admin tool (lands on the Library). The batch processing workflow lives behind the
**+ Add batches** button in the admin header.

## Public site

Reads from Supabase with the **anon key**, so RLS is the gatekeeper: only published
cards with reviewed extractions are visible. Three modes share one profile page:

- **Wall** (`/`) — every card front on black, nothing else. Uses small
  `front_thumb.jpg` thumbnails (480px wide) that sync generates and uploads alongside
  each front image; `POST /api/sync {"thumbs":true}` backfills them for cards synced
  before thumbnails existed.
- **Index** (`/list`) — an alphabetical card index: a scrollable stack of paper cards
  with just the title strip showing; hovering lifts a card out of the stack.
- **Box** (`/3d`) — placeholder for the future 3D skeuomorphic recipe box.
- **Profile** (`/card/[slug]`) — full-resolution flip card (tap to see the back),
  category/attribution/ingredients, the cleaned-up recipe (rendered from structured
  data when available: sectioned ingredients, numbered steps, estimated times, yield),
  and an "As she wrote it" verbatim transcription tab, with alphabetical prev/next nav.
  Each page embeds schema.org Recipe JSON-LD for rich results in search.
  The front image is the Open Graph image, so shared links unfurl with the card.

Pages revalidate every 2 minutes, so newly published cards appear without a redeploy.

## Workflow

1. **Batches** — pick the parent folder containing `1/`, `2/`, … Each batch needs `Front.jpeg`/`Back.jpeg` (case-insensitive, `.jpg` ok). A manifest shows what was found before uploading. DPI is read from EXIF/JFIF; missing DPI falls back to the project default (settings bar, top right). Portrait scans are rotated 90° at upload so scans, thumbnails, and cards are always landscape. Each batch card has a **Delete** button (removes the batch, its scans, and all exported card images).
2. **Align** (`1 · Align`) — front and back scans side by side, both auto-detected on load. If a whole scan reads upside-down, the **Flip front / Flip back / Flip both** buttons rotate the stored scan file(s) 180° — saved crops and 180° flags are transformed along with them. Backs are detected independently (scans can differ in canvas size when cards shift on the scanner bed) and matched to fronts by grid position, since cards were flipped in place. Boxes are fixed-size (drag/rotate only — all cards are standard index cards); selection is paired across the two panes. Adjust anything that detection missed, press `r` on a card whose back reads upside-down, then **Accept all** to save geometry and move on.
3. **Review cards** (`2 · Review cards`) — one card pair at a time in a viewfinder: the crop marks are fixed and axis-aligned, and you move the CARD under them (drag/nudge/rotate, 180° spin for upside-down faces). If a card was scanned back-up, **⇄ Swap F/B** (or `s`) swaps which scan becomes the front vs. back at export. Each pane shows exactly the export framing, with everything outside masked to black, and the previews at the bottom show exactly what will be saved. **Approve** exports both faces to `cards/{id}/` and auto-advances to the next unapproved card; when every pair is approved the batch is complete.
4. **Review** — "Extract all pending" runs Claude over front+back (2 concurrent, backoff on rate limits, running token/cost figure). Besides the verbatim transcription, extraction produces a **cleaned-up recipe** — the recipe rewritten in plain modern language as markdown (bulleted ingredients, numbered steps) with a Preview toggle in the form — and a **structured recipe**: parsed ingredient lines (`raw` display text plus `item`/`quantity`/`unit`/`note`/`section`), structured steps, estimated prep/total minutes, and yield. The lowercase **ingredient tags** (e.g. `flour, raisin`) are derived from the structured items so they can't drift apart. The structured recipe is editable as JSON (with preview) in the form. Edit fields, `enter` approves and advances, `f` flips the image. **⇄ Swap front/back** fixes a card that was scanned back-up even after export: it swaps the exported `front.jpg`/`back.jpg` files on disk, the front/back transcriptions, and marks the card for re-sync. Approving, publishing, or swapping a card automatically pushes it to Supabase in the background (a status line under the sidebar buttons shows syncing/synced/failed); images are only re-uploaded when the exports changed.
5. **Library** (home) — a gallery of every card pair, read **live from Supabase** when configured (images come from the public bucket, exactly what the future public site will see); falls back to local data offline. Click a card to flip it front/back; click its title to open the **card profile** — a per-card admin view with the flip image, batch/slug/sync facts, the full metadata form (works even for cards with no extraction yet — saving creates a manual one), a **Re-scan metadata (AI)** button (confirms before replacing human-reviewed data), and publish/unpublish. Saving marks the metadata reviewed and syncs the card to Supabase. Search filters by title, transcription, attribution, or batch number. A **Backfill from reviewed recipes** panel appears while any reviewed card still lacks a structured recipe: it derives the structured data from the already-reviewed markdown (text-only, no images, rows stay reviewed) so no second review pass is needed. The **Sync to Supabase** button pushes everything up: batches/cards/latest-extractions are upserted every time (cheap), and card images are uploaded only when their exports changed since the last sync (re-approving a card marks it for re-upload; "Force full re-upload" pushes every image). Deletions are not propagated — remove rows/objects in Supabase manually if you delete cards after syncing.

### Keyboard (align & card review)

Press `?` on either screen for the in-app cheat-sheet.

| Key | Action |
| --- | --- |
| scroll / drag background | zoom / pan |
| click a pane | make it the active side for keyboard input |
| tab / shift-tab | cycle cards (align) |
| arrows (+shift) | nudge 1px (10px) — moves the box in align, the card in card review |
| `[` `]` (+shift) | rotate 0.5° (0.1°) — rotates the box in align, the card in card review |
| `r` | 180° toggle (back in align; active face in card review) |
| `s` | swap front/back faces (card review) |
| delete | remove card pair (align, front pane) |
| `f` | fit view |
| enter | approve & next (card review) |
| `n` / `p` | next / previous card (card review) |

## Environment

| Var | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL — required by the public site (build + runtime) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key — public site + admin login (RLS gates what's visible) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key — local **Sync to Supabase** and hosted admin writes |
| `ANTHROPIC_API_KEY` | required for `/api/extract` (admin AI extraction) |
| `ANTHROPIC_MODEL` | optional, defaults to `claude-sonnet-4-6` |
| `ADMIN_EMAILS` | when set, `/admin/*` and `/api/*` require Supabase Auth; only these emails may sign in (comma-separated) |
| `DATA_DIR` | optional, defaults to `./data` — local SQLite + image storage (local only) |

## Deploying to Vercel

The **public site** is fully serverless-ready: it reads everything from Supabase
(anon key), so it needs no local database or filesystem.

The **hosted admin** supports the **Library** and per-card edit/publish flow against
Supabase (after you sign in). Batch scan → crop → extract still needs your local
machine (SQLite + `DATA_DIR`); sync from local publishes images and metadata that
the hosted site and hosted library both use.

`src/proxy.ts` (Next.js's renamed middleware) gates `/admin/*` and `/api/*` with
**Supabase Auth** whenever `ADMIN_EMAILS` is set. Sign in at `/admin/login` with
an email/password user you create in the Supabase Dashboard. Only emails on the
allowlist are admitted. Locally leave `ADMIN_EMAILS` unset to keep admin open.

Steps:

1. Push this repo to GitHub and import it into Vercel (framework auto-detected as Next.js).
2. In Supabase → **Authentication**, create your admin user (email/password) and
   disable public sign-ups if you have not already.
3. In **Project → Settings → Environment Variables**, add:
   - `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` — **required at build time**; the home and index pages prerender from Supabase, so the build fails without them.
   - `ADMIN_EMAILS` — your allowlisted email(s), e.g. `you@example.com`.
   - `SUPABASE_SERVICE_ROLE_KEY` — required for hosted library/card edits (writes after the session check).
   - `ANTHROPIC_API_KEY` — only if you intend to run AI extraction from the host (usually omit; run locally).
4. In Supabase → Authentication → URL configuration, add your Vercel origin to
   the site URL / redirect allow list (e.g. `https://your-app.vercel.app/auth/callback`).
5. Deploy. Public pages revalidate every 2 minutes, so cards you sync from your
   local admin appear on the hosted site within a couple of minutes — no redeploy.

## Test fixtures

`npm run make-test-scans` generates two synthetic batches (black background, light "cards" with slight skew, batch 2's backs rotated 180°) under `test-scans/` for exercising the pipeline without real scans.
