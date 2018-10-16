const {newVlang} = require('./lib/vlang');


const vlang = newVlang();


const Vlang = {
    install: function (Vue, options) {
        Object.assign(vlang, (options || {}));

        const t = function (key, n) {
            const m = this.$options.__messages || [];
            return vlang.translate(key, m, n);
        };

        t.setLang = function (lang) {
            vlang.locale = lang;
        };

        t.getLang = function () {
            return vlang.locale;
        };

        Vue.prototype.$t = t;
    }
};

export default Vlang;


/**
 * Use this to create a $t function inside a JS module. In any file that has
 * a VLANG block, use it like this:
 *
 * const $t = vljs(VLANG BLOCK GOES HERE);
 *
 * @param messages {array} Messages list
 */
export function vljs(messages) {
    return function (key, n) {
        const m = messages || [];
        return vlang.translate(key, m, n);
    };
}
