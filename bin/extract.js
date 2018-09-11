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
const {parseVljs} = require('../lib/parser');

const entities = new Entities();

const IGNORED_DIRS = [
    '.git',
    'node_modules',
    '.idea',
    '.vscode',
];

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
function walkFiles(root, extension = 'vue') {
    const files = {};

    return new Promise((resolve) => {
        const walker = walk(root, {
            followLinks: false,
        });

        walker.on('directories', (root, directories, next) => {
            for (let i = 0; i < directories.length; i += 1) {
                const dir = directories[i];

                if (IGNORED_DIRS.indexOf(dir.name) >= 0) {
                    delete directories[i];
                }
            }

            next();
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

            if (fileStats.name.match(new RegExp(`\.${extension}\$`))) {
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

    return yaml.safeLoad(y);
}

/**
 * Converts all messages into the pluralized format, even static ones. This is
 * to simplify the handling of flattening and get a single code path
 * independently of static/pluralized
 */
function ensurePluralizedFormat(message) {
    if (typeof message === 'string') {
        return {'': message};
    }

    return message;
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
                const message = ensurePluralizedFormat(fileData[key]);
                const sourceMessage =
                    ensurePluralizedFormat(trans[sourceLocale][fileName][key]);

                for (const range of Object.keys(sourceMessage)) {
                    const text = message[range] || sourceMessage[range];
                    const sourceText = sourceMessage[range];

                    data[locale].push([
                        fileName,
                        key,
                        range,
                        sourceText,
                        text,
                    ]);
                }
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
    let vueFiles;
    let vljsFiles;
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
        Promise.all([
            walkFiles(args.root, 'vue').then((_files) => {
                vueFiles = _files;
            }),
            walkFiles(args.root, 'js').then((_files) => {
                vljsFiles = _files;
            }),
        ]).then(() => parseFiles());
    }

    /**
     * Parses all the files that can be parsed
     */
    function parseFiles() {
        function extract(files, parser) {
            for (const filePath of Object.keys(files)) {
                const fileContent = files[filePath];
                const shortPath = path.relative(rootPath, filePath);
                const parsed = parser(fileContent);

                if (parsed && shortPath[0] !== '.') {
                    srcTrans[shortPath] = parsed;
                }
            }
        }

        extract(vueFiles, parseComponent);
        extract(vljsFiles, parseVljs);

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
