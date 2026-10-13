import { test, expect, describe, beforeAll, vi } from "vitest";
import { createParaglide } from "../create-paraglide.js";
import { newProject } from "@inlang/sdk";

test("sets the locale and origin", async () => {
	const runtime = await createParaglide({
		blob: await newProject({
			settings: {
				baseLocale: "en",
				locales: ["en", "de", "fr"],
			},
		}),
		strategy: ["url", "globalVariable"],
	});

	// setting the global variable to fr to assure that
	runtime.setLocale("fr");

	// simulating multiple requests that could interfere with each other
	await Promise.all([
		runtime.paraglideMiddleware(
			new Request(new URL("https://example.com/page"), {
				headers: { "Sec-Fetch-Dest": "document" },
			}),
			() => {
				expect(runtime.getLocale()).toBe("en");
				expect(runtime.getUrlOrigin()).toBe("https://example.com");
				return new Response();
			}
		),
		runtime.paraglideMiddleware(
			new Request(new URL("https://peter.com/de/page"), {
				headers: { "Sec-Fetch-Dest": "document" },
			}),
			() => {
				expect(runtime.getLocale()).toBe("de");
				expect(runtime.getUrlOrigin()).toBe("https://peter.com");
				return new Response();
			}
		),
	]);

	// global variable is not impacted by middleware
	expect(runtime.getLocale()).toBe("fr");
});

test("delocalizes the url if the url strategy is used and returns the locale", async () => {
	const runtime = await createParaglide({
		blob: await newProject({
			settings: {
				baseLocale: "en",
				locales: ["en", "de"],
			},
		}),
		strategy: ["url"],
	});

	const request = new Request(new URL("https://example.com/de/page"), {
		headers: { "Sec-Fetch-Dest": "document" },
	});

	const result = await runtime.paraglideMiddleware(request, (args) => {
		expect(args.locale).toBe("de");
		expect(args.request.url).toBe("https://example.com/page");
		return new Response("Hello World");
	});

	expect(await result.text()).toBe("Hello World");
});

test("does not delocalize the url if the url strategy is not used", async () => {
	const runtime = await createParaglide({
		blob: await newProject({
			settings: {
				baseLocale: "en",
				locales: ["en", "de"],
			},
		}),
		strategy: ["globalVariable", "baseLocale"],
	});

	const request = new Request(new URL("https://example.com/de/page"), {
		headers: { "Sec-Fetch-Dest": "document" },
	});

	const result = await runtime.paraglideMiddleware(request, (args) => {
		expect(args.locale).toBe("en");
		expect(args.request.url).toBe("https://example.com/de/page");
		return new Response("Hello World");
	});

	expect(await result.text()).toBe("Hello World");
});

test("skips i18n middleware behavior for excluded routeStrategies", async () => {
	const runtime = await createParaglide({
		blob: await newProject({
			settings: {
				baseLocale: "en",
				locales: ["en", "fr"],
			},
		}),
		strategy: ["cookie", "url", "baseLocale"],
		cookieName: "PARAGLIDE_LOCALE",
		routeStrategies: [{ match: "/api/:path(.*)?", exclude: true }],
	});

	const request = new Request("https://example.com/api/data", {
		headers: {
			cookie: "PARAGLIDE_LOCALE=fr",
			"Sec-Fetch-Dest": "document",
		},
	});

	const response = await runtime.paraglideMiddleware(
		request,
		({ locale, request }) => new Response(`${locale}|${request.url}`)
	);

	expect(response.status).toBe(200);
	expect(await response.text()).toBe("en|https://example.com/api/data");
});

test("localized URLs still match routeStrategies after delocalization", async () => {
	const runtime = await createParaglide({
		blob: await newProject({
			settings: {
				baseLocale: "en",
				locales: ["en", "fr"],
			},
		}),
		strategy: ["url", "cookie", "baseLocale"],
		cookieName: "PARAGLIDE_LOCALE",
		routeStrategies: [
			{
				match: "/dashboard/:path(.*)?",
				strategy: ["cookie", "baseLocale"],
			},
			{ match: "/api/:path(.*)?", exclude: true },
		],
	});

	const dashboard = await runtime.paraglideMiddleware(
		new Request("https://example.com/fr/dashboard", {
			headers: { cookie: "PARAGLIDE_LOCALE=en" },
		}),
		({ locale }) => new Response(locale)
	);
	expect(await dashboard.text()).toBe("en");

	const api = await runtime.paraglideMiddleware(
		new Request("https://example.com/fr/api/data", {
			headers: { cookie: "PARAGLIDE_LOCALE=fr" },
		}),
		({ locale, request }) => new Response(`${locale}|${request.url}`)
	);
	expect(await api.text()).toBe("en|https://example.com/fr/api/data");
});

test("excluded routeStrategies keep request-scoped locale context and clone request when possible", async () => {
	const runtime = await createParaglide({
		blob: await newProject({
			settings: {
				baseLocale: "en",
				locales: ["en", "fr"],
			},
		}),
		strategy: ["globalVariable", "baseLocale"],
		routeStrategies: [{ match: "/api/:path(.*)?", exclude: true }],
	});

	runtime.setLocale("fr");
	const originalRequest = new Request("https://example.com/api/data", {
		headers: { "Sec-Fetch-Dest": "document" },
	});

	const response = await runtime.paraglideMiddleware(
		originalRequest,
		({ locale, request }) => {
			expect(locale).toBe("en");
			expect(runtime.getLocale()).toBe("en");
			expect(runtime.getUrlOrigin()).toBe("https://example.com");
			expect(request).not.toBe(originalRequest);
			expect(request.url).toBe("https://example.com/api/data");
			return new Response("ok");
		}
	);

	expect(await response.text()).toBe("ok");
	expect(runtime.getLocale()).toBe("fr");
});

test("excluded routeStrategies fall back to original request when cloning fails", async () => {
	const runtime = await createParaglide({
		blob: await newProject({
			settings: {
				baseLocale: "en",
				locales: ["en", "de"],
			},
		}),
		strategy: ["globalVariable", "baseLocale"],
		routeStrategies: [{ match: "/api/:path(.*)?", exclude: true }],
	});

	const customRequest = {
		url: "https://example.com/api/data",
		headers: new Headers({ "Sec-Fetch-Dest": "document" }),
		method: "GET",
	} as unknown as Request;

	const response = await runtime.paraglideMiddleware(
		customRequest,
		({ locale, request }) => {
			expect(locale).toBe("en");
			expect(request).toBe(customRequest);
			return new Response("ok");
		}
	);

	expect(await response.text()).toBe("ok");
});

