import {
    readFile,
    writeFile,
    readdir,
    mkdir,
    rm
} from "fs/promises";

import { extname } from "path";
import { createHash } from "crypto";

import { rollup } from "rollup";
import esbuild from "rollup-plugin-esbuild";
import commonjs from "@rollup/plugin-commonjs";
import nodeResolve from "@rollup/plugin-node-resolve";
import swc from "@swc/core";


const extensions = [
    ".js",
    ".jsx",
    ".mjs",
    ".ts",
    ".tsx",
    ".cts",
    ".mts"
];


/**
 * Rollup plugins
 *
 * These handle:
 * - Node module resolution
 * - CommonJS packages
 * - TypeScript / JSX / JavaScript
 * - Minification
 *
 * @type import("rollup").InputPluginOption
 */
const plugins = [

    nodeResolve(),

    commonjs(),

    {
        name: "swc",

        async transform(code, id) {

            const ext = extname(id);

            if (!extensions.includes(ext)) {
                return null;
            }


            const ts = ext.includes("ts");

            const tsx = ts
                ? ext.endsWith("x")
                : undefined;

            const jsx = !ts
                ? ext.endsWith("x")
                : undefined;


            const result = await swc.transform(
                code,
                {
                    filename: id,

                    jsc: {
                        externalHelpers: true,

                        parser: {
                            syntax:
                                ts
                                    ? "typescript"
                                    : "ecmascript",

                            tsx,
                            jsx
                        }
                    },

                    env: {
                        targets: "defaults",

                        include: [
                            "transform-classes",
                            "transform-arrow-functions"
                        ]
                    }
                }
            );


            return result.code;
        }
    },

    esbuild({
        minify: true
    })

];


/*
 * ---------------------------------------------------------
 * CLEAN DIST
 * ---------------------------------------------------------
 *
 * Every build starts from a completely clean dist folder.
 */

try {

    await rm(
        "./dist",
        {
            recursive: true,
            force: true
        }
    );

} catch (e) {
    // Nothing to clean.
}


await mkdir(
    "./dist",
    {
        recursive: true
    }
);


/*
 * ---------------------------------------------------------
 * READ PLUGINS
 * ---------------------------------------------------------
 *
 * Every folder inside ./plugins is treated as a plugin.
 *
 * Example:
 *
 * plugins/
 * ├── NoDelete+/
 * │   ├── manifest.json
 * │   └── index.ts
 * │
 * └── ValidUser/
 *     ├── manifest.json
 *     └── index.ts
 */

for (
    let plug of await readdir("./plugins")
) {

    try {

        /*
         * Read the plugin manifest.
         */

        const manifest =
            JSON.parse(
                await readFile(
                    `./plugins/${plug}/manifest.json`
                )
            );


        /*
         * Output paths.
         */

        const pluginDist =
            `./dist/${plug}`;

        const outPath =
            `${pluginDist}/index.js`;

        const pluginPage =
            `${pluginDist}/index.html`;

        const pluginManifest =
            `${pluginDist}/manifest.json`;


        /*
         * Make sure the plugin's
         * output directory exists.
         */

        await mkdir(
            pluginDist,
            {
                recursive: true
            }
        );


        /*
         * -------------------------------------------------
         * BUILD PLUGIN
         * -------------------------------------------------
         */

        try {

            const bundle =
                await rollup({

                    input:
                        `./plugins/${plug}/${manifest.main}`,

                    onwarn: () => {},

                    plugins

                });


            /*
             * Write the compiled plugin.
             */

            await bundle.write({

                file: outPath,

                globals(id) {

                    /*
                     * Vendetta imports:
                     *
                     * @vendetta/...
                     *
                     * become:
                     *
                     * window.@vendetta....
                     *
                     * using the same behavior as
                     * the original build system.
                     */

                    if (
                        id.startsWith("@vendetta")
                    ) {

                        return id
                            .substring(1)
                            .replace(/\//g, ".");

                    }


                    const map = {

                        react:
                            "window.React"

                    };


                    return map[id] || null;

                },

                format: "iife",

                compact: true,

                exports: "named"

            });


            await bundle.close();


            /*
             * -------------------------------------------------
             * HASH
             * -------------------------------------------------
             *
             * Generate a SHA-256 hash of the compiled plugin.
             */

            const toHash =
                await readFile(outPath);


            manifest.hash =
                createHash("sha256")
                    .update(toHash)
                    .digest("hex");


            /*
             * The compiled file is now always
             * index.js regardless of the original
             * source filename.
             */

            manifest.main =
                "index.js";


            /*
             * Write the generated manifest.
             */

            await writeFile(
                pluginManifest,
                JSON.stringify(manifest)
            );


            /*
             * -------------------------------------------------
             * PLUGIN WEBSITE PAGE
             * -------------------------------------------------
             *
             * Instead of generating an empty HTML file,
             * copy docs/plugin.html.
             *
             * This gives every plugin its own page:
             *
             * /NoDelete+/
             * /ValidUser/
             * /FixInvalidMentions/
             *
             * The page itself loads ./manifest.json,
             * so it automatically displays the correct
             * plugin information.
             */

            const pluginPageTemplate =
                await readFile(
                    "./docs/plugin.html",
                    "utf8"
                );


            await writeFile(
                pluginPage,
                pluginPageTemplate
            );


            /*
             * Done.
             */

            console.log(
                `✅ Successfully built ${manifest.name}!`
            );

        } catch (e) {

            console.error(
                `❌ Failed to build plugin ${plug}...`,
                e
            );

            process.exit(1);

        }

    } catch (e) {

        /*
         * If a folder doesn't contain a manifest,
         * skip it instead of stopping the entire build.
         */

        console.warn(
            `⚠️ Skipping ${plug} - no manifest.json found`
        );

    }

}