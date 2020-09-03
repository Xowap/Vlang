const yaml = require("js-yaml");
const path = require("path");
const { promises: fsp } = require("fs");
const { vlangPath, validateTransBlock, loadConfig } = require("./utils");
const Ajv = require('ajv');

/**
 * Loads translations from an external source. Will resolve to an empty list in
 * case of missing file or incorrect syntax.
 */
async function loadExternal(root, componentPath) {
    const config = loadConfig(root);
    const relPath = path.relative(root, componentPath);

    if (relPath[0] === ".") {
        return [];
    }

    if (!config.i18n_directory) {
        throw new Error("No `i18n_directory` found in configuration file");
    }

    const i18nDir = path.join(root, config.i18n_directory);
    const vlgFilePath = path.join(i18nDir, vlangPath(relPath));
    let transData;

    try {
        transData = await fsp.readFile(vlgFilePath, {
            encoding: "utf-8",
            flag: "r",
        });
    } catch (e) {
        return [];
    }

    const trans = yaml.safeLoad(transData);

    if (!validateTransBlock(trans)) {
        throw new Error(
            `Could not validate JS trans comment syntax.\n` +
                `${new Ajv().errorsText(validateTransBlock.errors)}`
        );
    }

    return trans || [];
}

module.exports = {
    loadExternal,
};
