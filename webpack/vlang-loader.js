const yaml = require("js-yaml");
const { mergeTranslations, validateTransBlock } = require("../lib/utils");
const { loadExternal } = require("../lib/loader");
const Ajv = require("ajv");

/**
 * Extracts messages from the source
 */
function loadLocal(source) {
    return new Promise((resolve, reject) => {
        try {
            const data = yaml.safeLoad(source);

            if (!data) {
                return reject("Messages syntax does not seem valid");
            }

            if (!validateTransBlock(data)) {
                return reject(
                    new Error(
                        `Could not validate messages block syntax.\n` +
                            `${new Ajv().errorsText(validateTransBlock.errors)}`
                    )
                );
            }

            resolve(data);
        } catch (e) {
            reject(e);
        }
    });
}

module.exports = function (source, map) {
    const { rootContext, resourcePath } = this;
    const context = rootContext || process.cwd();
    const callback = this.async();
    const tasks = [loadLocal(source), loadExternal(context, resourcePath)];

    Promise.all(tasks).then(
        (data) => {
            const trans = mergeTranslations(data);

            const out = `module.exports = function (Component) {
                Component.options.__messages = ${JSON.stringify(trans)};
            };`;

            callback(null, out, map);
        },
        (err) => {
            callback(err);
        }
    );
};
