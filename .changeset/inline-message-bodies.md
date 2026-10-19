---
"@inlang/paraglide-js": patch
---

Reduce generated localization payloads by running the message body of messages with inputs, plurals and local variables inside the locale dispatcher instead of calling a function per locale. Messages that a missing-locale fallback calls, markup messages and per-locale builds keep their message functions. Middleware behavior and the injected server message functions are preserved.
