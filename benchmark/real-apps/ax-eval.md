# Multi-turn agent-experience evaluation

## Turn 1: novice task

**Exact prompt**

> Here are generated messages and locale selection, reduce shipped JS without changing language-switch behavior.

**Actions taken**

I read the public README plus `docs/basics.md`, `docs/compiling-messages.md`, and `docs/strategy.md`. I inspected the harness-generated baseline message entry and one generated message module, but did not inspect compiler source or implementation details.

The docs make the ordinary usage path clear: call statically named functions such as `m.greeting()`, import `locales` and `setLocale` from the generated runtime, and let `setLocale()` perform its documented full document navigation. The docs explicitly describe `reload: false` as a narrow client-only escape hatch that does not update the app UI, URL, or document state. It is not a safe general optimization for a language picker.

The main shipped-JS footgun is a dynamic message lookup. The harness entry uses `m[map[key]](...)`, which makes all generated functions reachable to the bundler; direct calls such as `m.greeting()` are the documented tree-shaking-friendly pattern. This is a harness entry choice, not evidence that generated static calls cannot be tree-shaken. For an app that truly needs arbitrary runtime keys, replacing those calls with static message functions requires app call-site knowledge and should not be silently done by a compiler optimization.

**First-turn outcome**

No code change yet. Keep `setLocale()` and the configured strategy behavior intact. Before claiming a bundle reduction, build the actual app entry so the measurement reflects its reachable messages and locale-loading mode. The request does not identify a specific app entry or say whether arbitrary runtime message keys must continue to work, so I would ask for that boundary while independently checking the generated files and production build.

**Turn-1 assessment**

| Check                                                                   | Result                                                                                                                                                                                                        |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Can a novice find the normal message and locale APIs from the docs?     | Yes: the README and Basics examples show `m.key()`, `locales`, `getLocale()`, and `setLocale()`.                                                                                                              |
| Is the safe language-switch behavior obvious?                           | Yes: default `setLocale()` performs document navigation; the no-reload mode carries a prominent warning.                                                                                                      |
| Is a meaningful bundle-size footgun discoverable?                       | Yes: runtime-computed keys impede static message reachability and bundler pruning.                                                                                                                            |
| Can the prompt alone determine which application call sites may change? | No. The actual app entry and dynamic-key requirements need to be identified.                                                                                                                                  |
| Does Turn 1 imply a public API change?                                  | No change is needed for a compiler-only optimization that preserves generated message functions and `setLocale()`. App call-site rewrites might be needed if the desired optimization is static reachability. |

## Turn 2: integrate the proposed generated output

**Exact prompt**

> I changed the compiler so literal messages return their text directly; integrate this generated output without changing app language switching. Tell me any compiler flags or message call changes necessary, and compare en/de switching.

**Supplied files and actions**

The supplied generated output was DrawDB's `.real-apps/drawdb/baseline/paraglide` versus `.real-apps/drawdb/inline/paraglide`. I compared the same `k0` message and runtime. The baseline dispatcher calls `de_k0(inputs)` / `en_k0(inputs)`; the proposed dispatcher returns the corresponding string literal. Both retain the same exported message function, input/options signature, locale resolution (`experimentalStaticLocale ?? options.locale ?? getLocale()`), and runtime import. The generated app can consume the new output by regenerating its files; no compiler flag, import-path change, public API change, or message-call rewrite is required. Existing `setLocale()` behavior remains the mechanism for language switching.

I exercised all 364 included DrawDB messages after selecting `en` and `de` using `setLocale(locale, { reload: false })`; both variants returned identical strings for all 364 keys in each locale, and `getLocale()` reported the selected locale. A dynamic-input key also matched for `{ count: 7 }`. The harness now separately does explicit-locale parity and checks selected-locale output after transitions. Its switching checks are Node/runtime checks, not a real browser language-picker flow.

**Measured result and interpretation**

The build measurements are recorded separately in `results/drawdb-baseline.json` and `results/drawdb-inline.json`. They use Vite 8.1.4 production minification, the same pinned app/catalog hashes, and i18next 23.16.8. Gzip changes from 438,209 B to 324,783 B (25.9%); Brotli changes from 254,236 B to 208,589 B (18.0%). This is complete-catalog isolated localization JS. It does not establish a >40% production page-load advantage over i18next. This AX task evaluates API integration and selected-locale parity; it is a local multi-turn agent task, not a blinded comparison or a production language-picker test.

**Turn-2 assessment**

| Check                                                          | Result                                                                                                          |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Can the agent identify how to integrate the output?            | Yes: regenerate and use the same generated runtime/messages modules.                                            |
| Are new flags or message-call changes needed?                  | No. The ordinary exported message API and `setLocale()` remain unchanged.                                       |
| Does en/de switching preserve output?                          | Yes for all 364 strings in the Node/runtime check; a real browser language-picker interaction remains untested. |
| Is the size change backed by an actual minified build?         | Yes, using Vite 8.1.4 for the complete-catalog isolated-JS workload.                                            |
| Does this establish a >40% user-facing advantage over i18next? | No. It improves the previous Paraglide output but still loses to i18next on compressed bytes.                   |

No point in the task required hidden compiler knowledge, and no app API migration was needed. The dynamic message-map caveat from Turn 1 still matters for real app tree shaking; this all-catalog entry intentionally keeps every message reachable.
