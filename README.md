# Recipe Card Archive

Local admin tool for digitizing ~300 handwritten recipe cards scanned in batches of ~9 cards (numbered folders, each with `Front.jpeg` + `Back.jpeg`).

This is the **local, no-auth v1**: upload, crop, back-align, AI extraction, and review all run on your machine. Data lives in `data/` (SQLite + image files), which stands in for Supabase Postgres/Storage until hosting is added. The schema mirrors the planned Supabase schema so migration is mechanical.

The production Supabase schema lives in `supabase/schema.sql` (tables, RLS, and the public `cards` storage bucket). Original scans stay local — only cropped card pairs and their metadata go to Supabase, via the Library tab's sync button (requires `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`).

## Setup

```bash
npm install
cp .env.local.example .env.local   # add your ANTHROPIC_API_KEY
npm run dev
```

Open http://localhost:3000 (redirects to `/admin/batches`).

## Workflow

1. **Batches** — pick the parent folder containing `1/`, `2/`, … Each batch needs `Front.jpeg`/`Back.jpeg` (case-insensitive, `.jpg` ok). A manifest shows what was found before uploading. DPI is read from EXIF/JFIF; missing DPI falls back to the project default (settings bar, top right). Portrait scans are rotated 90° at upload so scans, thumbnails, and cards are always landscape. Each batch card has a **Delete** button (removes the batch, its scans, and all exported card images).
2. **Align** (`1 · Align`) — front and back scans side by side, both auto-detected on load. If a whole scan reads upside-down, the **Flip front / Flip back / Flip both** buttons rotate the stored scan file(s) 180° — saved crops and 180° flags are transformed along with them. Backs are detected independently (scans can differ in canvas size when cards shift on the scanner bed) and matched to fronts by grid position, since cards were flipped in place. Boxes are fixed-size (drag/rotate only — all cards are standard index cards); selection is paired across the two panes. Adjust anything that detection missed, press `r` on a card whose back reads upside-down, then **Accept all** to save geometry and move on.
3. **Review cards** (`2 · Review cards`) — one card pair at a time in a viewfinder: the crop marks are fixed and axis-aligned, and you move the CARD under them (drag/nudge/rotate, 180° spin for upside-down faces). If a card was scanned back-up, **⇄ Swap F/B** (or `s`) swaps which scan becomes the front vs. back at export. Each pane shows exactly the export framing, with everything outside masked to black, and the previews at the bottom show exactly what will be saved. **Approve** exports both faces to `cards/{id}/` and auto-advances to the next unapproved card; when every pair is approved the batch is complete.
4. **Review** — "Extract all pending" runs Claude over front+back (2 concurrent, backoff on rate limits, running token/cost figure). Besides the verbatim transcription, extraction produces **ingredients** (lowercase tags, e.g. `flour, raisin`) and a **cleaned-up recipe** — the recipe rewritten in plain modern language as markdown (bulleted ingredients, numbered steps) with a Preview toggle in the form. Edit fields, `enter` approves and advances, `f` flips the image. **⇄ Swap front/back** fixes a card that was scanned back-up even after export: it swaps the exported `front.jpg`/`back.jpg` files on disk, the front/back transcriptions, and marks the card for re-sync. Approving, publishing, or swapping a card automatically pushes it to Supabase in the background (a status line under the sidebar buttons shows syncing/synced/failed); images are only re-uploaded when the exports changed.
5. **Library** — a gallery of every exported card pair. Click a card to flip it front/back; click its title to open the **card profile** — a per-card admin view with the flip image, batch/slug/sync facts, the full metadata form (works even for cards with no extraction yet — saving creates a manual one), a **Re-scan metadata (AI)** button (confirms before replacing human-reviewed data), and publish/unpublish. Saving marks the metadata reviewed and syncs the card to Supabase. Search filters by title, transcription, attribution, or batch number. The **Sync to Supabase** button pushes everything up: batches/cards/latest-extractions are upserted every time (cheap), and card images are uploaded only when their exports changed since the last sync (re-approving a card marks it for re-upload; "Force full re-upload" pushes every image). Deletions are not propagated — remove rows/objects in Supabase manually if you delete cards after syncing.

### Keyboard (align & card review)

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
| `ANTHROPIC_API_KEY` | required for `/api/extract` |
| `ANTHROPIC_MODEL` | optional, defaults to `claude-sonnet-4-6` |
| `DATA_DIR` | optional, defaults to `./data` |

## Test fixtures

`npm run make-test-scans` generates two synthetic batches (black background, light "cards" with slight skew, batch 2's backs rotated 180°) under `test-scans/` for exercising the pipeline without real scans.
