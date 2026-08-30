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


/*
 * ---------------------------------------------------------
 * ROLLUP PLUGINS
 * ---------------------------------------------------------
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

            const isTypeScript =
                ext.includes("ts");

            const isTSX =
                isTypeScript &&
                ext.endsWith("x");

            const isJSX =
                !isTypeScript &&
                ext.endsWith("x");


            const result =
                await swc.transform(
                    code,
                    {
                        filename: id,

                        jsc: {
                            externalHelpers: true,

                            parser: {
                                syntax:
                                    isTypeScript
                                        ? "typescript"
                                        : "ecmascript",

                                tsx: isTSX,
                                jsx: isJSX
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


            return {
                code: result.code,
                map: result.map
            };

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
 */

await rm(
    "./dist",
    {
        recursive: true,
        force: true
    }
);


await mkdir(
    "./dist",
    {
        recursive: true
    }
);


/*
 * ---------------------------------------------------------
 * LOAD PLUGIN PAGE TEMPLATE
 * ---------------------------------------------------------
 *
 * This is the page that every plugin gets.
 *
 * Example:
 *
 * /NoDelete+/
 * /ValidUser/
 * /FixInvalidMentions/
 *
 * Each generated folder gets:
 *
 * index.js
 * manifest.json
 * index.html
 *
 * ---------------------------------------------------------
 */

let pluginPageTemplate;

try {

    pluginPageTemplate =
        await readFile(
            "./docs/plugin.html",
            "utf8"
        );

} catch (error) {

    console.error(
        "❌ docs/plugin.html could not be found."
    );

    console.error(
        "Create docs/plugin.html before running the build."
    );

    process.exit(1);

}


/*
 * ---------------------------------------------------------
 * FIND PLUGINS
 * ---------------------------------------------------------
 */

const pluginFolders =
    await readdir(
        "./plugins",
        {
            withFileTypes: true
        }
    );


const pluginsToBuild =
    pluginFolders.filter(
        entry =>
            entry.isDirectory()
    );


/*
 * ---------------------------------------------------------
 * BUILD EVERY PLUGIN
 * ---------------------------------------------------------
 */

for (const pluginFolder of pluginsToBuild) {

    const plug =
        pluginFolder.name;


    try {

        /*
         * -------------------------------------------------
         * READ MANIFEST
         * -------------------------------------------------
         */

        const manifestPath =
            `./plugins/${plug}/manifest.json`;


        let manifest;

        try {

            manifest =
                JSON.parse(
                    await readFile(
                        manifestPath,
                        "utf8"
                    )
                );

        } catch (error) {

            console.warn(
                `⚠️ Skipping ${plug} - manifest.json not found or invalid.`
            );

            continue;

        }


        /*
         * -------------------------------------------------
         * OUTPUT DIRECTORY
         * -------------------------------------------------
         */

        const pluginDist =
            `./dist/${plug}`;


        await mkdir(
            pluginDist,
            {
                recursive: true
            }
        );


        const outputFile =
            `${pluginDist}/index.js`;


        /*
         * -------------------------------------------------
         * BUILD PLUGIN
         * -------------------------------------------------
         */

        const bundle =
            await rollup({

                input:
                    `./plugins/${plug}/${manifest.main}`,

                onwarn(warning, warn) {

                    /*
                     * Keep the original behavior of
                     * ignoring Rollup warnings.
                     */

                    if (
                        warning.code ===
                        "CIRCULAR_DEPENDENCY"
                    ) {
                        return;
                    }

                    warn(warning);

                },

                plugins

            });


        /*
         * -------------------------------------------------
         * WRITE BUNDLE
         * -------------------------------------------------
         */

        await bundle.write({

            file:
                outputFile,

            format:
                "iife",

            compact:
                true,

            exports:
                "named",

            globals(id) {

                /*
                 * Vendetta modules
                 *
                 * @vendetta/foo
                 *
                 * become:
                 *
                 * window.@vendetta.foo
                 */

                if (
                    id.startsWith("@vendetta")
                ) {

                    return id
                        .substring(1)
                        .replace(
                            /\//g,
                            "."
                        );

                }


                /*
                 * React
                 */

                if (
                    id === "react"
                ) {

                    return "window.React";

                }


                return null;

            }

        });


        await bundle.close();


        /*
         * -------------------------------------------------
         * HASH
         * -------------------------------------------------
         */

        const compiledPlugin =
            await readFile(
                outputFile
            );


        manifest.hash =
            createHash("sha256")
                .update(compiledPlugin)
                .digest("hex");


        /*
         * The built plugin is always called
         * index.js.
         */

        manifest.main =
            "index.js";


        /*
         * -------------------------------------------------
         * WRITE MANIFEST
         * -------------------------------------------------
         */

        await writeFile(

            `${pluginDist}/manifest.json`,

            JSON.stringify(
                manifest,
                null,
                2
            )

        );


        /*
         * -------------------------------------------------
         * WRITE PLUGIN WEBSITE
         * -------------------------------------------------
         *
         * Every plugin gets its own index.html.
         *
         * Example:
         *
         * dist/NoDelete+/index.html
         *
         * dist/ValidUser/index.html
         *
         * dist/FixInvalidMentions/index.html
         *
         * The page reads ./manifest.json automatically.
         */

        await writeFile(

            `${pluginDist}/index.html`,

            pluginPageTemplate

        );


        console.log(
            `✅ Successfully built ${manifest.name || plug}!`
        );


    } catch (error) {

        console.error(
            `❌ Failed to build plugin ${plug}`
        );

        console.error(error);

        process.exit(1);

    }

}


/*
 * ---------------------------------------------------------
 * COPY MAIN WEBSITE
 * ---------------------------------------------------------
 *
 * docs/index.html becomes:
 *
 * dist/index.html
 *
 * This is the homepage:
 *
 * https://fshinz.pages.dev/
 *
 * ---------------------------------------------------------
 */

try {

    const homepage =
        await readFile(
            "./docs/index.html",
            "utf8"
        );


    await writeFile(
        "./dist/index.html",
        homepage
    );


} catch (error) {

    console.error(
        "❌ docs/index.html could not be found."
    );

    process.exit(1);

}


/*
 * ---------------------------------------------------------
 * NOJEKILL
 * ---------------------------------------------------------
 *
 * Makes sure GitHub Pages / static hosting doesn't
 * accidentally treat the output as something else.
 * ---------------------------------------------------------
 */

try {

    await writeFile(
        "./dist/.nojekyll",
        ""
    );

} catch {
    // Ignore.
}


/*
 * ---------------------------------------------------------
 * DONE
 * ---------------------------------------------------------
 */

console.log("");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("✅ Build completed successfully!");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("");
console.log(
    `Built ${pluginsToBuild.length} plugin(s).`
);
console.log("");