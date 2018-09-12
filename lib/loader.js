const yaml = require('js-yaml');
const path = require('path');
const fs = require('fs');
const {vlangPath} = require('./utils');


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


module.exports = {
    loadExternal,
};