test("excluded routeStrategies preserve original request body readability", async () => {
	const runtime = await createParaglide({
		blob: await newProject({
			settings: {
				baseLocale: "en",
				locales: ["en", "de"],
			},
		}),
		strategy: ["globalVariable", "baseLocale"],
		routeStrategies: [{ match: "/api/:path(.*)?", exclude: true }],
	});

	const originalRequest = new Request("https://example.com/api/data", {
		method: "POST",
		body: "hello=world",
		headers: {
			"Content-Type": "application/x-www-form-urlencoded",
			"Sec-Fetch-Dest": "document",
		},
	});

	const response = await runtime.paraglideMiddleware(
		originalRequest,
		async ({ request }) => {
			expect(await request.text()).toBe("hello=world");
			return new Response("ok");
		}
	);

	expect(await response.text()).toBe("ok");
	expect(await originalRequest.text()).toBe("hello=world");
});

test("routeStrategies layering is first-match-wins when exclude comes first", async () => {
	const runtime = await createParaglide({
		blob: await newProject({
			settings: {
				baseLocale: "en",
				locales: ["en", "fr"],
			},
		}),
		strategy: ["cookie", "url", "baseLocale"],
		cookieName: "PARAGLIDE_LOCALE",
		routeStrategies: [
			{ match: "/api/:path(.*)?", exclude: true },
			{ match: "/api/:path(.*)?", strategy: ["cookie", "baseLocale"] },
		],
	});

	const request = new Request("https://example.com/api/data", {
		headers: {
			cookie: "PARAGLIDE_LOCALE=fr",
			"Sec-Fetch-Dest": "document",
		},
	});

	const response = await runtime.paraglideMiddleware(
		request,
		({ locale, request }) => new Response(`${locale}|${request.url}`)
	);

	expect(response.status).toBe(200);
	expect(await response.text()).toBe("en|https://example.com/api/data");
});

test("routeStrategies layering is first-match-wins when strategy comes first", async () => {
	const runtime = await createParaglide({
		blob: await newProject({
			settings: {
				baseLocale: "en",
				locales: ["en", "fr"],
			},
		}),
		strategy: ["cookie", "url", "baseLocale"],
		cookieName: "PARAGLIDE_LOCALE",
		routeStrategies: [
			{ match: "/api/:path(.*)?", strategy: ["cookie", "baseLocale"] },
			{ match: "/api/:path(.*)?", exclude: true },
		],
	});

	const request = new Request("https://example.com/api/data", {
		headers: {
			cookie: "PARAGLIDE_LOCALE=fr",
			"Sec-Fetch-Dest": "document",
		},
	});

	const response = await runtime.paraglideMiddleware(
		request,
		({ locale, request }) => new Response(`${locale}|${request.url}`)
	);

	expect(response.status).toBe(200);
	expect(await response.text()).toBe("fr|https://example.com/api/data");
});

test("redirects to localized URL when non-URL strategy determines locale", async () => {
	const runtime = await createParaglide({
		blob: await newProject({
			settings: {
				baseLocale: "en",
				locales: ["en", "fr"],
			},
		}),
		strategy: ["cookie", "url"],
		cookieName: "PARAGLIDE_LOCALE",
		urlPatterns: [
			{
				pattern: "https://example.com/:path(.*)?",
				localized: [
					["en", "https://example.com/en/:path(.*)?"],
					["fr", "https://example.com/fr/:path(.*)?"],
				],
			},
		],
	});

	// Request to URL in en with cookie specifying French
	const request = new Request("https://example.com/en/some-path", {
		headers: {
			cookie: `PARAGLIDE_LOCALE=fr`,
			"Sec-Fetch-Dest": "document",
		},
	});

	const response = await runtime.paraglideMiddleware(request, () => {
		// This shouldn't be called since we should redirect
		throw new Error("Should not reach here");
	});

	expect(response instanceof Response).toBe(true);
	// needs to be 307 status code https://github.com/opral/inlang-paraglide-js/issues/416
	expect(response.status).toBe(307); // Redirect status code
	expect(response.headers.get("Location")).toBe(
		"https://example.com/fr/some-path"
	);
});

test("call onRedirect callback when redirecting to new url", async () => {
	const runtime = await createParaglide({
		blob: await newProject({
			settings: {
				baseLocale: "en",
				locales: ["en", "fr"],
			},
		}),
		strategy: ["cookie", "url"],
		cookieName: "PARAGLIDE_LOCALE",
		urlPatterns: [
			{
				pattern: "https://example.com/:path(.*)?",
				localized: [
					["en", "https://example.com/en/:path(.*)?"],
					["fr", "https://example.com/fr/:path(.*)?"],
				],
			},
		],
	});

	// Request to URL in en with cookie specifying French
	const request = new Request("https://example.com/en/some-path", {
		headers: {
			cookie: `PARAGLIDE_LOCALE=fr`,
			"Sec-Fetch-Dest": "document",
		},
	});

	let response: any;

	await runtime.paraglideMiddleware(
		request,
		() => {
			// This shouldn't be called since we should redirect
			throw new Error("Should not reach here");
		},
		{
			onRedirect: (res: Response) => {
				response = res;
			},
		}
	);

	expect(response instanceof Response).toBe(true);
	// needs to be 307 status code https://github.com/opral/inlang-paraglide-js/issues/416
	expect(response.status).toBe(307); // Redirect status code
	expect(response.headers.get("Location")).toBe(
		"https://example.com/fr/some-path"
	);
});

test("uses the provided public url for redirects behind a proxy", async () => {
	const runtime = await createParaglide({
		blob: await newProject({
			settings: {
				baseLocale: "en",
				locales: ["en", "fr"],
			},
		}),
		strategy: ["cookie", "url"],
		cookieName: "PARAGLIDE_LOCALE",
		urlPatterns: [
			{
				pattern: "https://example.com/:path(.*)?",
				localized: [
					["en", "https://example.com/en/:path(.*)?"],
					["fr", "https://example.com/fr/:path(.*)?"],
				],
			},
		],
	});

	const request = new Request("http://internal.example.com/en/some-path", {
		headers: {
			cookie: `PARAGLIDE_LOCALE=fr`,
			"Sec-Fetch-Dest": "document",
		},
	});

	const response = await runtime.paraglideMiddleware(
		request,
		() => {
			throw new Error("Should not reach here");
		},
		{
			effectiveRequestUrl: "https://example.com/en/some-path",
		}
	);

	expect(response.status).toBe(307);
	expect(response.headers.get("Location")).toBe(
		"https://example.com/fr/some-path"
	);
});

