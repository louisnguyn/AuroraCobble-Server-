# Showing Asteryn Cobblemon SMP in Google Search

Google’s small round icon beside a result (like YouTube’s) comes from your **favicon** (`logo_icon.png`). The Frontend `index.html` and `site.webmanifest` are set up for that. Google may take days or weeks to refresh the icon after deploy.

## Why “asteryn” might not show your website yet

1. **Indexing** — Google must crawl and index your live site. A new or rarely linked site often does not appear immediately.
2. **Brand competition** — Other results (e.g. YouTube channels mentioning “Asteryn Cobblemon SMP”) can rank above you until your site has clear titles, descriptions, and backlinks.
3. **Missing public URL** — Search needs a stable HTTPS URL. Set `VITE_SITE_URL` in `apps/Frontend/.env` to that URL before `npm run build` so canonical links and `sitemap.xml` are correct.
4. **SPA / hash URLs** — The app uses hash routes (`#profile/...`). Google mainly indexes the homepage `/`; that is enough to appear for the brand if the homepage mentions **Asteryn Cobblemon SMP** in the title and description (already in `index.html`).

## What to do (recommended)

1. **Deploy** the Frontend to your public domain (HTTPS).
2. Copy `apps/Frontend/.env.example` → `.env` and set:
   ```env
   VITE_SITE_URL=https://your-real-frontend-domain.com
   ```
3. **Rebuild and redeploy** so `dist/` includes `sitemap.xml` and an updated `robots.txt`.
4. Open [Google Search Console](https://search.google.com/search-console), add your property (domain or URL prefix), verify ownership.
5. Submit your sitemap: `https://your-real-frontend-domain.com/sitemap.xml`
6. Use **URL inspection** → “Request indexing” for your homepage.
7. Link to the site from Discord, YouTube description, etc. so Google discovers it faster.

## Favicon tips (Google result icon)

- Use a **square** `logo_icon.png`, at least **48×48** (96×96 or 192×192 is better).
- Keep the mark **simple** — busy pixel art can look muddy when Google crops it to a circle.
- Do not block `/logo_icon.png` in `robots.txt`.

## Optional later improvements

- Custom domain with consistent branding
- Path-based routing instead of hash-only URLs for more indexable pages
- `WebSite` / `Organization` structured data if you add a stable site URL
