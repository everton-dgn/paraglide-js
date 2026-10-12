# Multi-turn agent-experience evaluation

## Turn 1: reduce generated JavaScript

**Prompt**

> Here are generated messages and locale selection; reduce shipped JavaScript without changing language-switch behavior.

**What I checked**

I read the public README and the Basics, Compiling Messages, and Strategy docs. I inspected the supplied DrawDB baseline output in `.real-apps/drawdb/baseline/paraglide`, including its `messages.js`, one generated message module, and `runtime.js`. I did not inspect compiler source or edit generated output.

The public API is easy to find: import message functions from `messages.js`, and `getLocale`, `locales`, and `setLocale` from `runtime.js`. The baseline keeps that same shape: `messages.js` re-exports per-message modules, while a module such as `messages/k0.js` exports `k0(inputs, options)` and dispatches using `options.locale` or `getLocale()`.

The generated `k0` module repeats a tiny helper function for every locale, then calls the selected helper from the dispatcher. That exposes a compiler-output opportunity: static one-variant text can be returned directly from its locale branch while keeping the exported message function, its locale option, and runtime locale lookup. It needs no app call-site rewrite. I found no documented compiler flag for requesting this optimization.

The docs also explain when app call sites affect tree shaking: direct static calls such as `m.greeting()` are preferred; runtime-computed message keys cannot be resolved, and an explicit map of known message functions preserves static references. The supplied generated files do not identify the app entry or its call sites, so I cannot tell which messages are actually reachable on a production page or claim a page-level byte reduction from this baseline alone.

For language switching, I would leave `setLocale()` and the configured strategies intact. The docs say its default behavior updates the configured strategy and performs a full document navigation or reload. `setLocale(locale, { reload: false })` is a narrow client-only escape hatch and would change the user-visible switching contract for typical URL-routed or hydrated apps.

**Turn 1 outcome**

No files changed. The generated output suggests a compiler-only optimization that preserves the public message and locale APIs. To verify shipped bytes for an application, I need its production entry/build and any requirement to support runtime-computed keys; the complete-catalog fixture does not answer which messages a real page uses.

| Check                                                         | Result                                                                                        |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Can I find the message and locale APIs from public docs?      | Yes.                                                                                          |
| Is the default language-switch behavior clear?                | Yes: `setLocale()` navigates or reloads by default.                                           |
| Is an output-only optimization visible from generated output? | Yes: static text branches call locale helpers that only return literal strings.               |
| Is an app call-site rewrite justified by the supplied files?  | No; no production entry or dynamic-key requirement is included.                               |
| Can this turn establish a production page-load improvement?   | No; the supplied catalog output does not establish the application's reachable-message graph. |

## Turn 2: integrate regenerated output

**Prompt**

> The compiler now returns literal text directly. Integrate the regenerated messages without changing language switching; are any new compiler flags or message-call changes needed? Verify en→de→en and an explicit locale override.

**Actions and executable probe**

I compared the supplied `baseline/paraglide` and `inline/paraglide` generated directories, using their `messages.js` and `runtime.js`, plus the `mapping.json` and `inputs.json` beside each output. Both mapping/input files matched. I did not inspect compiler source or edit application code.

I ran a Node ESM probe against all 364 exported messages in both builds. Before importing each runtime, the probe supplied a small `window.location` stub so the generated runtime selected its browser path and its normal `setLocale(locale)` behavior could be observed. It called `setLocale("en")`, collected all outputs, switched to `de`, collected them again, returned to `en`, and compared the restored outputs. Then, while the selected locale was `en`, it called every message with `{ locale: "de" }` and checked both the German outputs and that the runtime locale stayed `en`.

**Transcript/result**

```text
baseline: 364 messages passed en→de→en; explicit de passed while runtime remained en
inline: 364 messages passed en→de→en; explicit de passed while runtime remained en
baseline/inline parity passed for 364 messages in all phases; default setLocale requested 4 reloads
```

The four reload requests are two actual locale changes for each generated runtime (`en→de` and `de→en`). The explicit override requested no reload and did not change the selected locale. The baseline and regenerated outputs matched for all 364 messages in English, German, English again, and explicit German override.

**Integration assessment and limits**

No new compiler flag, import-path change, or message-call change is needed. Keep the generated `messages.js` and `runtime.js` imports and existing `m.key(inputs)` calls; regenerate the files and rebuild. The output change preserves the exported message functions and reads the same selected locale through the generated runtime. Use the normal `setLocale()` behavior for the app's existing language switch.

The probe executed the generated outputs, but its reload stub records the navigation request instead of opening a browser or rerendering DrawDB. It establishes generated-function parity and the default runtime's locale update/reload requests, not a full browser language-picker interaction or production page-load measurement.