test("uses the provided public url for callback request and origin", async () => {
	const runtime = await createParaglide({
		blob: await newProject({
			settings: {
				baseLocale: "en",
				locales: ["en", "fr"],
			},
		}),
		strategy: ["url", "baseLocale"],
		urlPatterns: [
			{
				pattern: "https://example.com/:path(.*)?",
				localized: [
					["en", "https://example.com/en/:path(.*)?"],
					["fr", "https://example.com/fr/:path(.*)?"],
				],
			},
		],
	});

	const request = new Request("http://internal.example.com/fr/some-path", {
		headers: {
			"Sec-Fetch-Dest": "document",
		},
	});

	const response = await runtime.paraglideMiddleware(
		request,
		({ request }) => {
			expect(runtime.getUrlOrigin()).toBe("https://example.com");
			return new Response(request.url);
		},
		{
			effectiveRequestUrl: "https://example.com/fr/some-path",
		}
	);

	expect(await response.text()).toBe("https://example.com/some-path");
});

test("sets Vary: Accept-Language header when preferredLanguage strategy is used and redirect occurs", async () => {
	const runtime = await createParaglide({
		blob: await newProject({
			settings: {
				baseLocale: "en",
				locales: ["en", "fr"],
			},
		}),
		strategy: ["preferredLanguage", "url"],
		urlPatterns: [
			{
				pattern: "https://example.com/:path(.*)?",
				localized: [
					["en", "https://example.com/en/:path(.*)?"],
					["fr", "https://example.com/fr/:path(.*)?"],
				],
			},
		],
	});

	// Request with Accept-Language header preferring French
	const request = new Request("https://example.com/en/some-path", {
		headers: {
			"Accept-Language": "fr,en;q=0.8",
			"Sec-Fetch-Dest": "document",
		},
	});

	const response = await runtime.paraglideMiddleware(request, () => {
		// This shouldn't be called since we should redirect
		throw new Error("Should not reach here");
	});

	expect(response instanceof Response).toBe(true);
	expect(response.status).toBe(307); // Redirect status code
	expect(response.headers.get("Location")).toBe(
		"https://example.com/fr/some-path"
	);
	// Should have Vary header when preferredLanguage strategy is used
	expect(response.headers.get("Vary")).toBe("Accept-Language");
});

test("does not set Vary header when preferredLanguage strategy is not used", async () => {
	const runtime = await createParaglide({
		blob: await newProject({
			settings: {
				baseLocale: "en",
				locales: ["en", "fr"],
			},
		}),
		strategy: ["cookie", "url"],
		cookieName: "PARAGLIDE_LOCALE",
		urlPatterns: [
			{
				pattern: "https://example.com/:path(.*)?",
				localized: [
					["en", "https://example.com/en/:path(.*)?"],
					["fr", "https://example.com/fr/:path(.*)?"],
				],
			},
		],
	});

	// Request with cookie specifying French
	const request = new Request("https://example.com/en/some-path", {
		headers: {
			cookie: `PARAGLIDE_LOCALE=fr`,
			"Sec-Fetch-Dest": "document",
		},
	});

	const response = await runtime.paraglideMiddleware(request, () => {
		// This shouldn't be called since we should redirect
		throw new Error("Should not reach here");
	});

	expect(response instanceof Response).toBe(true);
	expect(response.status).toBe(307); // Redirect status code
	expect(response.headers.get("Location")).toBe(
		"https://example.com/fr/some-path"
	);
	// Should NOT have Vary header when preferredLanguage strategy is not used
	expect(response.headers.get("Vary")).toBe(null);
});

test("does not call onRedirect callback when there is no redirecting", async () => {
	const runtime = await createParaglide({
		blob: await newProject({
			settings: {
				baseLocale: "en",
				locales: ["en", "fr"],
			},
		}),
		strategy: ["cookie", "url"],
		cookieName: "PARAGLIDE_LOCALE",
		urlPatterns: [
			{
				pattern: "https://example.com/:path(.*)?",
				localized: [
					["en", "https://example.com/en/:path(.*)?"],
					["fr", "https://example.com/fr/:path(.*)?"],
				],
			},
		],
	});

	// Request to URL in en with cookie specifying French
	const request = new Request("https://example.com/fr/some-path", {
		headers: {
			cookie: `PARAGLIDE_LOCALE=fr`,
			"Sec-Fetch-Dest": "document",
		},
	});

	let response: any = null;

	await runtime.paraglideMiddleware(
		request,
		() => {
			return new Response("Hello World");
		},
		{
			onRedirect: (res: Response) => {
				response = res;
			},
		}
	);

	expect(response).toBe(null);
});

test("does not redirect if URL already matches determined locale", async () => {
	const runtime = await createParaglide({
		blob: await newProject({
			settings: {
				baseLocale: "en",
				locales: ["en", "fr"],
			},
		}),
		strategy: ["cookie", "url"],
		cookieName: "PARAGLIDE_LOCALE",
		urlPatterns: [
			{
				pattern: "https://example.com/:path(.*)?",
				localized: [
					["en", "https://example.com/en/:path(.*)?"],
					["fr", "https://example.com/fr/:path(.*)?"],
				],
			},
		],
	});

	// Request to already localized URL matching cookie locale
	const request = new Request("https://example.com/fr/some-path", {
		headers: {
			"Sec-Fetch-Dest": "document",
			cookie: `PARAGLIDE_LOCALE=fr`,
		},
	});

	let middlewareResolveWasCalled = false;
	await runtime.paraglideMiddleware(request, () => {
		middlewareResolveWasCalled = true;
		return new Response();
	});

	expect(middlewareResolveWasCalled).toBe(true); // Middleware should be called since no redirect needed
});

test("works with disableAsyncLocalStorage option", async () => {
	const runtime = await createParaglide({
		blob: await newProject({
			settings: {
				baseLocale: "en",
				locales: ["en", "de", "fr"],
			},
		}),
		strategy: ["url", "globalVariable"],
		disableAsyncLocalStorage: true,
	});

	// Set a global locale to verify it doesn't interfere with request processing
	runtime.setLocale("fr");

	// Create a request with a "de" locale in the URL
	const request = new Request(new URL("https://example.com/de/page"), {
		headers: { "Sec-Fetch-Dest": "document" },
	});

	// Process the request with AsyncLocalStorage disabled
	const response = await runtime.paraglideMiddleware(request, (args) => {
		// Verify we still get the correct locale
		expect(args.locale).toBe("de");
		expect(runtime.getLocale()).toBe("de");
		// Verify URL is still properly delocalized
		expect(args.request.url).toBe("https://example.com/page");
		expect(runtime.getUrlOrigin()).toBe("https://example.com");
		return new Response("hello");
	});

	// Verify the result contains the correct data
	expect(await response.text()).toBe("hello");

	// Verify that global variable wasn't affected by this request
	expect(runtime.getLocale()).toBe("fr");
});

