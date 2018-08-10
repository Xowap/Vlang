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
            findEntry: function (key, messages) {
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
             * Finds the most appropriate translation, for static and
             * pluralized forms.
             *
             * - If n is a number, expect a pluralized form
             * - If n is not a number (like undefined), expect a static form
             *
             * @param key {string} Key of the translation
             * @param messages {object} Dictionary of messages
             * @param n {number|undefined} If pluralized, provide the quantity
             *   to pluralize for
             * @return {string}
             */
            translate: function (key, messages, n) {
                var entry = this.findEntry(key, messages);
                var expectPlural = typeof n === 'number';
                var isPlural = typeof entry === 'object';

                if (expectPlural && isPlural) {
                    return this.pluralize(entry, n);
                } else if (!expectPlural && !isPlural) {
                    return entry;
                }

                var expectedText = expectPlural ? 'pluralized' : 'static';

                return '!!! WRONG MESSAGE FORMAT (expected '
                    + expectedText
                    + ' form) !!!';
            },

            /**
             * Tests if `n` is comprised inside the `range` which is a string
             * in the vlang range format:
             *
             * - "1,2" is the range [1, 2]
             * - "1," is [1, +inf]
             * - ",1" is [-inf, 1]
             * - "1" is [1, 1]
             *
             * @param range {string} Vlang range
             * @param n {number} Number to test
             * @return {boolean} True if the number is in range
             */
            isInRange: function (range, n) {
                var parts = range.split(',').map(function (x, idx) {
                    if (x === '') {
                        if (idx === 0) {
                            return -Infinity;
                        } else {
                            return Infinity;
                        }
                    }

                    return parseInt(x, 10);
                });

                if (parts.some(isNaN) || parts.length > 2) {
                    return false;
                }

                if (parts.length === 1) {
                    parts.push(parts[0]);
                }

                return parts[0] <= n && n <= parts[1];
            },

            /**
             * Returns the pluralized form of the message for `n`
             *
             * @param message {object} all the messages associated with their
             *                         ranges
             * @param n {number} number to pluralize for
             * @return {string}
             */
            pluralize: function (message, n) {
                var self = this;
                var selected = '!!! MISSING (no pluralized options) !!!';

                Object.keys(message).some(function (range) {
                    selected = message[range];
                    return self.isInRange(range, n);
                });

                return selected.replace('{}', n);
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
