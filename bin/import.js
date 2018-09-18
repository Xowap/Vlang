#!/usr/bin/env node
'use strict';

const ArgumentParser = require('argparse').ArgumentParser;
const mergeOptions = require('merge-options');
const path = require('path');
const fs = require('fs');
const yaml = require('js-yaml');
const {fail, parseConfig, deepSet, mkdir, vlangPath} = require('../lib/utils');
const {authorize, dumpData} = require('../lib/google');
const filtersLib = require('../lib/filters');

/**
 * Parses CLI arguments
 */
function parseArgs() {
    const parser = new ArgumentParser({
        addHelp: true,
        description: 'Imports back vlang strings from Google Sheets',
    });

    parser.addArgument(['-r', '--root'], {
        help: 'Sources root. A vlang.yml is expected to be found in this ' +
            'directory.',
        required: true,
    });

    return parser.parseArgs();
}

/**
 * Applies locale-related filters to this string, if any is found in the
 * configuration.
 *
 * @param config {object} Un-serialized configuration
 * @param locale {string} Locale of the message
 * @param str {string} The message itself
 */
function applyFilters(config, locale, str) {
    if (!config.filters[locale]) {
        return str;
    }

    const filters = config.filters[locale].map(x => filtersLib[x]);
    let out = str;

    for (const filter of filters) {
        out = filter(out);
    }

    return out;
}

/**
 * Gets the translations from the Google sheets and transforms into internal
 * representation. It's a promise that will resolve into the final output.
 */
function getGoogleContent(config, sheetId) {
    const credentials = JSON.parse(
        process.env.GOOGLE_APPLICATION_CREDENTIALS_CONTENT
    );

    return authorize(credentials).then((a2c) => {
        return dumpData(a2c, sheetId);
    }).then((data) => {
        const allTrans = {};

        for (const locale of Object.keys(data)) {
            const trans = data[locale];

            for (const row of trans) {
                const isValid = row.Translation
                    && row.Key
                    && row.Component.match(/\.(vue|js)$/);

                const trans = applyFilters(config, locale, row.Translation);

                if (isValid) {
                    deepSet(
                        allTrans,
                        [row.Component, locale, row.Key, row.Range],
                        trans
                    );
                }
            }
        }

        const out = {};

        for (const component of Object.keys(allTrans)) {
            out[component] = [];

            for (const locale of Object.keys(allTrans[component])) {
                const messages = allTrans[component][locale];

                for (const key of Object.keys(messages)) {
                    if (messages[key][''] !== undefined) {
                        messages[key] = messages[key][''];
                    }
                }

                out[component].push({
                    locale,
                    messages,
                });
            }
        }

        return out;
    });
}

/**
 * Go through all configured sources to get all the data
 */
function makeAllContents(config) {
    const tasks = [];

    for (const input of config.inputs) {
        if (input.type === 'google_sheets') {
            tasks.push(getGoogleContent(config, input.id));
        }
    }

    return Promise.all(tasks).then((values) => {
        return mergeOptions(...values);
    });
}

/**
 * Dumps all data as .vlg files into the i18nDir.
 */
function dumpToFiles(i18nDir, data) {
    for (const component of Object.keys(data)) {
        const trans = data[component];
        const targetPath = path.join(i18nDir, vlangPath(component));
        mkdir(path.dirname(targetPath));

        trans.sort((a, b) => {
            if (a.locale < b.locale) {
                return -1;
            } else if (a.locale === b.locale) {
                return 0;
            }

            return 1;
        });

        const content = yaml.safeDump(trans, {
            lineWidth: 79,
        });
        fs.writeFileSync(targetPath, content);
    }
}

/**
 * Main code thread
 */
function main() {
    const args = parseArgs();
    let config;

    parseConfig(args.root).then((_config) => {
        config = _config;
        return makeAllContents(config);
    }).then((data) => {
        const root = path.join(args.root, config.i18n_directory);
        return dumpToFiles(root, data);
    }).then(
        () => process.exit(0),
        (e) => {
            fail(e);
            process.exit(1);
        }
    );
}

if (require.main === module) {
    main();
}