test("works with sequential parallel requests using disableAsyncLocalStorage", async () => {
	const runtime = await createParaglide({
		blob: await newProject({
			settings: {
				baseLocale: "en",
				locales: ["en", "de", "fr"],
			},
		}),
		strategy: ["url", "globalVariable"],
	});

	// setting the global variable to fr to assure that
	runtime.setLocale("fr");

	// simulating multiple requests that could interference with each other
	await Promise.all([
		runtime.paraglideMiddleware(
			new Request(new URL("https://example.com/page"), {
				headers: { "Sec-Fetch-Dest": "document" },
			}),
			() => {
				expect(runtime.getLocale()).toBe("en");
				expect(runtime.getUrlOrigin()).toBe("https://example.com");
				return new Response();
			}
		),

		runtime.paraglideMiddleware(
			new Request(new URL("https://peter.com/de/page"), {
				headers: { "Sec-Fetch-Dest": "document" },
			}),
			() => {
				expect(runtime.getLocale()).toBe("de");
				expect(runtime.getUrlOrigin()).toBe("https://peter.com");
				return new Response();
			}
		),
	]);

	// global variable is not impacted by middleware
	expect(runtime.getLocale()).toBe("fr");
});

// https://github.com/opral/inlang-paraglide-js/issues/442
test("falls back to next strategy when cookie contains invalid locale", async () => {
	const runtime = await createParaglide({
		blob: await newProject({
			settings: {
				baseLocale: "en",
				locales: ["en", "fr"],
			},
		}),
		strategy: ["cookie", "url", "baseLocale"],
		cookieName: "PARAGLIDE_LOCALE",
		urlPatterns: [
			{
				pattern: "https://example.com/:path(.*)?",
				localized: [
					["en", "https://example.com/en/:path(.*)?"],
					["fr", "https://example.com/fr/:path(.*)?"],
				],
			},
		],
	});

	// Request with an invalid locale in cookie
	const request = new Request("https://example.com/fr/some-path", {
		headers: {
			"Sec-Fetch-Dest": "document",
			cookie: `PARAGLIDE_LOCALE=invalid_locale`,
		},
	});

	let middlewareResolveWasCalled = false;
	await runtime.paraglideMiddleware(request, (args) => {
		middlewareResolveWasCalled = true;
		// Should fall back to URL strategy, which will detect 'fr' from the URL
		expect(args.locale).toBe("fr");
		return new Response();
	});

	expect(middlewareResolveWasCalled).toBe(true);

	// Try with a request that would fall back to baseLocale
	const baseRequest = new Request("https://example.com/some-path", {
		headers: {
			cookie: `PARAGLIDE_LOCALE=invalid_locale`,
		},
	});

	await runtime.paraglideMiddleware(baseRequest, (args) => {
		// Should fall back all the way to baseLocale since URL has no locale
		expect(args.locale).toBe("en");
		return new Response();
	});
});

// can likely be removed once the default url pattern polyfill workaround is removed
// because URLPattern seems to be handling this correctly
test("prevents redirect loops by normalizing URLs with trailing slashes in different scenarios", async () => {
	// Create two different runtimes to test different strategy configurations
	const runtime = await createParaglide({
		blob: await newProject({
			settings: {
				baseLocale: "en",
				locales: ["en", "fr"],
			},
		}),
		strategy: ["cookie", "url"],
		cookieName: "PARAGLIDE_LOCALE",
		urlPatterns: [
			{
				pattern: "https://example.com/:path(.*)?",
				localized: [
					["en", "https://example.com/en/:path(.*)?"],
					["fr", "https://example.com/fr/:path(.*)?"],
				],
			},
		],
	});

	// SCENARIO 1: Basic trailing slash normalization with cookie strategy

	// Case 1A: Request URL has trailing slash, but localized URL might not
	const requestWithTrailingSlash = new Request("https://example.com/fr/page/", {
		headers: {
			"Sec-Fetch-Dest": "document",
			cookie: `PARAGLIDE_LOCALE=fr`,
		},
	});

	let response = await runtime.paraglideMiddleware(
		requestWithTrailingSlash,
		() => {
			return new Response("No redirect needed");
		}
	);

	// Middleware should be called (no redirect) because normalized URLs match
	expect(response.status).toBe(200);
	expect(await response.text()).toBe("No redirect needed");

	// Case 1B: Request URL has no trailing slash, but localized URL might
	const requestWithoutTrailingSlash = new Request(
		"https://example.com/fr/page",
		{
			headers: {
				"Sec-Fetch-Dest": "document",
				cookie: `PARAGLIDE_LOCALE=fr`,
			},
		}
	);

	response = await runtime.paraglideMiddleware(
		requestWithoutTrailingSlash,
		() => {
			return new Response("No redirect needed");
		}
	);

	expect(response.status).toBe(200);

	// Case 1C: redirect wanted because cookie is set to fr but url is en
	const requestDifferentPath = new Request(
		"https://example.com/en/different-page",
		{
			headers: {
				"Sec-Fetch-Dest": "document",
				cookie: `PARAGLIDE_LOCALE=fr`,
			},
		}
	);

	response = await runtime.paraglideMiddleware(requestDifferentPath, () => {
		// This shouldn't be called since we should redirect
		throw new Error("Should not reach here");
	});

	// Should redirect to fr version
	expect(response.status).toBe(307);
	expect(response.headers.get("Location")).toBe(
		"https://example.com/fr/different-page"
	);
});

