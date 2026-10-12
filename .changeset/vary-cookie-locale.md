---
"@inlang/paraglide-js": patch
---

Include `Cookie` in redirect `Vary` headers when the route uses the cookie strategy. Responses from `resolve` also vary by `Cookie` or `Accept-Language` when those preferences come before a URL locale or the URL does not supply a locale. Existing fields are kept without adding duplicates, and `Vary: *` is unchanged.

With the default strategy, HTTP responses now include `Vary: Cookie`. Shared caches that honor `Vary` distinguish responses by the full Cookie header, which can reduce cache reuse. Mutable responses retain their identity; network error responses are passed through unchanged.
