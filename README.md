# ProtectAll Home — site clone

Static mirror of https://protectallhome.com/ pulled 2026-10-13.

- `site/` — 38 prerendered pages (`<path>/index.html`), React bundle `app.*.js`, `form-bridge.js`, `img/`, `fonts/`, `manifest.json`.
- `serve.py` — dev server (`python serve.py [port]`, default 8787). Maps `/path` → `/path/index.html` with no redirect; a trailing-slash redirect breaks the client router.
- `shots/` — verification screenshots.

Stack: Tailwind (compiled, inline `<style>` per page; tokens in `:root`), React 18 (hydrates prerendered HTML), fonts Plus Jakarta Sans + Instrument Serif (self-hosted in `fonts/`).

External deps still pointing at origin: Vimeo embeds, claim portals on `*.myprotectall.com`, form submission endpoint in `form-bridge.js`.
