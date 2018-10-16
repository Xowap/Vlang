'use strict';

const yaml = require('js-yaml');


/**
 * Generates a fresh VLJS RegExp
 */
function makeVljsRegExp() {
    return /\/\*\s*VLANG((?:[^*]|\*[^\/])*)\*\//gm;
}


/**
 * Parses a vljs file. It's like a regular JS file except that
 * @param str
 * @return {*}
 */
function parseVljs(str) {
    const m = makeVljsRegExp().exec(str);

    if (!m) {
        return undefined;
    }

    return yaml.safeLoad(m[1]);
}


module.exports = {
    makeVljsRegExp,
    parseVljs,
};
