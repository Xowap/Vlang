#!/usr/bin/env node
const path = require("path");
const { ArgumentParser } = require("argparse");
const { VlangError } = require("../lib/exceptions");
const { saveExternalDict, dictFromExternals } = require("../lib/dict");
const { loadConfig } = require("../lib/utils");

function parseArgs(argv) {
    const parser = new ArgumentParser({
        add_help: true,
        description: "Vlang strings importer from Google Sheets to .vlg files",
    });

    parser.add_argument("-r", "--root", {
        help:
            "Sources root. A vlang.yml is expected to be found in this " +
            "directory",
        required: true,
    });

    return parser.parse_args(argv);
}

async function main(argv = undefined) {
    const args = parseArgs(argv);
    const config = loadConfig(args.root);
    const externalDict = await dictFromExternals(config.inputs);
    const i18nRoot = path.join(args.root, config.i18n_directory);
    saveExternalDict(i18nRoot, externalDict, config.filters || {});
}

if (require.main === module) {
    main().then(
        () => process.exit(0),
        (e) => {
            if (e instanceof VlangError) {
                console.error(e.message);
            } else {
                console.error(e);
            }

            process.exit(1);
        }
    );
}
