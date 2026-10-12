import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { chromium } from "../node_modules/playwright/index.mjs";
// node benchmark/real-apps/browser.mjs drawdb baseline inline
const [app, ...labels] = process.argv.slice(2);
const root = path.resolve(".real-apps", app);
const mapping = JSON.parse(
	await fs.readFile(path.join(root, labels[0], "mapping.json"), "utf8")
);
const inputs = JSON.parse(
	await fs.readFile(path.join(root, labels[0], "inputs.json"), "utf8")
);
const keys = Object.keys(mapping).slice(0, 100);
const variants = labels.flatMap((label) => [{ label, library: "paraglide" }]);
variants.unshift({ label: labels[0], library: "i18next" });
const server = http.createServer(async (req, res) => {
	try {
		const [, label, library, filename] = req.url.split("/");
		if (filename === "app.js") {
			const source = await fs.readFile(
				path.join(root, label, `${library}-bundle.js`)
			);
			const data = gzipSync(source);
			res.writeHead(200, {
				"Content-Type": "text/javascript",
				"Content-Encoding": "gzip",
				"Content-Length": data.length,
			});
			res.end(data);
		} else {
			const html = `<!doctype html><meta charset="utf-8"><title>Catalog startup fixture</title><main id="out"></main><script type="module">import {translate,setLocale} from './app.js'; const inputs=${JSON.stringify(inputs)}; await setLocale('en',{reload:false}); document.querySelector('#out').textContent=${JSON.stringify(keys)}.map(key=>translate(key,inputs)).join(' '); window.fixtureReady=performance.now();</script>`;
			res.writeHead(200, {
				"Content-Type": "text/html",
				"Cache-Control": "no-store",
			});
			res.end(html);
		}
	} catch (e) {
		res.writeHead(500);
		res.end(String(e));
	}
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch({
	headless: true,
	args: ["--no-sandbox"],
});
const results = Object.fromEntries(
	variants.map((v) => [`${v.label}/${v.library}`, []])
);
try {
	for (let round = 0; round < 13; round++)
		for (const v of round % 2 ? [...variants].reverse() : variants) {
			const context = await browser.newContext({
				viewport: { width: 390, height: 844 },
				serviceWorkers: "block",
			});
			const page = await context.newPage();
			const session = await context.newCDPSession(page);
			await session.send("Network.enable");
			await session.send("Network.setCacheDisabled", { cacheDisabled: true });
			await session.send("Network.emulateNetworkConditions", {
				offline: false,
				latency: 150,
				downloadThroughput: 1600000 / 8,
				uploadThroughput: 750000 / 8,
			});
			await session.send("Emulation.setCPUThrottlingRate", { rate: 4 });
			const errors = [];
			page.on("pageerror", (e) => errors.push(String(e)));
			await page.addInitScript(() => {
				window.lastLCP = 0;
				new PerformanceObserver((list) => {
					for (const entry of list.getEntries())
						window.lastLCP = entry.startTime;
				}).observe({ type: "largest-contentful-paint", buffered: true });
			});
			await page.goto(
				`http://127.0.0.1:${server.address().port}/${v.label}/${v.library}/`,
				{ waitUntil: "load" }
			);
			await page.waitForFunction(() => window.fixtureReady !== undefined);
			await page.waitForTimeout(100);
			const metrics = await page.evaluate(() => ({
				readyMs: window.fixtureReady,
				lcpMs: window.lastLCP,
				encodedBytes: performance
					.getEntriesByType("resource")
					.reduce((n, r) => n + r.encodedBodySize, 0),
				decodedBytes: performance
					.getEntriesByType("resource")
					.reduce((n, r) => n + r.decodedBodySize, 0),
				text: document.querySelector("#out").textContent,
			}));
			if (errors.length) throw Error(errors.join("\n"));
			if (round > 1) results[`${v.label}/${v.library}`].push(metrics);
			await context.close();
		}
	const median = (a) => a.sort((a, b) => a - b)[Math.floor(a.length / 2)];
	const texts = Object.values(results).flatMap((rows) =>
		rows.map((r) => r.text)
	);
	if (texts.some((t) => t !== texts[0])) throw Error("Browser output differs");
	const report = {
		app,
		fixture:
			"100 real catalog strings, full catalogs; localization-only fixture, not production app LCP",
		browser: browser.version(),
		network: "1.6Mbps down,150ms latency",
		cpuThrottle: 4,
		summary: Object.fromEntries(
			Object.entries(results).map(([k, rows]) => [
				k,
				Object.fromEntries(
					["readyMs", "lcpMs", "encodedBytes", "decodedBytes"].map((metric) => [
						metric,
						median(rows.map((r) => r[metric])),
					])
				),
			])
		),
		rounds: Object.fromEntries(
			Object.entries(results).map(([k, rows]) => [
				k,
				rows.map(({ text, ...r }) => r),
			])
		),
	};
	await fs.writeFile(
		path.join(root, "browser-results.json"),
		JSON.stringify(report, null, 2)
	);
	console.log(JSON.stringify(report.summary, null, 2));
} finally {
	await browser.close();
	server.close();
}
