const Ajv = require("ajv");
const { parseVljs, makeVljsRegExp } = require("../lib/parser");
const { mergeTranslations, validateTransBlock } = require("../lib/utils");
const { loadExternal } = require("../lib/loader");

/**
 * Extracts the VLANG data found in the provided source code
 */
async function loadLocal(source) {
    const data = parseVljs(source) || [];

    if (!validateTransBlock(data)) {
        throw new Error(
            `Could not validate messages block syntax.\n` +
                `${new Ajv().errorsText(validateTransBlock.errors)}`
        );
    }
}

/**
 * Parses a JS file and if some VLANG block exists in it then its parsed
 * content is assigned to this.__messages on top of the file so it can later
 * be used by the code itself.
 *
 * This will also look for a .vlg file which contains additional/overridden
 * translations imported from external sources.
 *
 * @param source
 * @param map
 */
module.exports = function (source, map) {
    const { rootContext, resourcePath } = this;
    const context = rootContext || process.cwd();
    const callback = this.async();
    const tasks = [loadLocal(source), loadExternal(context, resourcePath)];

    Promise.all(tasks).then(
        (data) => {
            const trans = mergeTranslations(data.filter((x) => x));
            const out = source.replace(makeVljsRegExp(), () =>
                JSON.stringify(trans)
            );

            callback(null, out, map);
        },
        (err) => {
            callback(err);
        }
    );
};
