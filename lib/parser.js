'use strict';

const yaml = require('js-yaml');


const VLJS_EXP = /\/\*\s*VLANG\s*\n((?:.*?\n)*?)\*\//g;


/**
 * Parses a vljs file. It's like a regular JS file except that
 * @param str
 * @return {*}
 */
function parseVljs(str) {
    const m = VLJS_EXP.exec(str);

    if (!m) {
        return undefined;
    }

    return yaml.safeLoad(m[1]);
}


module.exports = {
    parseVljs,
};
