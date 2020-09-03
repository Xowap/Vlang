#!/usr/bin/env node
const { ArgumentParser } = require("argparse");
const { VlangError } = require("../lib/exceptions");
const { makeIgnoreList, findFiles } = require("../lib/extract");
const {
    dictFromFiles,
    dictFromExternals,
    newLinesToSync,
    syncNewLines,
} = require("../lib/dict");
const { loadConfig } = require("../lib/utils");

/**
 * Parses arguments from CLI
 * @param argv Array of string arugments
 */
function parseArgs(argv) {
    const parser = new ArgumentParser({
        add_help: true,
        description:
            "Vlang strings extractor to send all strings to Google Sheets",
    });

    parser.add_argument("-r", "--root", {
        help:
            "Sources root. A vlang.yml is expected to be found in this " +
            "directory",
        required: true,
    });

    parser.add_argument("-i", "--ignore-file", {
        help:
            "Ignore file to be used. Defaults to the .gitignore found in " +
            "the root, if any.",
    });

    parser.add_argument("--check-hidden-files", {
        help: "Don't ignore hidden files/folders for parsing",
        action: "store_true",
        default: false,
    });

    return parser.parse_args(argv);
}

/**
 * Unrolls the code to extract from the server
 * @param argv Array of string arguments to execute
 */
async function main(argv = undefined) {
    const args = parseArgs(argv);
    const config = loadConfig(args.root);
    const ignoreList = makeIgnoreList(args);
    const files = findFiles({ root: args.root, ignoreList });
    const filesDict = dictFromFiles(args.root, files);
    const externalDict = await dictFromExternals(config.outputs);
    const newLines = newLinesToSync(filesDict, externalDict, config.locales);
    await syncNewLines(config.outputs, newLines);

    console.log({ files, newLines, outputs: config.outputs });
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
