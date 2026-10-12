# Real i18next catalog experiments

These experiments run real catalog text through Paraglide's compiler and **Vite 8 production minification and tree shaking**, then check translation equality and count emitted JavaScript bytes after gzip/Brotli compression. Source-code shortening that Vite already performs does not count as an improvement.

The complete-catalog workload deliberately keeps every key reachable, so it measures isolated localization JS rather than a production page. DrawDB embeds all locales in production. Memos dynamically loads locales: its all-locales workload is a stress test, not an initial-page comparison. The runner fails closed on unsupported syntax; it excludes two plural keys from Memos on both sides. This adapter is benchmark scaffolding, not a supported i18next migration tool.

## Reproduce

Install this repository with the lockfile, run `pnpm run env-variables` and `pnpm exec tsc --build`. Install benchmark dependencies with `pnpm install --filter @inlang/paraglide-js-benchmark --frozen-lockfile`.

Check out these immutable inputs outside this repository:

- `drawdb-io/drawdb@351bd6050692d5b7d7fb50cc283ef90a19d817ea`; run `npm ci` there (i18next 23.16.8).
- `usememos/memos@a668bb8f7e3652be029459bc80bd3bffb86f0542`; the isolated runner needs only its catalogs. Run `npm install --prefix .real-apps/deps-memos --no-audit --no-fund --ignore-scripts i18next@26.3.6` from this repository.

```sh
node benchmark/real-apps/run.mjs drawdb /absolute/path/to/drawdb inline dist
node benchmark/real-apps/run.mjs memos /absolute/path/to/memos inline dist
```

Use the compiler at main `9446dd98ff578c96d76fe40b22be268bf7ac17ed` for the baseline. Build its `dist`, then copy that complete directory to `.real-apps/baseline-compiler` and provide that as the fourth argument:

```sh
node benchmark/real-apps/run.mjs drawdb /absolute/path/to/drawdb baseline .real-apps/baseline-compiler
node benchmark/real-apps/run.mjs memos /absolute/path/to/memos baseline .real-apps/baseline-compiler
```

Results include app SHA, catalog and compiler artifact SHA-256 hashes, actual i18next version, explicit-locale output parity, selected-locale parity after switching, emitted bytes, and raw timing rounds. Byte comparisons are deterministic for the same toolchain. Node call timings are diagnostic warm microbenchmarks; build/import/initialization time is outside that loop.

For a localization-only browser startup fixture:

```sh
pnpm --filter @inlang/paraglide-js-benchmark exec playwright install --only-shell chromium
node benchmark/real-apps/browser.mjs drawdb baseline inline
```

This serves real gzip response bodies, disables cache, uses fresh browser contexts, 1.6 Mbps download, 150 ms latency, and 4x CPU throttling. It alternates order for 13 rounds, discards two warm-ups, verifies visible output equality, and records raw rounds. Its LCP is **fixture LCP**, not the production application's LCP. Whole-app migrations and measured request graphs are reported separately; do not extrapolate a localization-byte improvement to an equally large whole-app improvement.

## User evidence driving the metrics

- [Paraglide #668](https://github.com/opral/paraglide-js/issues/668): shared message chunks delivering unrelated route translations.
- [Paraglide #88](https://github.com/opral/paraglide-js/issues/88): locale payloads and render/fetch waterfalls.
- [i18next #1318](https://github.com/i18next/i18next/issues/1318): shipped JS and parse/CPU cost.
- [i18next #1418](https://github.com/i18next/i18next/issues/1418): smaller locale-specific bundles.
- [i18next #2449](https://github.com/i18next/i18next/issues/2449): initialization work with large resources.

Compiler/build time reports in both projects were inspected, but SDK/Lix compilation changes are excluded from this experiment.
