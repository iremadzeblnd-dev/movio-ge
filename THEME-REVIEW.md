# MOVIO customer dark/light theme (local only)

## Changed files

New runtime assets: `theme.js`, `theme.css`, `movio-logo-light.svg`.
Customer page includes: `index.html`, `item.html`, `cart.html`, `contact.html`, `delivery.html`, `privacy.html`, `returns.html`, `terms.html`.
Checkout widget presentation: `orders.js` (theme choice only; request, token-validation, shipping, retry and payment logic unchanged).
New tests: `tests/theme.cjs`, `tests/theme-browser.cjs`.

Admin page, hidden entry, admin modal, Auth, credentials, permissions and Supabase mappings are not modified by this theme task. Pre-existing unrelated working-tree changes remain intact.

## Behavior

- One icon-only accessible native header button. Dark is the first-visit default, regardless of system preference.
- Preference is stored only as `movio-theme=dark|light`. A small head script restores it before styles render; blocked storage still permits switching during the visit.
- The existing dark palette and styles are preserved. Light mode uses shared token overrides plus scoped component exceptions for historical hardcoded colors; original product images remain untouched.
- Light logo uses the existing vector paths, with dark letters and the same lime M. Light text accents are darker green for contrast; lime remains on buttons and decorative accents.
- Switching updates the root data attribute, header icon and brand logo sources without navigation, catalog re-rendering or form replacement. Cross-tab preference changes are supported.
- The third-party checkout verification widget follows the selected theme by re-rendering only that widget, using its documented render/remove interface. Customer-entered checkout values and cart contents are retained. Reference: https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/
- Legacy category pages retain their existing redirects and restore the same preference on the homepage.

## Validation

`node tests/theme.cjs`: first-visit default, saved/invalid values, blocked storage, toggle accessible state, cross-tab changes, Admin exclusion; mock checkout verification follows theme.

`node tests/theme-browser.cjs`: local Chrome at 320, 375, 430 and 1280px, eight customer pages and four category redirects; dark body/hero/category/product/search colors compared to the same page without new theme assets; one toggle, no overflow, controls within viewport; light backgrounds/restoration; unchanged DOM nodes, customer inputs, checkout values and cart; search and customer modal; quantity/totals/stock; representative 4.5:1 text contrast. Local screenshots are in ignored `test-results/theme-light-*.png` and were visually inspected (homepage, detail, checkout and registration).

Existing regressions: hidden admin entry (375/1280), customer account (320/390/1280), cart quantities (320/390/600/601/768/1280), and checkout retry behavior. Auth/product services are mocked for these browser/unit tests. No real account/credential or order mutations are performed. These are Chrome viewport checks, not physical iPhone/Safari testing.

No Git push, Vercel deployment, database migration or security configuration change performed.

## Layout regression fix

Root cause: three shared sizing selectors used `img[src*="movio-logo-final.svg"]`. The theme script switches the source to `movio-logo-light.svg`, so the light logo lost those width/max-width rules. This affected header/footer geometry differently by viewport/page. All sizing declarations and specificity are now preserved using `img.movio-brand-image`; customer logo markup uses that stable class, and the theme painter selects it. No light-only dimension override is added.

A second reproduced side effect: theme-button clicks bubbled to the existing document outside-click handlers and closed search results. The theme button now stops propagation, preserving open UI when recoloring.

Removed the light-only outline-size/offset override and redundant color/focus rules. A CSS regression assertion restricts light-theme declarations to color/background/border-color/shadow/outline-color/color-scheme and color tokens. Logo dimensions, spacing, positions and typography belong to shared base styles.

Files changed for this fix: `styles.css`, `theme.css`, `theme.js`, the eight customer HTML pages (stable logo classes and versioned asset URLs), `tests/theme.cjs`, new `tests/theme-layout.cjs`, and this review. Admin, authentication, product data and order logic are not changed by this fix.

`node tests/theme-layout.cjs` compares every visible element's rectangle and layout/typographic properties on all eight customer pages at 320/375/430/768/1280px: immediate and settled repeated theme flips, light-mode refresh, open search, login and register modals. The source-dependent sizing regression is reproduced by removing the stable class before switching the logo asset. Existing theme persistence/cart, hidden-admin-entry and checkout-retry checks are also run. Tests use isolated mock products/Auth; no live writes or publication.
