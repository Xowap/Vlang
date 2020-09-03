const path = require("path");
const fs = require("fs");
const parseGitIgnore = require("parse-gitignore");
const fg = require("fast-glob");
const { parseVljs, parseComponent } = require("../lib/parser");
const { validateTransBlock } = require("../lib/utils");

/**
 * Generates the ignore list based on the the gitignore found in the project's
 * root.
 *
 * @param root {String} Project's root
 * @param ignoreFile {String} Alternate location for the gitignore file
 * @param checkHiddenFiles {Boolean} Force checking hidden files
 */
function makeIgnoreList({
    root,
    ignore_file: ignoreFile,
    check_hidden_files: checkHiddenFiles,
}) {
    const out = [];

    if (!checkHiddenFiles) {
        out.push(".*");
    }

    if (!ignoreFile) {
        ignoreFile = path.join(root, ".gitignore");
    }

    if (fs.existsSync(ignoreFile)) {
        out.push(
            ...parseGitIgnore(
                fs.readFileSync(ignoreFile, { encoding: "utf-8", flag: "r" })
            )
        );
    }

    return out;
}

/**
 * Given the ignored files, walks down the project root and returns the list
 * of .js and .vue files.
 *
 * @param root {String} Root directory
 * @param ignoreList {Array} List of ignored files from makeIgnoreList()
 * @param pattern {RegExp} Matching pattern for files
 */
function findFiles({ root, ignoreList, pattern = /\.(js|vue)$/i }) {
    return fg
        .sync(path.join(root, "**"), { ignore: ignoreList, onlyFiles: true })
        .filter((x) => pattern.test(x));
}

/**
 * Gets and validates the content of a source code file (either a .vue or a
 * .js file). The distinction is made by the parser function given as argument.
 * If the file contains no or invalid data then it is ignore. Please note that
 * this only affects the "extract" part, not the Webpack loaders (which will
 * report syntax errors).
 *
 * @param filePath {String} Path of the file to parse
 * @param parser {Function} Parses the file with its respective syntax
 */
function getFileContent(filePath, parser) {
    const content = fs.readFileSync(filePath, { encoding: "utf-8", flag: "r" });
    const data = parser(content);

    if (!data) {
        return [];
    }

    if (!validateTransBlock(data)) {
        return [];
    }

    return data;
}

/**
 * Parses the content of a file and generates the part of the dictionary that
 * relates to it.
 *
 * @param root {String} Root of the project
 * @param filePath {String} Path to the file
 */
function extractFile(root, filePath) {
    let content;

    if (/\.js$/i.test(filePath)) {
        content = getFileContent(filePath, parseVljs);
    } else if (/\.vue$/i.test(filePath)) {
        content = getFileContent(filePath, parseComponent);
    }

    const component = path.relative(root, filePath);
    const out = {};

    for (const block of content) {
        for (const [key, message] of Object.entries(block.messages)) {
            const globalKey = JSON.stringify([block.lang, component, key]);

            if (typeof message === "string") {
                out[globalKey] = { original: message };
            } else {
                const obj = {};

                for (const [range, original] of Object.entries(message)) {
                    obj[range] = { original };
                }

                out[globalKey] = obj;
            }
        }
    }

    return out;
}

module.exports = { makeIgnoreList, findFiles, extractFile };