// https://github.com/opral/paraglide-js/issues/473
test("canonicalizes translated pathnames with the configured trailing slash policy", async () => {
	const runtime = await createParaglide({
		blob: await newProject({
			settings: {
				baseLocale: "en",
				locales: ["en", "de"],
			},
		}),
		strategy: ["url", "baseLocale"],
		trailingSlash: "never",
		urlPatterns: [
			{
				pattern: "/about",
				localized: [
					["en", "/about"],
					["de", "/de/ueber"],
				],
			},
		],
	});

	const response = await runtime.paraglideMiddleware(
		new Request("https://example.com/de/ueber/", {
			headers: { "Sec-Fetch-Dest": "document" },
		}),
		() => {
			throw new Error("canonical document requests should redirect first");
		}
	);

	expect(response.status).toBe(307);
	expect(response.headers.get("Location")).toBe("https://example.com/de/ueber");

	await runtime.paraglideMiddleware(
		new Request("https://example.com/de/ueber/"),
		({ locale, request }) => {
			expect(locale).toBe("de");
			expect(request.url).toBe("https://example.com/about");
			return new Response();
		}
	);
});

// not implemented because users should disable redirects by
// making another strategy preceed the url strategy
//
// strategy: ["cookie", "url"]
test.skip("doesn't redirect if disableUrlRedirect is true", async () => {
	const runtime = await createParaglide({
		blob: await newProject({
			settings: {
				baseLocale: "en",
				locales: ["en", "fr"],
			},
		}),
		cookieName: "PARAGLIDE_LOCALE",
		strategy: ["cookie", "url"],
		urlPatterns: [
			{
				pattern: "https://example.com/:path(.*)?",
				localized: [
					["en", "https://example.com/en/:path(.*)?"],
					["fr", "https://example.com/fr/:path(.*)?"],
				],
			},
		],
	});

	// Create a request that would normally be redirected
	const request = new Request("https://example.com/en/some-path", {
		headers: {
			cookie: `PARAGLIDE_LOCALE=fr`,
			"Sec-Fetch-Dest": "document",
		},
	});

	// Test with disableUrlRedirect = true
	let middlewareResolveWasCalled = false;
	await runtime.paraglideMiddleware(
		request,
		() => {
			middlewareResolveWasCalled = true;
			return new Response("No redirect");
		}
		// { disableUrlRedirect: true }
	);

	// Middleware should be called since redirect is disabled
	expect(middlewareResolveWasCalled).toBe(true);
});

test("only redirects if the request.headers.get('Sec-Fetch-Dest') === 'document'", async () => {
	const runtime = await createParaglide({
		blob: await newProject({
			settings: {
				baseLocale: "en",
				locales: ["en", "fr"],
			},
		}),
		strategy: ["cookie", "url"],
		cookieName: "PARAGLIDE_LOCALE",
		urlPatterns: [
			{
				pattern: "https://example.com/:path(.*)?",
				localized: [
					["en", "https://example.com/en/:path(.*)?"],
					["fr", "https://example.com/fr/:path(.*)?"],
				],
			},
		],
	});

	// Test with Sec-Fetch-Dest = document (should redirect)
	const documentRequest = new Request("https://example.com/en/some-path", {
		headers: {
			cookie: `PARAGLIDE_LOCALE=fr`,
			"Sec-Fetch-Dest": "document",
		},
	});

	const documentResponse = await runtime.paraglideMiddleware(
		documentRequest,
		() => {
			// This shouldn't be called since we should redirect
			throw new Error("Should not reach here");
		}
	);

	// Should redirect to fr version
	expect(documentResponse instanceof Response).toBe(true);
	expect(documentResponse.status).toBe(307);
	expect(documentResponse.headers.get("Location")).toBe(
		"https://example.com/fr/some-path"
	);

	// Test with Sec-Fetch-Dest = empty (should not redirect)
	const apiRequest = new Request("https://example.com/en/some-path", {
		headers: {
			cookie: `PARAGLIDE_LOCALE=fr`,
			// No Sec-Fetch-Dest header or set to something other than "document"
			"Sec-Fetch-Dest": "empty",
		},
	});

	let apiMiddlewareResolveWasCalled = false;
	await runtime.paraglideMiddleware(apiRequest, () => {
		apiMiddlewareResolveWasCalled = true;
		return new Response("API response");
	});

	// Middleware should be called since no redirect for API requests
	expect(apiMiddlewareResolveWasCalled).toBe(true);
});

