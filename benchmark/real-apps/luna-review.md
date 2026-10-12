# Independent review: `bdb8f54`

## Finding

I found no correctness defect in the static-text inlining change. It only inlines a locale message when it has exactly one variant and every pattern part is text. The generated dispatcher keeps the same exported function, locale lookup, explicit `options.locale`, and fallback behavior. Markup and multi-variant messages stay on message helpers.

The helper omission is limited to `message-modules`. The fallback analysis retains a compiled helper when a missing locale aliases it; the strict generated-JavaScript test covers a missing `de-AT` locale that falls back through `de`. Markup bundles retain their helpers because `.parts()` still needs them. The locale-specialized build path disables inlining, preserving its existing module-level tree shaking and source-map behavior. Middleware tests exercise the generated server injection path, while the locale-switch parity benchmark checks calls after selecting locales.

## Benchmark evidence

The checked-in results use Vite 8.1.4 production minification and report deterministic emitted bytes. Relative to the pre-change Paraglide output:

| Catalog                               |                           Gzip |                       Brotli |
| ------------------------------------- | -----------------------------: | ---------------------------: |
| DrawDB, 51 locales / 364 keys         |   438,209 → 324,783 B (−25.9%) | 254,236 → 208,589 B (−18.0%) |
| Memos, 46 locales / 911 included keys | 1,018,312 → 765,287 B (−24.9%) | 592,485 → 483,414 B (−18.4%) |

The results support a greater-than-10% reduction in compressed localization bytes versus the previous Paraglide output for these complete-catalog fixtures. They do not show the same margin versus i18next: after correcting the native comparator to preserve source hierarchy and key order, inline DrawDB remains 25.8% larger by gzip and effectively tied in Brotli (0.1% smaller); inline Memos is 1.1% larger by gzip and 2.1% larger by Brotli. Memos excludes two unsupported plural keys symmetrically.

The runner verifies every included key with explicit locales and checks selected-locale output after `setLocale()` transitions: 18,564 parity checks and 2,184 switch checks for DrawDB; 41,906 and 7,288 for Memos. The full-catalog fixture deliberately reaches every key; Memos also loads locales lazily in production. These are isolated minified localization bundles, so they do not establish a route-specific production payload or a page-load/LCP improvement. The committed result JSON contains byte counts, not browser timing results.

## Verification

I ran the focused tests from a detached worktree at `bdb8f54`:

```text
pnpm exec vitest run src/compiler/compile-bundle.test.ts src/compiler/compile-project.test.ts src/compiler/output-structure/message-modules.test.ts
3 files passed; 92 tests passed; 4 skipped
```

The run printed the existing warning that `customLocalFormatter` is unknown and ignored. It completed successfully. This review covers `bdb8f54` only; a later working-tree candidate was outside scope.

## Rejected experiment: locale lookup table candidate

The working-tree candidate adds a per-message object lookup when all six or more locale branches are static text. Its null-prototype compiler map and computed object keys handle special names such as `__proto__`; strict generated-JavaScript tests cover this, fallback behavior remains outside the table path, and static-locale/middleware builds are explicitly excluded. The candidate's focused tests passed: 95 tests passed, 4 skipped across the same three Vitest files. `git diff --check` also passed.

I ran the newly generated `table` output against the baseline for all 364 DrawDB messages. Both passed the default `setLocale()` sequence `en → de → en`; all outputs matched at each step, the explicit `{ locale: "de" }` override matched selected German while leaving the runtime on English, and the two actual locale changes requested normal document reloads. This probe used a small `window.location.reload()` stub, so it does not test a real browser navigation.

The measured incremental gain over the already-inline output is small: DrawDB improves 2.7% by gzip and 0.6% by Brotli; Memos improves 1.0% by gzip while Brotli grows 0.4%. This candidate does not add a qualifying page-level gain. Cumulatively, compared with the pre-inline Paraglide output, DrawDB is down 27.9% gzip / 18.5% Brotli and Memos is down 25.6% gzip / 18.1% Brotli, still using the isolated complete-catalog workload. Against i18next, table DrawDB is 23.0% larger by gzip and 0.4% smaller by Brotli; Memos is 4.6% smaller by gzip and 0.6% smaller by Brotli.

**Actionable compatibility defect (P2):** the emitted dispatcher calls `Object.hasOwn(texts, locale)` at runtime (the discarded `compile-bundle.ts` candidate). `Object.hasOwn` is an ES2022 API. The benchmark builds with `target: "esnext"`, and Vite/Rollup do not polyfill missing built-in methods when lowering syntax. The repository does not set a minimum browser/runtime version. I confirmed that the generated table message throws `TypeError: Object.hasOwn is not a function` when run with that method unavailable, while the pre-table output has no such dependency. Emit an older equivalent such as `Object.prototype.hasOwnProperty.call(texts, locale)` or declare and enforce an ES2022 minimum before shipping this code.

The table experiment was rejected and removed from the stack because it failed the metric gate; its runtime dependency is not present in the published literal-inlining change.

## Independent review: `3f61743`

### Guard and correctness

The layout guard is correct. `compileProject` opts into plain-text inlining only when `outputStructure` is `message-modules`; `locale-modules` retains the previous language-grouped helper references. The low-level `compileBundle` entry point now defaults to no inlining, preserving its previous behavior unless a layout caller explicitly opts in. The static per-locale build remains excluded. I found no fallback, markup, middleware, or generated-JavaScript correctness defect in this guard.

Coverage includes direct compile-bundle tests opting in to exercise literal output, a new low-level default-off assertion, an integration test for locale-modules retaining helpers, and the existing compile-project default message-modules test that verifies inlining and strict `checkJs`. I ran the focused suite from the clean `3f61743` worktree:

```text
pnpm exec vitest run src/compiler/compile-bundle.test.ts src/compiler/compile-project.test.ts src/compiler/output-structure/message-modules.test.ts
3 files passed; 94 tests passed; 4 skipped
```

The run emitted the existing warning that `customLocalFormatter` is unknown and ignored. It completed successfully.

### Benchmark claims

The layout audit supports the stated conclusion that locale-modules no longer takes the earlier gzip regression: guarded and main results have equal measured output sizes for both catalogs at all three levels. DrawDB is 1,245,504 raw / 298,846 gzip / 230,024 Brotli bytes; Memos is 2,874,195 / 754,598 / 548,248 bytes. The report JSON stores these size totals and a compiler-artifact hash, but no hash of the generated bundle itself. The README phrase “match main byte-for-byte in raw/gzip/Brotli” should therefore be tightened to “have matching emitted byte counts” unless generated-file equality is separately checked.

The benchmark documentation does not claim a greater-than-10% whole-app gain. It explicitly says the whole DrawDB gzip chunk remains 1.6% larger than native i18next, Brotli route transfer is effectively equal, and the local LCP samples show no improvement. The greater-than-10% result is correctly scoped to isolated complete-catalog localization bytes versus the earlier Paraglide output; the docs distinguish this from route payloads, lazy Memos loading, and field performance. The browser fixture's limited migration adapter and blocked external requests are also disclosed.

This review covers commit `3f61743` only; it does not review the later locale-tuple candidate in the shared working tree.
