'use strict';

const yaml = require('js-yaml');


/**
 * Parses a vljs file. It's like a regular JS file except that
 * @param str
 * @return {*}
 */
function parseVljs(str) {
    const m = /\/\*\s*VLANG((?:[^*]|\*[^\/])*)\*\//gm.exec(str);

    if (!m) {
        return undefined;
    }

    return yaml.safeLoad(m[1]);
}


module.exports = {
    parseVljs,
};
