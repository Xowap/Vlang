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
 * const $t = vljs(this);
 *
 * Internally, it expects to find the messages in `module_.__messages`, which
 * should be done by the vljs-loader.
 *
 * @param module_ {object} Module that has the messages embedded
 */
export function vljs(module_) {
    return function (key, n) {
        const m = module_.__messages || [];
        return vlang.translate(key, m, n);
    };
}
