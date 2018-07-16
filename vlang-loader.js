const yaml = require('js-yaml');
const path = require('path');
const fs = require('fs');
const {getOptions} = require('loader-utils');
const {vlangPath, mergeTranslations} = require('./lib/utils');

/**
 * Loads translations from an external source. Will resolve to an empty list in
 * case of missing file or incorrect syntax.
 */
function loadExternal(root, componentPath) {
    return new Promise((resolve, reject) => {
        const configPath = path.join(root, 'vlang.yml');
        let config;

        function loadConfig() {
            fs.readFile(configPath, 'utf-8', (err, data) => {
                if (err) {
                    return reject(
                        `Could not read config file "${configPath}"`
                    );
                }

                config = yaml.safeLoad(data);

                if (!config) {
                    return reject(
                        `Syntax of "${configPath}" does not seem valid`
                    );
                }

                readFile();
            })
        }

        function readFile() {
            const relPath = path.relative(root, componentPath);

            if (relPath[0] === '.') {
                resolve([]);
            }

            const i18nDir = path.join(root, config.i18n_directory);
            const vlgFilePath = path.join(i18nDir, vlangPath(relPath));

            fs.readFile(vlgFilePath, 'utf-8', (err, data) => {
                if (err) {
                    return resolve([]);
                }

                const trans = yaml.safeLoad(data);

                if (!trans) {
                    return resolve([]);
                }

                resolve(trans);
            });
        }

        loadConfig();
    });
}

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
