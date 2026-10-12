# DrawDB production-shaped A/B

This compares DrawDB at pinned source commit `351bd6050692d5b7d7fb50cc283ef90a19d817ea` with native i18next 23.16.8, a generated Paraglide baseline, and the inline-output candidate. The fixture builds from a temporary `git archive`, so it leaves the public app checkout unchanged.

Build main `9446dd9` and copy its complete `dist` to `.real-apps/baseline-compiler`; build the literal-inlining change `bdb8f54` and copy its `dist` to `.real-apps/inline-compiler`. Install the pinned DrawDB lockfile dependencies as described in `README.md`. Run from the Paraglide repository root:

```sh
node benchmark/real-apps/run.mjs drawdb ../i18n-app-drawdb baseline .real-apps/baseline-compiler
node benchmark/real-apps/run.mjs drawdb ../i18n-app-drawdb inline .real-apps/inline-compiler
node benchmark/real-apps/migrate-drawdb.mjs
node benchmark/real-apps/drawdb-browser.mjs
```

The browser run uses headless Chromium, fresh contexts with cache disabled, 80 ms simulated RTT, 20 Mbps down / 2 Mbps up, 3× CPU throttling, and a fixed 1.5 s post-render sample. It runs three passes and rotates variant order. Each summary is the median of nine observations (three locales × three passes). The local server uses Brotli quality 4 and an SPA fallback. Browser-visible text matched exactly for en, de, and pa-PK on `/` and `/editor` in all 36 native-versus-Paraglide comparisons.

| Route     | Variant                      | Median FCP | Median LCP |      Brotli transfer |
| --------- | ---------------------------- | ---------: | ---------: | -------------------: |
| `/`       | native i18next               |   2,344 ms |   3,156 ms |          3,353,096 B |
| `/`       | Paraglide generated baseline |   2,480 ms |   3,292 ms |  3,430,323 B (+2.3%) |
| `/`       | Paraglide inline             |   2,348 ms |   3,172 ms | 3,351,691 B (-0.04%) |
| `/editor` | native i18next               |   2,352 ms |   2,612 ms |          2,857,160 B |
| `/editor` | Paraglide generated baseline |   2,472 ms |   2,708 ms |  2,934,387 B (+2.7%) |
| `/editor` | Paraglide inline             |   2,488 ms |   2,728 ms | 2,855,755 B (-0.05%) |

The full minified main chunk is roughly 17 MB raw. In the build report's Node gzip measurement, the native, generated-baseline, and inline variants were respectively 17,167,621 / 17,276,158 / 17,048,304 raw bytes and 3,141,919 / 3,299,536 / 3,190,801 gzip bytes. The inline result is 1.6% larger than native by this whole-chunk gzip measure; the generated baseline is 5.0% larger. This does not establish a user-facing performance improvement.

## Integration limits

The adapter rewrites literal `t("key", variables)` and `i18n.t("key", variables)` calls to named generated imports, preserving tree-shaking. A finite map handles the app's computed menu keys. The i18next bridge keeps DrawDB's locale metadata and its current query/cookie/localStorage/sessionStorage/navigator detection order, exposes `language`, `resolvedLanguage`, `changeLanguage`, and React subscription through `useTranslation`.

This is a bounded DrawDB compatibility fixture, not an i18next replacement. It only models the app's current simple `{{variable}}` interpolation and enumerated computed keys; it does not model general i18next namespaces, key prefixes, fallback chains, plural/context rules, `defaultValue`, object returns, plugins, or its full event API. The browser fixture blocks all external origins, including DrawDB's GitHub star-count request, which produces a Network Error on the landing page. Consequently these are repeatable lab comparisons, not field Core Web Vitals or a production CDN measurement.

Current evidence does not show a >10% improvement on a user-facing metric in this app. Inline output removes most of the generated-baseline size regression, but the whole-app gains are effectively zero and LCP is slightly slower in these samples. Catalog-only compression results must be reported separately from these whole-app measurements.