describe("navigation redirects", () => {
	let runtime: Awaited<ReturnType<typeof createParaglide>>;
	const vary = "Accept-Language, Cookie, Accept, Sec-Fetch-Dest";
	beforeAll(async () => {
		runtime = await createParaglide({
			blob: await newProject({
				settings: { baseLocale: "en", locales: ["en", "fr"] },
			}),
			strategy: ["preferredLanguage", "cookie", "url"],
			routeStrategies: [
				{ match: "/api/:path(.*)?", exclude: true },
				{ match: "/no-url", strategy: ["preferredLanguage"] },
			],
		});
	});

	test.each([
		["GET", undefined, "text/html", 307],
		["HEAD", undefined, "text/html", 307],
		["GET", undefined, "*/*", 307],
		["GET", undefined, "text/*", 307],
		[
			"GET",
			undefined,
			"application/json, TEXT/HTML; charset=utf-8; Q=0.5",
			307,
		],
		["GET", undefined, "text/html;q=0.001", 307],
		["GET", undefined, "text/html;q=0, */*", 200],
		["GET", undefined, "*/*, text/html;q=0", 200],
		["GET", undefined, "text/*;q=0, */*", 200],
		["GET", undefined, "text/html;q=0.5, text/*;q=0", 307],
		["GET", undefined, "text/html;q=invalid", 200],
		["GET", undefined, "text/html;q=2", 200],
		["GET", undefined, "text/html;q=-1", 200],
		["GET", undefined, "text/html;q=0.1234", 200],
		["GET", undefined, 'text/html;profile="a,b";q=0, */*;q=0', 200],
		["GET", undefined, 'text/html;profile="x;q=0";q=1', 307],
		["GET", undefined, 'text/html;profile="x;q=1";q=0', 200],
		["GET", undefined, 'text/html;profile="a\\\",b";q=0, */*;q=0', 200],
		["GET", undefined, 'text/html;profile="a\\\";q=0";q=1', 307],
		["GET", undefined, 'text/html;profile="a\\\\";q=0, */*;q=0', 200],
		["GET", undefined, 'text/html;profile="unterminated', 200],
		["GET", undefined, "application/json", 200],
		["GET", undefined, "application/xhtml+xml", 200],
		["GET", undefined, "text/html-invalid", 200],
		["GET", undefined, "", 200],
		["GET", undefined, undefined, 200],
		["GET", "empty", "text/html", 200],
		["GET", "", "text/html", 200],
		["GET", "script", "text/html", 200],
		["GET", "document", "application/json", 307],
		["HEAD", "document", undefined, 307],
		["POST", undefined, "text/html", 200],
		["POST", "document", "text/html", 200],
		["PUT", "document", "text/html", 200],
		["OPTIONS", undefined, "text/html", 200],
	] as const)(
		"%s with destination %s and Accept %s returns %i",
		async (method, destination, accept, status) => {
			const headers = new Headers({
				"Accept-Language": "fr",
				"Content-Type": "application/x-www-form-urlencoded",
			});
			if (destination !== undefined) headers.set("Sec-Fetch-Dest", destination);
			if (accept !== undefined) headers.set("Accept", accept);
			const body = method === "POST" ? "name=Alice" : undefined;
			const request = new Request("https://example.com/about?from=test", {
				method,
				headers,
				body,
			});
			const resolve = vi.fn(
				async ({ request: localized }: { request: Request }) => {
					expect(localized.method).toBe(method);
					expect(await localized.text()).toBe(body ?? "");
					return new Response(null);
				}
			);
			const onRedirect = vi.fn();
			const response = await runtime.paraglideMiddleware(request, resolve, {
				redirect: "navigation",
				onRedirect,
			});
			expect(response.status).toBe(status);
			expect(resolve).toHaveBeenCalledTimes(status === 307 ? 0 : 1);
			expect(onRedirect).toHaveBeenCalledTimes(status === 307 ? 1 : 0);
			expect(response.headers.get("Location")).toBe(
				status === 307 ? "https://example.com/fr/about?from=test" : null
			);
			expect(response.headers.get("Vary")).toBe(
				method === "GET" || method === "HEAD" ? vary : null
			);
			expect(response.body).toBeNull();
			expect(request.bodyUsed).toBe(false);
			expect(await request.text()).toBe(body ?? "");
		}
	);

	test.each([undefined, "document", null, "nav"])(
		"keeps default behavior for redirect=%s",
		async (redirect) => {
			for (const method of ["GET", "HEAD", "POST"]) {
				for (const destination of [undefined, "document", "empty"]) {
					const headers = new Headers({
						Accept: "text/html",
						"Accept-Language": "fr",
					});
					if (destination) headers.set("Sec-Fetch-Dest", destination);
					const response = await runtime.paraglideMiddleware(
						new Request("https://example.com/about", { method, headers }),
						() => new Response(null),
						redirect === undefined
							? undefined
							: { redirect: redirect as "document" }
					);
					expect(response.status).toBe(destination === "document" ? 307 : 200);
					expect(response.headers.get("Vary")).toBe(
						destination === "document" ? "Accept-Language" : null
					);
				}
			}
		}
	);

	test.each(["GET", "HEAD"])(
		"separates cached 200 and 307 responses for %s",
		async (method) => {
			for (const field of ["Accept-Language", "Cookie"]) {
				for (const locale of ["en", "fr"]) {
					for (const previous of [
						"",
						"Accept-Encoding",
						vary.toLowerCase(),
						"*",
					]) {
						const downstream = new Response(method === "HEAD" ? null : "ok", {
							headers: {
								Vary: previous,
								"Cache-Control": "public, max-age=600",
							},
						});
						const response = await runtime.paraglideMiddleware(
							new Request("http://internal.example.com/about", {
								method,
								headers: {
									Accept: "text/html",
									[field]:
										field === "Cookie" ? `PARAGLIDE_LOCALE=${locale}` : locale,
								},
							}),
							() => downstream,
							{
								redirect: "navigation",
								effectiveRequestUrl: "https://example.com/about?from=test",
							}
						);
						expect(response.status).toBe(locale === "fr" ? 307 : 200);
						expect(response.headers.get("Location")).toBe(
							locale === "fr" ? "https://example.com/fr/about?from=test" : null
						);
						const expected =
							previous === "Accept-Encoding"
								? `${previous}, ${vary}`
								: previous || vary;
						expect(response.headers.get("Vary")).toBe(
							locale === "fr" ? vary : expected
						);
						if (locale === "en") {
							expect(response.headers.get("Cache-Control")).toBe(
								"public, max-age=600"
							);
							expect(await response.text()).toBe(method === "HEAD" ? "" : "ok");
							expect(downstream.headers.get("Vary")).toBe(previous);
						}
					}
				}
			}
		}
	);

	test("preserves callback returns that cannot be rebuilt", async () => {
		const consumed = new Response("ok");
		await consumed.text();
		const locked = new Response("ok");
		const reader = locked.body!.getReader();
		try {
			for (const value of [undefined, {}, Response.error(), consumed, locked]) {
				const response = await runtime.paraglideMiddleware(
					new Request("https://example.com/about", {
						headers: { Accept: "application/json" },
					}),
					async () => value,
					{ redirect: "navigation" }
				);
				expect(response).toBe(value);
			}
		} finally {
			reader.releaseLock();
		}
	});

	test("varies immutable headers only on routes using URL strategy", async () => {
		for (const path of ["/about", "/api/data", "/no-url"]) {
			const downstream = Response.redirect("https://example.com/login", 303);
			const response = await runtime.paraglideMiddleware(
				new Request(`https://example.com${path}`, {
					headers: {
						Accept: path === "/about" ? "application/json" : "text/html",
						Cookie: "PARAGLIDE_LOCALE=fr",
						"Accept-Language": "fr",
					},
				}),
				() => downstream,
				{ redirect: "navigation" }
			);
			expect(response.status).toBe(303);
			expect(response.statusText).toBe(downstream.statusText);
			expect(response.headers.get("Location")).toBe(
				"https://example.com/login"
			);
			expect(response.headers.get("Vary")).toBe(
				path === "/about" ? vary : null
			);
			expect(downstream.headers.get("Vary")).toBeNull();
		}
	});
});

