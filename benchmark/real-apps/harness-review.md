# Independent review and boundaries

Reviewed by a GPT-6 Luna agent at extra-high reasoning; review findings were addressed before recording final catalog results.

- Uses the app's exact i18next version (drawDB 23.16.8, Memos 26.3.6).
- Uses explicit Vite 8.1.4 production bundling/minification; the earlier implicit import resolved the benchmark workspace's Vite 6 and was replaced before final results were recorded.
- Records immutable app commits, catalog hashes, compiler artifact hashes, explicit-locale equality checks, and selected-locale equality checks after transitions.
- Complete-catalog dynamic lookup deliberately keeps all messages reachable. This is isolated localization JS, not a production route's request graph.
- Memos loads locales lazily in production. Its full-catalog comparison is a stress test and excludes two plural keys symmetrically (92/41,998 locale/key values, 1,580/1,199,883 translation characters).
- Node translation timings exclude startup and are diagnostic only. The browser fixture is a separate experiment with fixture LCP; whole-app numbers are reported independently.
- The catalog converter handles a bounded text/interpolation subset and fails closed or explicitly excludes unsupported keys. It is not a supported migration converter.

The compiler changes preserve exported message signatures, runtime locale resolution, explicit locale options, fallback chains, markup parts, and middleware guards. A second review checked helper-omission metadata and server injection. The local two-turn agent task is recorded in `ax-eval.md`; it required no new flag or public API change.
