# Hilo Negro website

## Production and pull requests

- GitHub Pages publishes the root of `main` at `www.hilonegro.com.mx`, as configured in `CNAME`. Merging into `main` deploys the production site.
- Every PR is **Red** and requires human review. Only JP merges. Agents must never push to `main`, merge a PR, or deploy the site.
- Work on a `codex/<task>` branch and open a draft PR after saving the verification evidence below. State in the PR that it is Red because merging deploys production.
- Keep secrets out of Git. Never commit credentials, tokens, private keys, or files containing them.

## Site structure and editing

- This is a static Spanish-language site with no build step or package manager. The homepage is `index.html` and the full menu is at `menu/index.html`.
- The site uses Tailwind 2.2.19 from a CDN, Font Awesome 6, and Montserrat. Use utility classes available in the shipped Tailwind stylesheet. There is no Tailwind config or JIT. Shared styles live in `css/hilo.css`, with additional inline styles on the pages. The mobile navigation and image viewer use `js/nav.js` and `js/visor.js`.
- Preserve the fixed navigation and section anchors when editing the homepage, including `#inicio`, `#promociones`, `#paquetes`, `#menu`, `#sucursales`, `#reservaciones`, and `#reseñas`. The hero background is set in CSS on `.hero-image`. Site images live in `images/`. Follow the existing paths and filename conventions.
- Reuse the markup of an adjacent card or section when editing repeated content. The homepage links to previews in the full menu. The menu page includes images and links to the PDFs in `menu/`.
- When an approved branch change affects multiple sections, check its location card, reservation card, the branch count, and any attributed reviews. Keep the location card’s address, hours, amenities, and map link accurate. Keep the display phone number and its `tel:+52…` link in sync. The link uses digits without spaces after the country code.

## Content rules

- Never leave `[PENDIENTE]` in published site content.
- Get JP’s explicit approval before editing `/privacidad`, `/terminos`, `/eliminar-cuenta`, or any legal text. Responsible party is **HN PIZZERIA VALLE**, RFC `HPV260908IQ0`, Parque Vía 198, Col. Cuauhtémoc, C.P. 06500, CDMX.
- Paquetes Navideños 2026 are valid November 23 through December 23, 2026, inclusive. The packages and their navigation links must automatically hide at 00:00 on December 24, 2026 in `America/Mexico_City`. Test both `/` and `/menu/` with `?simular-fecha=2026-11-23T00:00:00-06:00`, `?simular-fecha=2026-12-23T23:59:59-06:00`, and `?simular-fecha=2026-12-24T00:00:00-06:00`.
- Tlalpan closes Sundays at 11:00 PM. All other operating branches close Sundays at 9:00 PM. Get JP’s approval before changing any hours.
- Match menu copy and prices to the corresponding menu PDF. Reproduce the PDF’s spelling exactly, including typographical errors.
- Cuernavaca is not operating. If it is listed on a non-legal page, label it as not operating. If you remove the listing from a non-legal page, retain a note on that page stating that Cuernavaca is not operating.

## Proof required before opening a PR

1. Serve the repo root locally with `python3 -m http.server 8000 --bind 127.0.0.1` and open `http://127.0.0.1:8000/`.
2. Capture desktop and mobile screenshots of the affected pages. For documentation-only changes, verify that the locally served site renders as it did on the base commit.
3. Check navigation links, downloadable menus, branch hours, and prices against their sources. For holiday packages, check the simulated date boundary on both pages.
4. Run `git grep -n -I -F '[PENDIENTE]' -- . ':(exclude)*.md'` against tracked site files and record the result. Exit status 1 means no matches. Markdown documentation is excluded because it names the marker.
5. Run `scripts/verify.sh` once available and record the result.
6. Save the screenshots and command results. List the changed files and summarize the local serve check, screenshot evidence, link, hour and price checks, and grep output in the draft PR.