test.each([
	["/fr/about", "application/json", false, "en", 200],
	["/fr/about", "text/html", false, "en", 200],
	["/fr/about/", "application/json", false, "en", 200],
	["/fr/about/", "text/html", false, "en", 307],
	["/fr/about", "text/html", true, "fr", 200],
	["/fr/about", "text/html", true, "en", 307],
] as const)(
	"navigation cache for %s with Accept %s, custom strategy=%s and preference=%s",
	async (path, accept, custom, preference, status) => {
		const runtime = await createParaglide({
			blob: await newProject({
				settings: { baseLocale: "en", locales: ["en", "fr"] },
			}),
			strategy: [
				"url",
				"cookie",
				"preferredLanguage",
				"baseLocale",
				...(custom ? ["custom-header" as const] : []),
			],
			trailingSlash: "never",
		});
		if (custom)
			runtime.defineCustomServerStrategy("custom-header", {
				getLocale: (request) =>
					request?.headers.get("Accept-Language") ?? undefined,
			});
		for (const method of ["GET", "HEAD"]) {
			const downstream = new Response(method === "HEAD" ? null : "ok", {
				headers: {
					Vary: "Accept-Encoding",
					"Cache-Control": "public, max-age=600",
				},
			});
			const response = await runtime.paraglideMiddleware(
				new Request("http://internal.example.com/about", {
					method,
					headers: {
						Accept: accept,
						Cookie: "PARAGLIDE_LOCALE=en",
						"Accept-Language": preference,
					},
				}),
				() => downstream,
				{
					redirect: "navigation",
					effectiveRequestUrl: `https://example.com${path}`,
				}
			);
			expect(response.status).toBe(status);
			expect(response.headers.get("Location")).toBe(
				status === 307
					? `https://example.com${custom ? "/about" : "/fr/about"}`
					: null
			);
			const fields = custom
				? "Accept-Language, Cookie, Accept, Sec-Fetch-Dest"
				: "Accept, Sec-Fetch-Dest";
			const needsVary = custom || path.endsWith("/");
			expect(response.headers.get("Vary")).toBe(
				status === 307
					? fields
					: needsVary
						? `Accept-Encoding, ${fields}`
						: "Accept-Encoding"
			);
			if (!needsVary) expect(response).toBe(downstream);
			if (status === 200) {
				expect(response.headers.get("Cache-Control")).toBe(
					"public, max-age=600"
				);
				expect(await response.text()).toBe(method === "HEAD" ? "" : "ok");
			}
		}
	}
);

// https://github.com/opral/inlang-paraglide-js/issues/477
test("does not catch errors thrown by downstream resolve call", async () => {
	const runtime = await createParaglide({
		blob: await newProject({
			settings: {
				baseLocale: "en",
				locales: ["en"],
			},
		}),
		strategy: ["url"],
	});

	await expect(() =>
		runtime.paraglideMiddleware(
			new Request(new URL("https://example.com/page"), {
				headers: { "Sec-Fetch-Dest": "document" },
			}),
			() => {
				throw new Error("Downstream error");
			}
		)
	).rejects.toThrow();
});

test("middleware supports async custom server strategies", async () => {
	const runtime = await createParaglide({
		blob: await newProject({
			settings: {
				baseLocale: "en",
				locales: ["en", "fr", "de"],
			},
		}),
		strategy: ["custom-database", "baseLocale"],
	});

	// Mock an async custom strategy that simulates a database call
	let databaseCallCount = 0;
	runtime.defineCustomServerStrategy("custom-database", {
		getLocale: async (request) => {
			databaseCallCount++;
			// Simulate async database call delay
			await new Promise((resolve) => setTimeout(resolve, 10));

			// Extract user ID from a custom header (simulating authentication)
			if (!request) return undefined;
			const userId = request.headers.get("X-User-ID");
			if (userId === "user123") {
				return "fr";
			}
			if (userId === "user456") {
				return "de";
			}
			return undefined; // No user preference found
		},
	});

	// Test 1: Request with user preference
	const requestWithUserPref = new Request("https://example.com/page", {
		headers: {
			"X-User-ID": "user123",
			"Sec-Fetch-Dest": "document",
		},
	});

	let middlewareResolveWasCalled = false;
	await runtime.paraglideMiddleware(requestWithUserPref, (args) => {
		middlewareResolveWasCalled = true;
		expect(args.locale).toBe("fr"); // Should get locale from async custom strategy
		return new Response("User preference locale");
	});

	expect(middlewareResolveWasCalled).toBe(true);
	expect(databaseCallCount).toBe(1);

	// Test 2: Request with different user preference
	const requestWithOtherUser = new Request("https://example.com/page", {
		headers: {
			"X-User-ID": "user456",
			"Sec-Fetch-Dest": "document",
		},
	});

	await runtime.paraglideMiddleware(requestWithOtherUser, (args) => {
		expect(args.locale).toBe("de"); // Should get different locale
		return new Response("Other user preference");
	});

	expect(databaseCallCount).toBe(2);
});

test("middleware falls back to other strategies when async custom strategy returns undefined", async () => {
	const runtime = await createParaglide({
		blob: await newProject({
			settings: {
				baseLocale: "en",
				locales: ["en", "fr", "de"],
			},
		}),
		strategy: ["custom-database", "cookie", "baseLocale"],
		cookieName: "PARAGLIDE_LOCALE",
	});

	// Mock async custom strategy that returns undefined for unknown users
	runtime.defineCustomServerStrategy("custom-database", {
		getLocale: async (request) => {
			await new Promise((resolve) => setTimeout(resolve, 5));
			if (!request) return undefined;
			const userId = request.headers.get("X-User-ID");
			// Only return locale for known users
			if (userId === "known-user") {
				return "fr";
			}
			return undefined; // Unknown user, fallback to other strategies
		},
	});

	// Request from unknown user with cookie fallback
	const request = new Request("https://example.com/page", {
		headers: {
			"X-User-ID": "unknown-user",
			cookie: "PARAGLIDE_LOCALE=de",
			"Sec-Fetch-Dest": "document",
		},
	});

	let middlewareResolveWasCalled = false;
	await runtime.paraglideMiddleware(request, (args) => {
		middlewareResolveWasCalled = true;
		expect(args.locale).toBe("de"); // Should fallback to cookie strategy
		return new Response("Fallback locale");
	});

	expect(middlewareResolveWasCalled).toBe(true);
});

test("middleware handles async custom strategy errors gracefully", async () => {
	const runtime = await createParaglide({
		blob: await newProject({
			settings: {
				baseLocale: "en",
				locales: ["en", "fr"],
			},
		}),
		strategy: ["custom-database", "baseLocale"],
	});

	// Mock async custom strategy that throws an error
	runtime.defineCustomServerStrategy("custom-database", {
		getLocale: async () => {
			await new Promise((resolve) => setTimeout(resolve, 5));
			throw new Error("Database connection failed");
		},
	});

	const request = new Request("https://example.com/page", {
		headers: { "Sec-Fetch-Dest": "document" },
	});

	// The middleware should handle the error and not crash
	await expect(
		runtime.paraglideMiddleware(request, (args) => {
			// If we reach here, the error was handled and fallback worked
			expect(args.locale).toBe("en"); // Should fallback to baseLocale
			return new Response("Error handled");
		})
	).rejects.toThrow("Database connection failed");
});

