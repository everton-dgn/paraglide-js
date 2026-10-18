---
"@inlang/paraglide-js": patch
---

Reduce generated localization payloads by running the message body of messages with inputs, plurals and local variables inside the locale dispatcher instead of calling a function per locale. Missing-locale fallbacks, markup, middleware, and locale-specialized builds keep their message functions.
