import { afterEach, beforeEach, expect, test, vi } from "vitest";
import consola from "consola";
import { memfs } from "memfs";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import type { UnpluginBuildContext, UnpluginOptions } from "unplugin";
import { unpluginFactory } from "./unplugin.js";

beforeEach(() => {
	consola.mockTypes(() => vi.fn());
});

afterEach(() => {
	vi.unstubAllEnvs();
	vi.restoreAllMocks();
});

async function createFixture(checkTranslations = true) {
	const fs = memfs({
		"/project.inlang/settings.json": JSON.stringify({
			baseLocale: "en",
			locales: ["en", "de"],
			modules: ["./plugin.js"],
			"plugin.inlang.messageFormat": {
				pathPattern: "./messages/{locale}.json",
			},
		}),
		"/plugin.js": readFileSync(
			createRequire(import.meta.url).resolve("@inlang/plugin-message-format"),
			"utf8"
		),
		"/messages/en.json": JSON.stringify({ hello: "Hello" }),
		"/messages/de.json": "{}",
		"/output/messages.js": "previous output",
	}).fs as unknown as typeof import("node:fs");
	const plugin = unpluginFactory({
		project: "/project.inlang",
		outdir: "/output",
		checkTranslations,
		emitReadme: false,
		fs,
	}) as UnpluginOptions;
	return { fs, plugin };
}

function context(watchMode = false): UnpluginBuildContext {
	return {
		addWatchFile: vi.fn(),
		meta: { watchMode },
	} as unknown as UnpluginBuildContext;
}

function beforeRun(plugin: UnpluginOptions, bundler: "webpack" | "rspack") {
	let run: (() => Promise<void>) | undefined;
	const compiler = {
		context: "/",
		options: {},
		hooks: {
			beforeRun: {
				tapPromise: (_name: string, callback: () => Promise<void>) => {
					run = callback;
				},
			},
		},
	};
	if (bundler === "webpack") {
		plugin.webpack!(
			compiler as unknown as Parameters<
				NonNullable<UnpluginOptions["webpack"]>
			>[0]
		);
	} else {
		plugin.rspack!(
			compiler as unknown as Parameters<
				NonNullable<UnpluginOptions["rspack"]>
			>[0]
		);
	}
	expect(run).toBeTypeOf("function");
	return () => run!();
}

test.each([undefined, "development", "production"])(
	"strict builds reject incomplete translations with NODE_ENV=%s",
	async (nodeEnv) => {
		vi.stubEnv("NODE_ENV", nodeEnv);
		for (const hook of ["buildStart", "webpack", "rspack"] as const) {
			const { plugin, fs } = await createFixture();
			const run =
				hook === "buildStart"
					? () => plugin.buildStart!.call(context())
					: beforeRun(plugin, hook);
			await expect(run()).rejects.toThrow(/missing-translation.*hello.*de/s);
			expect(fs.readFileSync("/output/messages.js", "utf8")).toBe(
				"previous output"
			);
		}
	}
);

test.each(["rollup", "vite", "webpack", "rspack"])(
	"%s watch contexts preserve output and recover after strict checks fail",
	async (bundler) => {
		vi.stubEnv("NODE_ENV", undefined);
		const { plugin, fs } = await createFixture();
		const buildContext = context(bundler === "rollup");
		if (bundler === "vite") {
			const hook = plugin.vite!.configResolved as {
				handler: (config: { command: string }) => void;
			};
			hook.handler({ command: "serve" });
		} else if (bundler === "webpack" || bundler === "rspack") {
			buildContext.getNativeBuildContext = () =>
				({
					framework: bundler,
					compiler: { watchMode: true },
				}) as ReturnType<
					NonNullable<UnpluginBuildContext["getNativeBuildContext"]>
				>;
		}
		await expect(
			plugin.buildStart!.call(buildContext)
		).resolves.toBeUndefined();
		expect(fs.readFileSync("/output/messages.js", "utf8")).toBe(
			"previous output"
		);
		await fs.promises.writeFile(
			"/messages/de.json",
			JSON.stringify({ hello: "Hallo" })
		);
		await plugin.watchChange!.call(buildContext, "/messages/de.json", {
			event: "update",
		});
		expect(fs.readFileSync("/output/messages.js", "utf8")).not.toBe(
			"previous output"
		);
	}
);

test("builds still allow locale fallback when translation checks are disabled", async () => {
	vi.stubEnv("NODE_ENV", undefined);
	const { plugin, fs } = await createFixture(false);
	await expect(plugin.buildStart!.call(context())).resolves.toBeUndefined();
	expect(fs.readFileSync("/output/messages.js", "utf8")).not.toBe(
		"previous output"
	);
});
