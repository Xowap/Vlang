'use strict';

const path = require('path');
const fs = require('fs');
const yaml = require('js-yaml');

/**
 * Call this when a fatal error occurred and you want to exit the program
 */
function fail(msg) {
    console.error(msg);
    process.exit(1);
}

/**
 * Parses the configuration file
 */
function parseConfig(root) {
    const configPath = path.join(root, 'vlang.yml');

    return new Promise((resolve) => {
        fs.readFile(configPath, 'utf-8', (err, data) => {
            if (err) {
                fail(`Could not read config file "${configPath}"`);
            }

            const config = yaml.safeLoad(data);

            if (!config) {
                fail(`Syntax of "${configPath}" does not seem valid`);
            }

            resolve(config);
        });
    });
}

function deepSet(obj, path, value) {
    let ptr = obj;

    while (true) {
        const key = path.shift();

        if (key === undefined) {
            return;
        }

        const needCreate =
            path.length > 0 && !Object.prototype.hasOwnProperty.call(ptr, key);

        if (needCreate) {
            ptr[key] = {};
        } else if (path.length === 0) {
            ptr[key] = value;
        }

        ptr = ptr[key];
    }
}

/**
 * Creates a directory like `mkdir -p`
 */
function mkdir(dirPath) {
    const stack = [dirPath];

    while (true) {
        const last = stack[stack.length - 1];
        const parent = path.dirname(last);

        if (parent === last) {
            break;
        }

        stack.push(parent);
    }

    const unStack = stack.reverse();

    for (const createPath of unStack) {
        if (!fs.existsSync(createPath)) {
            fs.mkdirSync(createPath);
        }
    }
}

/**
 * Transforms a component path into a vlang path
 */
function vlangPath(componentPath) {
    const naked = componentPath.replace(/\.(vue|js)$/, '');
    return `${naked}.vlg`;
}

/**
 * Merge several lists of translations
 */
function mergeTranslations(stack) {
    const out = [stack[0][0]];

    for (const source of stack) {
        for (const next of source) {
            let merged = false;

            for (const base of out) {
                if (base.locale === next.locale) {
                    Object.assign(base.messages, next.messages);
                    merged = true;
                    break;
                }
            }

            if (!merged) {
                out.push(next);
            }
        }
    }

    return out;
}

module.exports = {
    fail,
    parseConfig,
    deepSet,
    mkdir,
    vlangPath,
    mergeTranslations,
};
