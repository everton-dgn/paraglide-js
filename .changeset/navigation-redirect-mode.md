---
"@inlang/paraglide-js": minor
---

Add `redirect: "navigation"` to `paraglideMiddleware` for GET and HEAD clients that omit `Sec-Fetch-Dest` but accept HTML. In this mode, form POST requests pass through to the resolve callback. The default `"document"` mode keeps its existing redirect behavior.

The new mode adds `Vary` fields when needed to keep cached redirects and resolved responses separate. Eligible callback responses are rebuilt when those fields are missing.
