# Production checkout verification investigation — 2026-10-09

## Evidence

- The reported Georgian retry error comes from the API's Turnstile rejection branch, before `movio_place_order`; it is different from an origin rejection or database/stock error.
- Production request logs show three user checkout POSTs returning 403 on the previous revision. There were no verification details in those logs, so their exact Cloudflare error or action/hostname mismatch cannot be reconstructed.
- Live GET `/api/orders` returns 200. The public site key is a real-key format, not a known Cloudflare test key, and contains no surrounding whitespace. This does not prove that the server secret belongs to the same widget.
- The automated browser could not complete the real managed challenge; it submitted nothing.
- A deliberate invalid-token probe was safely rejected with HTTP 403. Sanitized server logs show `cloudflare-rejected` / `invalid-input-response`. That result belongs to the intentionally invalid probe, not proof of the original user's token failure. No order RPC or order write followed the failed verification.

## Deployed code fixes

Commit `8313715` adds allowlisted server rejection diagnostics and distinguishes configuration/provider failures from normal rejected challenges. Missing/invalid server secrets, provider internal/bad-request errors, HTTP failures and malformed/unreachable Siteverify responses return 503. Rejected tokens and action/hostname mismatches remain blocked. Strict success, `checkout` action and exact hostname validation are preserved.

Diagnostics log only a fixed event/reason, HTTP status and allowlisted Cloudflare error codes. They never log keys, tokens, customer data or raw upstream responses. Checkout token/payload persistence, database calls, prices, shipping, inventory and payment logic are unchanged.

API/HTTP/retry/browser/security/static SQL checks and the production build passed. One existing browser-test wait clicked before the product page initialized; it now waits for rendered detail state and the rerun passed. Live anonymous storefront/Admin smoke tests passed after deployment. No migrations or real orders were created.

## Remaining evidence required

A human-completed, fresh challenge is needed to identify the original failure. The local ignored file `tmp/turnstile-browser-diagnostic.js` can be run on the live cart after Success, without submitting the cart. It checks that a unique synthetic product is absent, uses only that nonpurchasable product and synthetic fields, and prints only status/error. The checked database contract rejects missing products before order insertion or stock changes. A 409 product-unavailable response proves verification passed without an order; a 403/503 permits the sanitized server log to identify the exact failing verification check. The diagnostic never prints the token or changes pending checkout storage; it resets the consumed widget afterward.

If the fresh-token log reports invalid-input-secret, correct the existing Vercel Production secret from the existing Cloudflare widget and redeploy. If it reports invalid-input-response, compare both keys against the same existing widget; do not assume a mismatch without that check. Action/hostname mismatches must be corrected at their source, never by relaxing verification. No key rotation, project creation, SQL rerun or CAPTCHA bypass is needed.

Production secrets were not retrieved. Automatic approval review rejected decrypted-secret retrieval and a temporary verification-only API mode. The mode was removed before deployment; the production API has no such mode. The original real-token root cause remains unverified pending the safe human diagnostic.
