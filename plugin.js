const {newVlang} = require('./lib/vlang');


module.exports = {
    install: function (Vue, options) {
        var vlang = newVlang();
        var t;

        Object.assign(vlang, (options || {}));

        t = function (key, n) {
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
