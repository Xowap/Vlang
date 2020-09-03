const Vue = require("vue").default || require("vue");

/**
 * The VM handles the reactive side of the Vlang instance. It's mainly just
 * storage of the current locale and some logic to establish the actual locale
 * to be used.
 */
function makeVm() {
    return new Vue({
        data() {
            return {
                /**
                 * Available locales
                 */
                locales: [],

                /**
                 * User-chosen locale (during this runtime)
                 */
                chosenLocale: null,

                /**
                 * Locale suggested by the server
                 */
                ssrLocale: null,

                /**
                 * Locale suggested by the cookies
                 */
                cookieLocale: null,
            };
        },

        computed: {
            /**
             * Returns the current locale based on the priority of various
             * suggestions we can receive
             */
            locale() {
                const { sane } = this;
                return (
                    sane.chosenLocale ||
                    sane.ssrLocale ||
                    sane.cookieLocale ||
                    this.defaultLocale
                );
            },

            /**
             * The default locale is the first of the list
             */
            defaultLocale() {
                return this.locales[0];
            },

            /**
             * Sanitizes locale suggestions by making sure that all of them
             * are available within authorized locales.
             */
            sane() {
                return {
                    chosenLocale: this.sanitizeLocale(this.chosenLocale),
                    ssrLocale: this.sanitizeLocale(this.ssrLocale),
                    cookieLocale: this.sanitizeLocale(this.cookieLocale),
                };
            },
        },

        methods: {
            /**
             * Makes sure that the input value exists within the authorized
             * locales list. If not, null is returned so that the locale
             * selection falls back on another value.
             *
             * @param locale {String} Locale to test
             */
            sanitizeLocale(locale) {
                if (this.locales.some((x) => x === locale)) {
                    return locale;
                }

                return null;
            },
        },

        watch: {
            /**
             * Watches locale changes in order to allow the plugin to be
             * notified when the locale changes so that it can set the cookie
             * appropriately.
             */
            locale(v) {
                this.$emit("locale-change", v);
            },
        },
    });
}

class Vlang {
    constructor({ locales, cookieLocale, ssrLocale }) {
        this.vm = makeVm();

        this.vm.locales = locales;
        this.vm.cookieLocale = cookieLocale;
        this.vm.ssrLocale = ssrLocale;
    }

    /**
     * Installs the $t function into Vue. It cannot be injected into the Nuxt
     * context because it needs to access the component's messages and as such
     * can only be done as a Vue plugin.
     */
    install(Vue) {
        const vlang = this;

        Vue.prototype.$t = function (key, n) {
            const messages = (this.$options || {}).__messages || {};
            return vlang.translate(key, n, messages);
        };
    }

    /**
     * Returns the translation string for the specified key
     *
     * @param key {String} Key to translate
     * @param n {Number|Undefined} If defined, this number will be used to
     *                             pluralize the translation. If a
     *                             number is given, the message is expected
     *                             to be in a pluralizable form.
     * @param messages {Dict} Available messages
     */
    translate(key, n, messages) {
        const message = (messages[this.getLocale()] || { messages: {} })
            .messages[key];

        if (typeof n === "string") {
            const newN = parseFloat(n);

            if (!Number.isNaN(newN)) {
                n = newN;
            }
        }

        if (!message) {
            return `!!! MISSING KEY "${key}" !!!`;
        } else if (typeof n === "number") {
            if (typeof message === "string") {
                return (
                    `!!! USING "${key}" AS PLURALIZABLE STRING, ` +
                    `BUT IT's NOT !!!`
                );
            }

            return this.pluralize(message, n);
        } else {
            if (typeof message !== "string") {
                return (
                    `!!! USING "${key}" AS REGULAR STRING, ` +
                    `BUT IT'S PLURALIZABLE !!!`
                );
            }

            return message;
        }
    }

    /**
     * Tests if `n` is comprised inside the `range` which is a string
     * in the vlang range format:
     *
     * - "1,2" is the range [1, 2]
     * - "1," is [1, +inf]
     * - ",1" is [-inf, 1]
     * - ",!1" is [-inf, 1[
     * - "1" is [1, 1]
     *
     * @param range {string} Vlang range
     * @param n {number} Number to test
     * @return {boolean} True if the number is in range
     */
    isInRange(range, n) {
        function incl(a, b) {
            return a <= b;
        }

        function excl(a, b) {
            return a < b;
        }

        let opLower = incl,
            opUpper = incl;

        const parts = range.split(",").map((x, idx) => {
            if (x === "") {
                if (idx === 0) {
                    return -Infinity;
                } else {
                    return Infinity;
                }
            }

            let op;

            if (x[0] === "!") {
                x = x.substr(1);
                op = excl;
            } else {
                op = incl;
            }

            if (idx === 0) {
                opLower = op;
            } else {
                opUpper = op;
            }

            return parseInt(x, 10);
        });

        if (parts.some(isNaN) || parts.length > 2) {
            return false;
        }

        if (parts.length === 1) {
            parts.push(parts[0]);
        }

        return opLower(parts[0], n) && opUpper(n, parts[1]);
    }

    /**
     * Returns the pluralized form of the message for `n`
     *
     * @param message {object} all the messages associated with their
     *                         ranges
     * @param n {number} number to pluralize for
     * @return {string}
     */
    pluralize(message, n) {
        let selected = "!!! MISSING (no pluralized options) !!!";

        Object.keys(message).some((range) => {
            selected = message[range];
            return this.isInRange(range, n);
        });

        return selected.replace("{}", n);
    }

    /**
     * Returns the current locale
     */
    getLocale() {
        return this.vm.locale;
    }

    /**
     * Sets the current locale
     */
    setLocale(locale) {
        this.vm.chosenLocale = locale;
    }
}

/**
 * Use this function from a raw JS file in order to use Vlang for translations
 * there.
 *
 * By example
 *
 *     import { vljs } from "vlang";
 *
 *     const $t = vljs(/ * VLANG
 *     - lang: en
 *       messages:
 *         HELLO: "Hello"
 *     * /);
 *
 * (Please note that the comment should be a comment but is
 * not because it would close this documentation comment).
 *
 * @param messages {Object} Messages that will be generated by the Webpack
 *                          loader from the comment
 * @param vlang {Vlang} Optional Vlang instance
 * @return {function(...[*]=)}
 */
function vljs(messages, vlang) {
    return function (key, n) {
        if (!vlang && process.browser && window.__vlang) {
            vlang = window.__vlang;
        }

        if (vlang) {
            return vlang.translate(key, n, messages);
        } else {
            return "!!! COULD NOT GET VLANG INSTANCE !!!";
        }
    };
}

module.exports = {
    Vlang,
    vljs,
};
