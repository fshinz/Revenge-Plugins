import { readFile, writeFile, readdir, mkdir, rm } from "fs/promises";
import { extname } from "path";
import { createHash } from "crypto";

import { rollup } from "rollup";
import esbuild from "rollup-plugin-esbuild";
import commonjs from "@rollup/plugin-commonjs";
import nodeResolve from "@rollup/plugin-node-resolve";
import swc from "@swc/core";

const extensions = [".js", ".jsx", ".mjs", ".ts", ".tsx", ".cts", ".mts"];

/*
 * ---------------------------------------------------------
 * ROLLUP PLUGINS
 * ---------------------------------------------------------
 */

const plugins = [
    nodeResolve({ extensions }),

    commonjs(),

    {
        name: "swc",
        async transform(code, id) {
            const ext = extname(id);
            if (!extensions.includes(ext)) return null;

            const isTypeScript = ext.includes("ts");
            const isTSX = isTypeScript && ext.endsWith("x");
            const isJSX = !isTypeScript && ext.endsWith("x");

            const result = await swc.transform(code, {
                filename: id,
                jsc: {
                    externalHelpers: false, // Prevents missing @swc/helpers runtime errors
                    parser: {
                        syntax: isTypeScript ? "typescript" : "ecmascript",
                        tsx: isTSX,
                        jsx: isJSX,
                    },
                },
                env: {
                    targets: "defaults",
                    include: ["transform-classes", "transform-arrow-functions"],
                },
            });

            return {
                code: result.code,
                map: result.map,
            };
        },
    },

    esbuild({
        minify: true,
    }),
];

/*
 * ---------------------------------------------------------
 * CLEAN DIST
 * ---------------------------------------------------------
 */

await rm("./dist", { recursive: true, force: true });
await mkdir("./dist", { recursive: true });

/*
 * ---------------------------------------------------------
 * LOAD PLUGIN PAGE TEMPLATE
 * ---------------------------------------------------------
 */

let pluginPageTemplate;
try {
    pluginPageTemplate = await readFile("./docs/plugin.html", "utf8");
} catch (error) {
    console.error("❌ docs/plugin.html could not be found.");
    process.exit(1);
}

/*
 * ---------------------------------------------------------
 * FIND PLUGINS
 * ---------------------------------------------------------
 */

const pluginFolders = await readdir("./plugins", { withFileTypes: true });
const pluginsToBuild = pluginFolders.filter((entry) => entry.isDirectory());

/*
 * ---------------------------------------------------------
 * BUILD EVERY PLUGIN
 * ---------------------------------------------------------
 */

for (const pluginFolder of pluginsToBuild) {
    const plug = pluginFolder.name;

    try {
        const manifestPath = `./plugins/${plug}/manifest.json`;
        let manifest;

        try {
            manifest = JSON.parse(await readFile(manifestPath, "utf8"));
        } catch {
            console.warn(`⚠️ Skipping ${plug} - manifest.json missing or invalid.`);
            continue;
        }

        const pluginDist = `./dist/${plug}`;
        await mkdir(pluginDist, { recursive: true });
        const outputFile = `${pluginDist}/index.js`;

        const bundle = await rollup({
            input: `./plugins/${plug}/${manifest.main}`,
            /* 
             * Tell Rollup that @vendetta modules and React are external
             * so it maps them properly instead of bundling them or failing.
             */
            external: (id) => id.startsWith("@vendetta") || id === "react",
            onwarn(warning, warn) {
                if (warning.code === "CIRCULAR_DEPENDENCY") return;
                warn(warning);
            },
            plugins,
        });

        await bundle.write({
            file: outputFile,
            format: "iife",
            compact: true,
            exports: "named",
            globals(id) {
                if (id.startsWith("@vendetta")) {
                    return id.substring(1).replace(/\//g, ".");
                }
                if (id === "react") return "React";
                return null;
            },
        });

        await bundle.close();

        /*
         * HASH & UPDATE MANIFEST
         */
        const compiledPlugin = await readFile(outputFile);
        manifest.hash = createHash("sha256").update(compiledPlugin).digest("hex");
        manifest.main = "index.js";

        await writeFile(`${pluginDist}/manifest.json`, JSON.stringify(manifest, null, 2));
        await writeFile(`${pluginDist}/index.html`, pluginPageTemplate);

        console.log(`✅ Successfully built ${manifest.name || plug}!`);
    } catch (error) {
        console.error(`❌ Failed to build plugin ${plug}`);
        console.error(error);
        process.exit(1);
    }
}

/*
 * ---------------------------------------------------------
 * COPY MAIN WEBSITE & NOJEKYLL
 * ---------------------------------------------------------
 */

try {
    const homepage = await readFile("./docs/index.html", "utf8");
    await writeFile("./dist/index.html", homepage);
    await writeFile("./dist/.nojekyll", "");
} catch (error) {
    console.error("❌ docs/index.html could not be found.");
    process.exit(1);
}

console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log(`✅ Build completed! Built ${pluginsToBuild.length} plugin(s).`);
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
