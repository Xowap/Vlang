const {getOptions} = require('loader-utils');
const {parseVljs} = require('./lib/parser');
const {mergeTranslations} = require('./lib/utils');
const {loadExternal} = require('./lib/loader');


/**
 * Extracts the VLANG data found in the provided source code
 */
function loadLocal(source) {
    return new Promise((resolve, reject) => {
        try {
            const data = parseVljs(source);
            resolve(data || []);
        } catch (e) {
            reject(e);
        }
    });
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
    const callback = this.async();
    const options = getOptions(this);
    const tasks = [
        loadLocal(source),
        loadExternal(options.root, this.resourcePath),
    ];

    Promise.all(tasks).then(
        (data) => {
            const trans = mergeTranslations(data);
            const out = (
                `this.__messages = ${JSON.stringify(trans)};\n\n${source}`
            );

            callback(null, out, map);
        },
        (err) => {
            callback(err);
        },
    );
};
