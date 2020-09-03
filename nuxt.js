import path from "path";
import { loadConfig } from "./lib/utils";

/**
 * Vlang module for Nuxt
 *
 * - Loads the Vlang plugin
 * - Adds the appropriate Webpack loaders
 */
export default function nuxtBootstrapVue() {
    const config = loadConfig(this.options.srcDir);

    this.addPlugin({
        src: path.join(__dirname, "runtime/nuxt-plugin.js"),
        filename: "vlang/plugin.js",
        options: {
            locales: config.locales,
            cookieName: "vlang",
        },
    });
    this.addPlugin({
        src: path.join(__dirname, "runtime/runtime.js"),
        filename: "vlang/runtime.js",
    });

    this.extendBuild((config) => {
        config.module.rules.push({
            resourceQuery: /blockType=messages/,
            type: "javascript/auto",
            loader: `vlang/webpack/vlang-loader`,
        });

        config.module.rules.push({
            test: /\.(js)$/,
            loader: `vlang/webpack/vljs-loader`,
            exclude: /(node_modules)/,
        });
    });
}

export const meta = require("./package.json");
