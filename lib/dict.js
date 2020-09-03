const path = require("path");
const yaml = require("js-yaml");
const fs = require("fs");
const { extractFile } = require("./extract");
const { VlangError } = require("./exceptions");
const { GoogleSource, getA2c } = require("./google");
const { validateTransBlock, mkdir } = require("./utils");
const filtersLib = require("./filters");

/**
 * Extracts the dictionary from all individual files and merges the content
 *
 * @param root {String} Path to the root of the project
 * @param files {Array[String]} List of file paths to extract
 */
function dictFromFiles(root, files) {
    const out = {};

    for (const file of files) {
        Object.assign(out, extractFile(root, file));
    }

    return out;
}

/**
 * Extracts the fill dictionary from a Google Sheets document
 *
 * @param sheetId {String} ID of the document
 */
async function dictFromGoogleSheets(sheetId) {
    const a2c = await getA2c();
    const source = new GoogleSource(a2c, sheetId);
    return await source.makeDict();
}

/**
 * Composes a dictionary from all external sources. So far only Google sheets
 * is managed.
 *
 * @param externals List of externals from the config (either inputs or
 *                  outputs)
 */
async function dictFromExternals(externals) {
    const out = {};

    for (const ext of externals) {
        if (ext.type === "google_sheets") {
            Object.assign(out, await dictFromGoogleSheets(ext.id));
        } else {
            throw new VlangError(`Unknown input type "${ext.type}"`);
        }
    }

    return out;
}

/**
 * Given the internal and the external dictionaries (outputs of the
 * dictFromFiles() and the dictFromExternals() functions) + the list of
 * languages we have to support, generates a dictionary containing all the
 * missing lines from the external sources, in order to insert them.
 *
 * @param internal Internal dictionary (straight out from the source code)
 * @param external External dictionary (from external sources like Google)
 * @param languages List of languages we want to support
 */
function newLinesToSync(internal, external, languages) {
    const out = {};

    for (const [key, message] of Object.entries(internal)) {
        if (!Object.prototype.hasOwnProperty.call(external, key)) {
            out[key] = message;
        }

        for (const lang of languages) {
            const oldKey = JSON.parse(key);
            const newKey = JSON.stringify([lang, oldKey[1], oldKey[2]]);

            if (
                !out[newKey] &&
                !Object.prototype.hasOwnProperty.call(external, newKey)
            ) {
                out[newKey] = message;
            }
        }
    }

    return out;
}

/**
 * Sends the new lines to Google Sheets
 *
 * @param sheetId {String} ID of the Google sheet we're sending this to
 * @param dict {Object} Output of newLinesToSync()
 */
async function syncNewLinesToGoogleSheets(sheetId, dict) {
    const a2c = await getA2c();
    const source = new GoogleSource(a2c, sheetId);
    await source.insertNewLines(dict);
}

/**
 * Sends all the new lines to the outputs configured
 *
 * @param externals {Array} Outputs as specified by the configuration
 * @param dict {Object} Output of newLinesToSync()
 */
async function syncNewLines(externals, dict) {
    for (const ext of externals) {
        if (ext.type === "google_sheets") {
            await syncNewLinesToGoogleSheets(ext.id, dict);
        } else {
            throw new VlangError(`Unknown input type "${ext.type}"`);
        }
    }
}

/**
 * Generates the path to the `.vlg` file for this component
 *
 * @param i18nRoot {String} Path to the i18n folder
 * @param fileName {String} Name of the current component
 * @return {string}
 */
function componentPath(i18nRoot, fileName) {
    return path.join(i18nRoot, `${fileName.replace(/\.(vue|js)$/i, "")}.vlg`);
}

/**
 * Filters a message before inserting it into the `.vlg` file
 *
 * - Trims the text so that a single space cannot be mistaken with a
 *   valid translation
 * - If there is language-specific filters, apply them as well
 *
 * @param message {String} Message to be filters
 * @param lang {String} Language of the message
 * @param filters {String} Filters from configuration
 */
function filterMessage(message, lang, filters) {
    message = message || "";
    message = message.trim();

    for (const filterName of (filters[lang] || [])) {
        if (typeof filtersLib[filterName] !== 'function') {
            throw new VlangError(`Filter "${filterName}" is not available`);
        }

        message = filtersLib[filterName](message);
    }

    return message;
}

/**
 * From the internal dict structure, generates all the `.vlg` structures for
 * all the components and index them in a big map.
 *
 * Please note that all empty translations are discarded, making it easier to
 * change the text from the original code of no wording adjustment has been
 * made in the Google Sheet.
 *
 * @param dict {Object} Global dictionary of translations
 * @param i18nRoot {String} Path to the i18n directory
 * @param filters {Object} Filters from configuration
 */
function sortDictByFile(dict, i18nRoot, filters) {
    const files = {};

    for (const [globalKey, message] of Object.entries(dict)) {
        const [lang, component, key] = JSON.parse(globalKey);
        const cPath = componentPath(i18nRoot, component);
        let realMessage;

        if (message.original || message.translation) {
            realMessage = filterMessage(message.translation, lang, filters);
        } else {
            realMessage = {};

            for (const [range, text] of Object.entries(message)) {
                const cleanText = filterMessage(text.translation, lang, filters);
                if (cleanText) {
                    realMessage[range] = cleanText;
                }
            }

            if (Object.keys(realMessage).length === 0) {
                realMessage = undefined;
            }
        }

        if (realMessage) {
            if (!files[cPath]) {
                files[cPath] = {};
            }

            if (!files[cPath][lang]) {
                files[cPath][lang] = {};
            }

            files[cPath][lang][key] = realMessage;
        }
    }

    return files;
}

/**
 * Generates the content of `.vlg` files and checks their validity. There
 * should not be any schema error except for the ranges that can be set by
 * translators.
 *
 * @param fileDict {Object} Data for this file
 * @param filePath {String} Storage path of the file
 */
function generateFileContent(fileDict, filePath) {
    const out = [];

    for (const [lang, messages] of Object.entries(fileDict)) {
        out.push({ lang, messages });
    }

    if (!validateTransBlock(out)) {
        throw new VlangError(
            `Cannot validate generated translation for "${filePath}". ` +
                `Most likely the source document has a weird range somewhere.`
        );
    }

    return yaml.safeDump(out);
}

/**
 * Converts the external dictionary into `.vlg` files and writes them to the
 * hard drive.
 *
 * @param i18nRoot {String} Path to the i18n dictionary
 * @param dict {Object} Global translation dict
 * @param filters {Object} Filters from configuration
 */
function saveExternalDict(i18nRoot, dict, filters) {
    const files = sortDictByFile(dict, i18nRoot, filters);

    for (const [filePath, fileDict] of Object.entries(files)) {
        const content = generateFileContent(fileDict, filePath);
        mkdir(path.dirname(filePath));
        fs.writeFileSync(filePath, content, { encoding: "utf-8" });
    }
}

module.exports = {
    dictFromFiles,
    dictFromExternals,
    newLinesToSync,
    syncNewLines,
    saveExternalDict,
};
