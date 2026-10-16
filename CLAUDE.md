# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Marketing site for Hilo Negro, a pizzeria chain in Mexico City. It's a single static page (`index.html`, Spanish, `lang="es"`) served by **GitHub Pages** from the `main` branch root, on the custom domain in `CNAME` (`www.hilonegro.com.mx`). A push to `main` deploys.

There is no build step, no package manager, no tests and no JavaScript. To preview, open `index.html` in a browser or serve the folder:

```bash
python3 -m http.server 8000
```

## Structure

- Everything lives in `index.html`. Styling uses **Tailwind 2.2.19 from a CDN** (utility classes only, so there's no `tailwind.config` and no JIT; Tailwind 3-only classes won't work), plus Font Awesome 6 icons, the Montserrat font, and a small inline `<style>` block for the hover effects (`.menu-item`, `.location-card`, `.review-card`, `.promo-card`, `.nav-link`).
- The page is a set of anchor-linked `<section>`s that the fixed top nav jumps to: `#inicio` (hero), `#promociones`, an unnamed stats/about block, `#menu`, `#sucursales`, `#reservaciones`, `#reseñas`, then the footer.
- Images live in `images/` and are referenced by relative path (`images/<name>.jpg`, camelCase names). The hero background is set in CSS (`.hero-image`), not in an `<img>`.

## Editing content

The content is hand-written, repeated HTML blocks. When you add, remove or change something, copy the markup of an existing sibling block.

- **Menu item** (`#menu`): a `div.menu-item` card with an image, an `<h3>` name, a description and a `$NNN MXN` price.
- **Branch data is duplicated across the page.** When you add or remove a branch, update every place it appears:
  1. its `location-card` in `#sucursales` (address, hours, phone, amenity tags, `tel:` link, Google Maps link)
  2. its call card in `#reservaciones`
  3. the "Sucursales" count in the stats block
  4. any review in `#reseñas` attributed to that branch
- Phone numbers show up twice per branch: as display text (`+52 55 ...`) and as a `tel:+52...` href with no spaces.
