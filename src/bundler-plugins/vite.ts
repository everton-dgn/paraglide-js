import { createVitePlugin } from "unplugin";
import type { Plugin } from "vite";
import type { ParaglidePluginOptions } from "./unplugin.js";
import { createPerLocaleBuildPlugins } from "./per-locale-build/index.js";
import { unpluginFactory } from "./unplugin.js";

export type ParaglideVitePluginOptions = ParaglidePluginOptions & {
	/**
	 * Respond with HTTP 500 while the development compiler or its config is
	 * invalid, instead of serving the last successful output. Error overlays
	 * remain enabled. Set this on the Vite plugin, not in paraglide.config.
	 *
	 * @default false
	 */
	devErrorResponse?: boolean;
	/**
	 * Emit one compiler-specialized client asset tree per project locale.
	 *
	 * Requires Vite 8+. Builds one untouched Rolldown client environment per
	 * locale and emits `paraglide-vite-locales.json`. Locale changes need to use
	 * full-document navigation. Framework SSR graph selection requires a public
	 * framework integration API.
	 *
	 * @experimental
	 * @default false
	 */
	experimentalPerLocaleBuild?: boolean;
};

type CompilerVitePluginOptions = Omit<
	ParaglideVitePluginOptions,
	"experimentalPerLocaleBuild"
>;

const createCompilerVitePlugin = createVitePlugin<CompilerVitePluginOptions>(
	({ devErrorResponse, ...options }, meta) =>
		unpluginFactory(options, meta, { devErrorResponse })
);
const createPerLocaleCompilerVitePlugin =
	createVitePlugin<CompilerVitePluginOptions>(
		({ devErrorResponse, ...options }, meta) =>
			unpluginFactory(options, meta, {
				outputStructure: "locale-modules",
				devErrorResponse,
			})
	);

export function paraglideVitePlugin(
	options: ParaglideVitePluginOptions
): Plugin | Plugin[] {
	const { experimentalPerLocaleBuild, devErrorResponse, ...compilerOptions } =
		options;
	if (!experimentalPerLocaleBuild) {
		return createCompilerVitePlugin({
			...compilerOptions,
			devErrorResponse,
		}) as Plugin;
	}

	return createPerLocaleBuildPlugins({
		compilerOptions,
		createCompilerPlugin: (options) =>
			createPerLocaleCompilerVitePlugin({
				...options,
				devErrorResponse,
			}) as Plugin,
	});
}