// https://github.com/opral/paraglide-js/issues/573
test("falls back to original request when cloning fails (e.g., TanStack Start custom Request)", async () => {
	const runtime = await createParaglide({
		blob: await newProject({
			settings: {
				baseLocale: "en",
				locales: ["en", "de"],
			},
		}),
		// Using a strategy that doesn't include "url" to trigger the clone path
		strategy: ["globalVariable", "baseLocale"],
	});

	// Create a custom request-like object that cannot be cloned
	// This simulates TanStack Start's custom Request implementation
	const customRequest = {
		url: "https://example.com/page",
		headers: new Headers({ "Sec-Fetch-Dest": "document" }),
		method: "GET",
		// Missing other required properties that would cause `new Request(request)` to fail
	} as unknown as Request;

	let middlewareResolveWasCalled = false;
	const response = await runtime.paraglideMiddleware(customRequest, (args) => {
		middlewareResolveWasCalled = true;
		expect(args.locale).toBe("en");
		// The request should be the original custom request since cloning failed
		expect(args.request).toBe(customRequest);
		return new Response("Success");
	});

	expect(middlewareResolveWasCalled).toBe(true);
	expect(await response.text()).toBe("Success");
});

// https://github.com/opral/paraglide-js/issues/652
test("falls back to original request when cloning a rewritten request fails", async () => {
	const runtime = await createParaglide({
		blob: await newProject({
			settings: {
				baseLocale: "en",
				locales: ["en", "de"],
			},
		}),
		strategy: ["globalVariable", "baseLocale"],
	});

	const customRequest = {
		url: "http://internal.example.com/page",
		headers: new Headers({ "Sec-Fetch-Dest": "document" }),
		method: "GET",
	} as unknown as Request;

	const NativeRequest = globalThis.Request;
	Object.defineProperty(globalThis, "Request", {
		value: class extends NativeRequest {
			constructor(input: RequestInfo | URL, init?: RequestInit) {
				if (
					(typeof input === "string" && input === "https://example.com/page") ||
					(input instanceof URL && input.href === "https://example.com/page")
				) {
					throw new TypeError("Simulated rewritten request clone failure");
				}
				super(input, init);
			}
		},
		configurable: true,
		writable: true,
	});

	try {
		let middlewareResolveWasCalled = false;
		const response = await runtime.paraglideMiddleware(
			customRequest,
			(args) => {
				middlewareResolveWasCalled = true;
				expect(args.locale).toBe("en");
				expect(runtime.getUrlOrigin()).toBe("https://example.com");
				expect(args.request).toBe(customRequest);
				expect(args.request.url).toBe("http://internal.example.com/page");
				return new Response("Success");
			},
			{
				effectiveRequestUrl: "https://example.com/page",
			}
		);

		expect(middlewareResolveWasCalled).toBe(true);
		expect(await response.text()).toBe("Success");
	} finally {
		Object.defineProperty(globalThis, "Request", {
			value: NativeRequest,
			configurable: true,
			writable: true,
		});
	}
});

test("middleware works with multiple async custom strategies", async () => {
	const runtime = await createParaglide({
		blob: await newProject({
			settings: {
				baseLocale: "en",
				locales: ["en", "fr", "de", "es"],
			},
		}),
		strategy: ["custom-userPref", "custom-region", "baseLocale"],
	});

	let userPrefCallCount = 0;
	let regionCallCount = 0;

	// First strategy: user preference
	runtime.defineCustomServerStrategy("custom-userPref", {
		getLocale: async (request) => {
			userPrefCallCount++;
			await new Promise((resolve) => setTimeout(resolve, 5));
			if (!request) return undefined;
			const userId = request.headers.get("X-User-ID");
			return userId === "premium-user" ? "fr" : undefined;
		},
	});

	// Second strategy: region detection
	runtime.defineCustomServerStrategy("custom-region", {
		getLocale: async (request) => {
			regionCallCount++;
			await new Promise((resolve) => setTimeout(resolve, 5));
			if (!request) return undefined;
			const region = request.headers.get("X-Region");
			return region === "europe" ? "de" : undefined;
		},
	});

	// Test 1: First strategy succeeds
	const premiumUserRequest = new Request("https://example.com/page", {
		headers: {
			"X-User-ID": "premium-user",
			"X-Region": "europe",
			"Sec-Fetch-Dest": "document",
		},
	});

	await runtime.paraglideMiddleware(premiumUserRequest, (args) => {
		expect(args.locale).toBe("fr"); // Should use first strategy result
		return new Response("Premium user");
	});

	expect(userPrefCallCount).toBe(1);
	// Second strategy should not be called since first one succeeded
	expect(regionCallCount).toBe(0);

	// Test 2: First strategy fails, second succeeds
	const regionalUserRequest = new Request("https://example.com/page", {
		headers: {
			"X-User-ID": "regular-user",
			"X-Region": "europe",
			"Sec-Fetch-Dest": "document",
		},
	});

	await runtime.paraglideMiddleware(regionalUserRequest, (args) => {
		expect(args.locale).toBe("de"); // Should use second strategy result
		return new Response("Regional user");
	});

	expect(userPrefCallCount).toBe(2);
	expect(regionCallCount).toBe(1);
});

test("injected script reuses the Content-Security-Policy nonce when present and omits it otherwise", async () => {
	const runtime = await createParaglide({
		blob: await newProject({
			settings: {
				baseLocale: "en",
				locales: ["en", "de"],
			},
		}),
		strategy: ["globalVariable", "baseLocale"],
		experimentalMiddlewareLocaleSplitting: true,
	});

	const request = new Request(new URL("https://example.com/page"), {
		headers: { "Sec-Fetch-Dest": "document" },
	});

	// With a CSP nonce -> the injected script reuses it.
	const responseWithCsp = await runtime.paraglideMiddleware(request, () => {
		return new Response("<html><head></head><body></body></html>", {
			headers: {
				"Content-Type": "text/html",
				"Content-Security-Policy":
					"default-src 'self'; script-src 'nonce-abc123' 'strict-dynamic'",
			},
		});
	});
	expect(await responseWithCsp.text()).toContain('<script nonce="abc123">');

	// Without a CSP header -> the script is still injected, without a nonce.
	const responseWithoutCsp = await runtime.paraglideMiddleware(request, () => {
		return new Response("<html><head></head><body></body></html>", {
			headers: { "Content-Type": "text/html" },
		});
	});
	const html = await responseWithoutCsp.text();
	expect(html).toContain("globalThis.__paraglide.ssr");
	expect(html).not.toContain("nonce=");
});
