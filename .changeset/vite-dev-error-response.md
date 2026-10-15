---
"@inlang/paraglide-js": minor
---

Add the opt-in `devErrorResponse` Vite plugin option to return HTTP 500 while translation compilation or configuration is invalid, and resume serving after recovery.

Wait for pending watch compilations when Vite closes, preventing writes after shutdown and interference with the next server in the same process.
