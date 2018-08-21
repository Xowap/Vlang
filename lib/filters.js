const FRENCH_RULES = [
    {re: /([^ ]) ([;!?])/g, rep: '$1\u202f$2'},
    {re: /([^ ]) (:)/g, rep: '$1\xa0$2'},
    {re: /« ([^»]+) »/g, rep: '«\xa0$1\xa0»'},
];


/**
 * Automatically replaces regular spaces with non-breaking spaces where it is
 * required.
 *
 * @param s {string} String to work on
 * @return {string}
 */
function frenchPunctuation(s) {
    let out = s;

    if (typeof out !== 'string') {
        return out;
    }

    for (const {re, rep} of FRENCH_RULES) {
        out = out.replace(re, rep);
    }

    return out;
}

module.exports = {
    frenchPunctuation,
};
