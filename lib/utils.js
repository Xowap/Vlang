const path = require("path");
const fs = require("fs");
const yaml = require("js-yaml");
const Ajv = require("ajv");
const { VlangError } = require("./exceptions");

const validateTransBlock = new Ajv().compile(require("./block-schema.json"));
const validateConfig = new Ajv().compile(require("./config-schema.json"));


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
    const naked = componentPath.replace(/\.(vue|js)$/, "");
    return `${naked}.vlg`;
}

/**
 * Merge several lists of translations
 */
function mergeTranslations(stack) {
    const idx = {};

    for (const block of stack) {
        for (const lang of block) {
            if (!idx[lang.lang]) {
                idx[lang.lang] = { lang: lang.lang, messages: {} };
            }

            Object.assign(idx[lang.lang].messages, lang.messages);
        }
    }

    return idx;
}

/**
 * Loads and validates the configuration file from the root
 *
 * @param root {String} Path to the project's root
 * @return {*}
 */
function loadConfig(root) {
    const configPath = path.join(root, "vlang.yml");
    let configData;

    try {
        configData = fs.readFileSync(configPath, {
            encoding: "utf-8",
            flag: "r",
        });
    } catch (e) {
        throw new VlangError(
            `Could not read file "${configPath}". You need to create this ` +
                `file in order for Vlang to work.`
        );
    }

    const config = yaml.safeLoad(configData);

    if (!config) {
        throw new VlangError(`"${configPath}" has an invalid YAML syntax`);
    }

    if (!validateConfig(config)) {
        throw new VlangError(
            `"${configPath}" has invalid structure:\n` +
                `${new Ajv().errorsText(validateConfig.errors)}`
        );
    }

    return config;
}

module.exports = {
    validateTransBlock,
    mkdir,
    vlangPath,
    mergeTranslations,
    loadConfig,
};
