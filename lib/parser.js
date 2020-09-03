const yaml = require("js-yaml");
const cheerio = require("cheerio");
const Entities = require("html-entities").AllHtmlEntities;

const entities = new Entities();

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

/**
 * Extracts and parses the content of a <messages> block in a component file
 * @param content {String} File content of the component
 */
function parseComponent(content) {
    const $ = cheerio.load(content);
    const msg = $("messages");

    if (!msg.length) {
        return;
    }

    const y = entities.decode(msg.html());

    return yaml.safeLoad(y);
}

module.exports = {
    makeVljsRegExp,
    parseVljs,
    parseComponent,
};
