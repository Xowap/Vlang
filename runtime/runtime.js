import Vue from "vue";


/**
 * Extract locale codes from the shapes your logs showed:
 *  - Array of strings: ['es','en']
 *  - Array of objects: [{ lang:'es' }, { lang:'en' }] or { code:'es' }
 *  - Object map: { es:{...}, en:{...} }
 */
function extractLocaleList(locales) {
    const out = [];
    if (!locales) return out;

    if (Array.isArray(locales)) {
        for (const it of locales) {
            if (typeof it === "string") out.push(it);
            else if (it && typeof it === "object") {
                if (typeof it.lang === "string") out.push(it.lang);
                else if (typeof it.code === "string") out.push(it.code);
            }
        }
        return out;
    }

    if (typeof locales === "object") {
        return Object.keys(locales);
    }

    return out;
}

/**
 * Flatten a `{ lang, messages }` block to just its `messages` object.
 */
function flattenBlockMaybe(v) {
    if (v && typeof v === "object" && Object.prototype.hasOwnProperty.call(v, "messages")) {
        return v.messages || {};
    }
    return v || {};
}

export class Vlang {
    /**
     * @param {Object} options
     * @param {Object|Array} [options.locales]
     * @param {string} [options.cookieName]
     * @param {string} [options.cookieLocale]
     * @param {string} [options.ssrLocale]
     */
    constructor(options = {}) {
        this.options = options;

        const configuredLocales = extractLocaleList(options.locales);
        this.locale =
            options.ssrLocale ||
            options.cookieLocale ||
            configuredLocales[0] ||
            "en";

        // Tiny Vue instance used only as an event emitter
        this.vm = new Vue();
    }

    // Try exact, then dash-normalized, then base language
    _localeCandidates(loc) {
        if (!loc || typeof loc !== "string") return [];
        const dash = loc.replace("_", "-");
        const base = dash.split("-")[0];
        const out = [loc];
        if (dash !== loc) out.push(dash);
        if (base && base !== dash) out.push(base);
        return out;
    }

    _resolveDict(messages = {}) {
        const cands = this._localeCandidates(this.locale);

        for (const cand of cands) {
            let m = messages[cand];
            if (m) return flattenBlockMaybe(m);
        }

        // Fallback to English if present
        let en = messages.en;
        return flattenBlockMaybe(en);
    }

    /**
     * Translate a key using the current locale.
     *
     * @param {string} key
     * @param {number|Object} [n]
     * @param {Object} [messages={}] // expects object-of-locales (values can be dicts or {lang,messages} blocks)
     * @returns {string}
     */
    translate(key, n, messages = {}) {
        const dict = this._resolveDict(messages);
        const sample = Object.keys(dict).slice(0, 10);

        let val = dict[key];

        if (typeof val === "function") {
            try {
                const out = val(n);
                return out;
            } catch (e) {
                console.warn("[Vlang/runtime] message fn threw; falling back to key:", key, e);
                return key;
            }
        }

        if (val == null) {
            console.warn("[Vlang/runtime] missing key for locale:", this.locale, "key:", key);
            return key;
        }

        const out = String(val);
        return out;
    }

    setLocale(locale) {
        if (!locale || locale === this.locale) return;
        this.locale = locale;
        this.vm.$emit("locale-change", locale);
    }

    getLocale() {
        return this.locale;
    }

    /**
     * Legacy install (kept for non-SSR). Avoid using this on the server.
     */
    install(VueCtor) {
        if (process && process.env && process.env.NODE_ENV !== "production") {
            console.warn(
                "[Vlang] Avoid `Vue.use(new Vlang(...))` on the server (SSR). " +
                "Use the static plugin + injected `$vlang` pattern to prevent memory growth."
            );
        }

        if (!VueCtor.prototype.$t) {
            VueCtor.prototype.$t = function (key, n) {
                const opt = (this && this.$options) || {};
                // Pass raw __messages; we flatten blocks inside translate()
                const raw = opt.__messages || {};
                const vlang = this.$vlang || (process.client && window.__vlang) || null;
                return vlang ? vlang.translate(key, n, raw) : (key ?? "");
            };
        }
    }
}
