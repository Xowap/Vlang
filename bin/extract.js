#!/usr/bin/env node
'use strict';

const yaml = require('js-yaml');
const cheerio = require('cheerio');
const ArgumentParser = require('argparse').ArgumentParser;
const walk = require('walk').walk;
const path = require('path');
const fs = require('fs');
const Entities = require('html-entities').AllHtmlEntities;
const {authorize, ensureSheets, insertMissingData} = require('../lib/google');
const {fail, parseConfig, deepSet} = require('../lib/utils');

const entities = new Entities();

/**
 * Parses CLI arguments
 */
function parseArgs() {
    const parser = new ArgumentParser({
        addHelp: true,
        description: 'Vlang strings extractor to send all strings to Google ' +
            'Sheets',
    });

    parser.addArgument(['-r', '--root'], {
        help: 'Sources root. A vlang.yml is expected to be found in this ' +
            'directory.',
        required: true,
    });

    return parser.parseArgs();
}

/**
 * Goes through all the files inside the root and reads their contents
 */
function walkFiles(root) {
    const files = {};

    return new Promise((resolve) => {
        const walker = walk(root, {
            followLinks: false,
        });

        walker.on('file', (root, fileStats, next) => {
            let filePath;

            /**
             * In case a specific file failed
             */
            function failWalker() {
                next();
            }

            /**
             * Computes the real path for the file
             */
            function getPath() {
                const relPath = path.join(root, fileStats.name);
                fs.realpath(relPath, (err, realPath) => {
                    if (err) {
                        return failWalker();
                    }

                    filePath = realPath;

                    getContent();
                });
            }

            /**
             * Reads the file's contents
             */
            function getContent() {
                fs.readFile(filePath, 'utf-8', (err, data) => {
                    if (err) {
                        return failWalker();
                    }

                    files[filePath] = data;

                    next();
                });
            }

            if (fileStats.name.match(/\.vue$/)) {
                getPath();
            } else {
                next();
            }
        });

        walker.on('end', () => resolve(files));
    });
}

/**
 * Parses a component's content to extract messages if any.
 */
function parseComponent(content) {
    const $ = cheerio.load(content);
    const msg = $('messages');

    if (!msg.length) {
        return;
    }

    const y = entities.decode(msg.html());

    return yaml.load(y);
}

/**
 * Transforms a translations dictionary into flat sheets/rows
 */
function flattenTrans(trans, sourceLocale) {
    const data = {};

    for (const locale of Object.keys(trans)) {
        const localeData = trans[locale];
        data[locale] = [];

        for (const fileName of Object.keys(localeData)) {
            const fileData = localeData[fileName];

            for (const key of Object.keys(fileData)) {
                data[locale].push([
                    fileName,
                    key,
                    trans[sourceLocale][fileName][key],
                    fileData[key],
                ]);
            }
        }
    }

    return data;
}

/**
 * Uploads the translations to Google Sheets
 */
function syncToSheets(config, trans, sheetId) {
    const credentials = JSON.parse(
        process.env.GOOGLE_APPLICATION_CREDENTIALS_CONTENT
    );

    console.log(`Syncing to Google Sheet "${sheetId}"...`);

    return authorize(credentials).then(a2c => {
        return ensureSheets(a2c, sheetId, Object.keys(trans)).then(() => {
            const data = flattenTrans(trans, config.source_locale);
            return insertMissingData(a2c, sheetId, data);
        });
    });
}

/**
 * Main code thread, only executed if that file is called from CLI
 */
function main() {
    const args = parseArgs();
    let rootPath;
    let config;
    let files;
    let srcTrans = {};
    let trans = {};

    /**
     * Computes the root's real path
     */
    function getRootPath() {
        fs.realpath(args.root, (err, _rootPath) => {
            if (err) {
                fail(`Could not determine real path for ${args.root}`);
            }

            rootPath = _rootPath;

            getConfig();
        });
    }

    /**
     * Reads the configuration file
     */
    function getConfig() {
        parseConfig(rootPath).then((_config) => {
            config = _config;
            walkRoot();
        });
    }

    /**
     * Extracts the content of all files
     */
    function walkRoot() {
        walkFiles(args.root).then((_files) => {
            files = _files;
            parseFiles();
        });
    }

    /**
     * Parses all the files that can be parsed
     */
    function parseFiles() {
        for (const filePath of Object.keys(files)) {
            const fileContent = files[filePath];
            const shortPath = path.relative(rootPath, filePath);
            const parsed = parseComponent(fileContent);

            if (parsed && shortPath[0] !== '.') {
                srcTrans[shortPath] = parsed;
            }
        }

        for (const filePath of Object.keys(srcTrans)) {
            const fileTrans = srcTrans[filePath];
            const transCache = {};
            const keys = {};
            const locales = {};

            for (const localeTrans of fileTrans) {
                locales[localeTrans.locale] = true;

                for (const key of Object.keys(localeTrans.messages)) {
                    keys[key] = true;

                    deepSet(
                        transCache,
                        [localeTrans.locale, key],
                        localeTrans.messages[key]
                    );
                }
            }

            for (const locale of config.locales) {
                locales[locale] = true;
            }

            for (const locale of Object.keys(locales)) {
                for (const key of Object.keys(keys)) {
                    const value = (transCache[locale] || {})[key] || '';
                    deepSet(trans, [locale, filePath, key], value);
                }
            }
        }

        sync();
    }

    /**
     * Syncs all outputs
     */
    function sync() {
        const tasks = [];

        for (const output of (config.outputs || [])) {
            if (output.type === 'google_sheets') {
                tasks.push(syncToSheets(config, trans, output.id));
            }
        }

        Promise.all(tasks).then(
            () => done(),
            () => fail('Sync failed'),
        );
    }

    function done() {
        process.exit(0);
    }

    getRootPath();
}

if (require.main === module) {
    main();
}
