# Product images in the local demo

The existing implementation stores an inline data URL in `products.image`, rather than uploading to a Supabase Storage bucket. This change reuses that infrastructure: `products.images` is an ordered `text[]` of image references, and `products.image` remains the selected main image for existing card, cart, and related-product renderers. The main image can be selected independently of gallery order.

Apply `supabase-product-images.sql` manually to an isolated test database before testing real persistence there. It adds a nullable column without modifying existing rows. Null arrays fall back to the legacy image; empty arrays represent intentionally removed images. Existing product Admin RLS and session requirements protect mutations. No Storage policies or buckets are required. The migration has not been executed.

The editor reads and decodes JPG, PNG, and WebP files, limits each file to 5 MiB, ignores repeated identical data URLs, and has no image-count limit. Batch preparation reports progress; database saving reports indeterminate progress. Images are added to the draft and become persistent only when the product is saved. Failed batches leave the image list unchanged; failed saves keep the draft available for retry. Removing an image removes its reference on save; there are no separately uploaded objects to delete.

Inline images increase database payload and catalog download size. There is no application image-count cap, but browser memory, database request limits, and available storage still apply. A dedicated Storage architecture would be a separate infrastructure change for larger catalogs. Authorization also depends on the existing `supabase-admin-security.sql` configuration; browser checks alone are not a security boundary.

Run `node tests/product-images.cjs` for browser tests against local mocked Supabase. Tests cover new/existing products, duplicate files, removal, reorder, selected main image, fresh database catalog reads, legacy products, denied unauthorized saves, gallery navigation and swipe at 375px and 1280px. No live database writes occur. Relevant existing regressions are `catalog-sync.cjs`, `catalog-global.cjs`, `admin-security.cjs`, and `product-delivery.cjs`.

The detail gallery wraps the image frame in `.detail-product-gallery`. Controls and thumbnails are siblings of the frame, because `.item-page-image` is absolutely positioned inside a fixed-height, clipped frame and would otherwise cover them. Browser checks test hit targets as well as navigation, repeat after a page reload, and verify an Admin save reaches a fresh detail page. The runner uses real browser timing to wait for asynchronous image decoding.

Optional: `node tests/product-images.cjs --saved-catalog` reads the active Supabase catalog with GET requests and tests saved three-image products locally. It never opens the Admin test or performs live writes.
