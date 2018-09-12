const yaml = require('js-yaml');
const {getOptions} = require('loader-utils');
const {mergeTranslations} = require('./lib/utils');
const {loadExternal} = require('./lib/loader');

/**
 * Extracts messages from the source
 */
function loadLocal(source) {
    return new Promise((resolve, reject) => {
        try {
            const data = yaml.safeLoad(source);

            if (!data) {
                return reject('Messages syntax does not seem valid');
            }

            resolve(data);
        } catch (e) {
            reject(e);
        }
    });
}

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

            const out = `module.exports = function (Component) {
                Component.options.__messages = ${JSON.stringify(trans)};
            };`;

            callback(null, out, map);
        },
        (err) => {
            callback(err);
        },
    );
};
