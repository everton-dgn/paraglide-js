# Independent output and benchmark audit

This audit targets the compiler at `bdb8f54d9448e0673513fcf5227124a7b04c405e` (static literal inlining), compared with main `9446dd98ff578c96d76fe40b22be268bf7ac17ed`. The pinned DrawDB input is `351bd6050692d5b7d7fb50cc283ef90a19d817ea`, Vite is 8.1.4, and the runner records Node 22.23.2. I did not edit compiler source.

## Findings

Static literal inlining is output-structure dependent. I ran the same complete DrawDB catalog through the compiler at both commits, changing only `outputStructure` and using the existing post-Vite runner. The locale-modules path saves raw bytes and Brotli bytes but regresses gzip; the message-modules path improves all three measures.

| Structure         | Compiler  |         Raw |      Gzip |    Brotli |
| ----------------- | --------- | ----------: | --------: | --------: |
| `message-modules` | main      | 1,245,504 B | 438,209 B | 254,236 B |
| `message-modules` | `bdb8f54` | 1,006,046 B | 324,783 B | 208,589 B |
| `locale-modules`  | main      | 1,245,504 B | 298,846 B | 230,024 B |
| `locale-modules`  | `bdb8f54` | 1,006,046 B | 310,518 B | 205,974 B |

For `message-modules`, the change saves 19.2% raw, 25.9% gzip, and 18.0% Brotli. For `locale-modules`, it saves 19.2% raw and 10.5% Brotli, but gzip grows 3.9%. Against i18next's 1,067,257 raw / 258,253 gzip / 208,875 Brotli, the inline `message-modules` result is 5.7% smaller raw, 25.8% larger gzip, and effectively tied in Brotli (−0.1%). In `locale-modules`, it is 20.2% larger by gzip and 1.4% smaller by Brotli.

The isolated-bundle discrepancy follows the emitted layout. In `message-modules`, each static message still has a dispatcher with a branch per locale; the optimization removes helper calls and helper bodies, but it does not turn the repeated locale branches into a shared lookup. In `locale-modules`, translations are grouped by locale, which gives gzip better local repetition before this change. Vite already minifies both layouts; changing source formatting alone is not the opportunity. A compiler data-layout change can alter which repeated bytes are adjacent to each other.

I prototyped one such layout using the same DrawDB data: store the 313 static messages as locale-major rows, use one shared locale-to-index map, and retain the existing generated functions for the 51 interpolated messages. Vite 8.1.4 emitted 860,322 raw / 241,537 gzip / 183,135 Brotli bytes, versus the `bdb8f54` message-modules result above: -14.5% raw, -25.6% gzip, and -12.2% Brotli. I compared outputs for all 364 keys in all 51 locales (18,564 checks) against the generated `bdb8f54` functions; they matched. This is a bounded output-shape prototype, not a compiler patch or production-app build. It does not cover sparse catalogs, fallback chains, markup, plural/select variants, static-locale builds, or function metadata such as `.parts()`; compiler tests would need to establish those before adoption.

## Page-load denominator

The complete-catalog runner deliberately makes all keys reachable, so its byte totals are isolated localization JavaScript. It does not represent the payload of a real route. DrawDB's production-shaped browser fixture gives the route denominator:

| Route     | Variant          | Median FCP | Median LCP | Brotli response bytes |
| --------- | ---------------- | ---------: | ---------: | --------------------: |
| `/`       | native i18next   |   2,344 ms |   3,156 ms |           3,353,096 B |
| `/`       | Paraglide main   |   2,480 ms |   3,292 ms |   3,430,323 B (+2.3%) |
| `/`       | Paraglide inline |   2,348 ms |   3,172 ms |  3,351,691 B (-0.04%) |
| `/editor` | native i18next   |   2,352 ms |   2,612 ms |           2,857,160 B |
| `/editor` | Paraglide main   |   2,472 ms |   2,708 ms |   2,934,387 B (+2.7%) |
| `/editor` | Paraglide inline |   2,488 ms |   2,728 ms |  2,855,755 B (-0.05%) |

The browser fixture has nine observations per summary (three locales × three passes), blocks external origins, and uses an SPA fallback, Brotli quality 4, 80 ms RTT, 20 Mbps down, and 3× CPU throttling. It checks visible-text parity on `/` and `/editor` for en, de, and pa-PK; all 36 native-versus-Paraglide comparisons matched. The fixture is not field Core Web Vitals, and it does not justify reading the small median LCP differences as a performance win. The landing page's blocked GitHub star-count request also differs from production behavior.

Even a hypothetical removal of the entire isolated inline catalog's 208.6 KB Brotli payload would be about 6.2% of the landing route's measured 3.35 MB transfer. The locale-major prototype's 25.5 KB Brotli reduction from inline is about 0.8% of that route, before confirming the prototype in the actual app build. So the prototype clears a >10% **catalog** threshold, but DrawDB evidence does not support a >10% **page-load bytes** claim. Memos is only an all-locales stress workload in these experiments; its production locale loading is lazy, and these results are not initial-page evidence.

## Recommendation and evidence limits

Gate the static inlining pass on output structure in `compileProject`: enable it for `message-modules`, the structure documented as production-preferred, and leave `locale-modules` at its current data shape. Pass an explicit internal option into `compileBundle` with a default of `false` so its standalone/test API keeps current behavior unless a caller opts in; `compileProject` can make the structure-aware choice. Do not infer a production build from an unrelated runtime or add an environment-mode check when the compiler already has `outputStructure`.

The `bdb8f54` focused tests pass in a detached worktree: `compile-bundle`, `compile-project`, and `message-modules` suites, 92 passed and 4 skipped. The DrawDB runner also passed 18,564 explicit-locale checks and 2,184 selected-locale checks for the structure comparison. The locale-major prototype's 18,564 checks compare to `bdb8f54`, not directly to i18next.

The AX files are task simulations and generated-output probes, not user studies. They show that a local task runner could understand how to regenerate and call the messages, and that the tested functions returned equal strings. They do not show that teams want to migrate from i18next, that migration is easier in practice, or that users prefer either library. Do not use them to support migration-desire or accessibility claims.

The i18next adapters are bounded benchmark scaffolding. DrawDB supports its current simple interpolation and an explicit map for computed menu keys; it does not implement the full i18next API. The Memos run excludes two plural keys on both sides and keeps all locales reachable despite production's lazy loading. No result here establishes general migration parity or an app-wide performance guarantee.

The isolated native comparator was subsequently corrected to retain each catalog's source hierarchy and key order. Native comparison values above reflect that correction; Paraglide-before/after and actual whole-app measurements are unchanged.
