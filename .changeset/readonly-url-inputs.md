---
"@inlang/paraglide-js": patch
---

Accept readonly URL inputs, including SvelteKit 3's `page.url`, in `localizeUrl` and `deLocalizeUrl`. URL-like inputs are normalized to native URLs so unmatched routes still return a mutable `URL`.
