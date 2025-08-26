import Vue from "vue";
import Cookies from "universal-cookie";
import {Vlang} from "./runtime";

/**
 * Nuxt plugin to load and inject Vlang.
 *
 * IMPORTANT (SSR memory fix):
 * Do NOT register a *per-request* Vlang instance with `Vue.use(vlang)`.
 * Vue 2 stores each plugin object in `Vue._installedPlugins`.
 * Passing a fresh instance on every SSR request keeps growing that array.
 *
 * Instead:
 *  1) Register a single, process-wide static Vue plugin once (defines `$t`).
 *  2) Create a per-request `Vlang` instance and inject it as `$vlang`.
 *  3) `$t` reads the instance from `this.$vlang` and uses the component’s `__messages`.
 */

/**
 * Minimal helper: flatten { lang, messages } blocks into plain dicts.
 * Input:
 *   { es: { lang: 'es', messages: { EMAIL: 'Correo' } }, en: {...} }
 * Output:
 *   { es: { EMAIL: 'Correo' }, en: {...} }
 */
function flattenLocaleBlocks(map) {
    if (!map || typeof map !== "object") return {};
    const out = {};
    for (const loc of Object.keys(map)) {
        const v = map[loc];
        out[loc] =
            v && typeof v === "object" && Object.prototype.hasOwnProperty.call(v, "messages")
                ? (v.messages || {})
                : (v || {});
    }
    return out;
}

/**
 * One-time, static Vue plugin (idempotent). It does NOT capture per-request objects.
 * It only defines `$t`, which fetches the current request's `$vlang`
 * and uses per-component `__messages`.
 */
const VLANG_VUE_PLUGIN = {
    install(VueCtor) {
        if (VueCtor.__vlang_plugin_installed) return; // idempotent
        VueCtor.__vlang_plugin_installed = true;

        VueCtor.prototype.$t = function (key, n) {
            const opt = (this && this.$options) || {};
            const path = "$options.__messages";
            const raw = opt.__messages || {};                // your logs showed this is present
            const messages = flattenLocaleBlocks(raw);       // flatten {lang, messages} -> plain dict
            const locales = Object.keys(messages);
            const firstLoc = locales[0];
            const sampleKeys = firstLoc ? Object.keys(messages[firstLoc] || {}).slice(0, 8) : [];

            const vlang = this.$vlang || (process.browser && window.__vlang) || null;

            if (DEBUG) {
                const name =
                    opt.name ||
                    this.$options._componentTag ||
                    (this.$vnode && this.$vnode.tag) ||
                    "Anonymous";
            }

            const out = vlang ? vlang.translate(key, n, messages) : (key ?? "");
            if (DEBUG && out === key) {
                console.warn("[Vlang/$t] Fallback to key:", key, "— check locale, messages and key.");
            }
            return out;
        };
    }
};

export default ({req, beforeNuxtRender}, inject) => {

    let cookies;

    // Cookies source (server vs browser)
    if (process.server) {
        cookies = new Cookies(req && req.headers && req.headers.cookie);
    } else {
        cookies = new Cookies();
    }

    // Options injected by the module template
    const options = {
        /* <%= '*' + '/' %>
        locales: <%= JSON.stringify(options.locales) %>,
        cookieName: <%= JSON.stringify(options.cookieName) %>,
        <%= '/' + '*' %> */
    };
    // Read cookie locale
    options.cookieLocale = cookies.get(options.cookieName);

    // On client, pick SSR locale from nuxtState
    if (process.browser) {
        const serverVlang = (window.__NUXT__ || {}).vlang || {};
        options.ssrLocale = serverVlang.locale;
    }

    // Per-request Vlang instance (NOT passed to Vue.use)
    const vlang = new Vlang(options);

    // Inject for components as this.$vlang
    inject("vlang", vlang);

    // Keep cookie in sync
    vlang.vm.$on("locale-change", (locale) => {
        cookies.set(options.cookieName, locale);
    });

    // On client, expose for helpers and toggle runtime logging
    if (process.browser) {
        window.__vlang = vlang;
        window.__VLANG_DEBUG = DEBUG;
    }

    // Install the static plugin once (defines $t)
    Vue.use(VLANG_VUE_PLUGIN);

    // Push current locale to nuxtState so client can pick it up
    if (process.server && beforeNuxtRender) {
        beforeNuxtRender(({nuxtState}) => {
            nuxtState.vlang = {locale: vlang.getLocale()};
        });
    }
};
