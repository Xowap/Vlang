import Vue from 'vue';


export function newVlang() {
    return new Vue({
        data: {
            locale: undefined,
            debug: true,
        },
        methods: {
            /**
             * Finds the most appropriate string from given messages
             */
            translate: function (key, messages) {
                var locale = this.chooseLocale(messages, this.locale);
                var lm;
                var i;
                var hasKey;

                if (messages instanceof Array) {
                    for (i = 0; i < messages.length; i += 1) {
                        lm = messages[i];

                        if (lm.locale === locale) {
                            break;
                        }
                    }
                }

                hasKey = lm
                    && Object.prototype.hasOwnProperty.call(lm.messages, key);

                if (!hasKey) {
                    if (this.debug) {
                        return '!!! MISSING (' + key + ') !!!';
                    } else {
                        return key;
                    }
                }

                return lm.messages[key];
            },

            /**
             * Choose the most appropriate locale given the user's locale
             */
            chooseLocale: function (messages, locale) {
                var locales = this.listLocales(messages);
                var bestChoice = locales[0];
                var bestLevel = 0;
                var candidate;
                var cmp;
                var i;

                for (i = 0; i < locales.length; i += 1) {
                    candidate = locales[i];
                    cmp = this.compareLocales(locale, candidate);

                    if (cmp > bestLevel) {
                        bestLevel = cmp;
                        bestChoice = candidate;
                    }
                }

                return bestChoice;
            },

            /**
             * List available locales from messages
             */
            listLocales: function (messages) {
                return messages.map(function (l) {
                    return l.locale;
                });
            },

            /**
             * Split the locale into lang/country
             */
            splitLocale: function (locale) {
                var item = locale.toLowerCase().split(/[_\-]/, 2);
                return {
                    lang: item[0],
                    country: item[1],
                }
            },

            /**
             * Compare two locales to determine the quality of match
             */
            compareLocales: function (a, b) {
                var sa, sb;

                if (!a || !b) {
                    if (a === b) {
                        return 2;
                    } else {
                        return 0;
                    }
                }

                sa = this.splitLocale(a);
                sb = this.splitLocale(b);

                if (sa.lang === sb.lang && sa.country === sb.country) {
                    return 2;
                } else if (sa.lang === sb.lang) {
                    return 1;
                }

                return 0;
            }
        },
    });
}
