import Vue from "vue";
import Cookies from "universal-cookie";
import { Vlang } from "./runtime";

/**
 * Nuxt plugin to load and inject Vlang.
 *
 * See inline comments for details.
 *
 * @param req
 * @param beforeNuxtRender
 * @param inject
 */
export default ({ req, beforeNuxtRender }, inject) => {
    let cookies;

    /**
     * Gathers the cookies, either from the HTTP request (server-side) or
     * just from the browser API.
     */
    if (process.server) {
        cookies = new Cookies(req && req.headers && req.headers.cookie);
    } else {
        cookies = new Cookies();
    }

    /**
     * Getting the options from above. Since those options are provided through
     * template by the Vlang module, the weird syntax here with the comments
     * allows to make sure that the ID doesn't detect a syntax error but when
     * the file is generated the option values are not within comments.
     */
    const options = {
        /* <%= '*' + '/' %>
        locales: <%= JSON.stringify(options.locales) %>,
        cookieName: <%= JSON.stringify(options.cookieName) %>,
        <%= '/' + '*' %> */
    };

    /**
     * Recovers the locale from the cookies, if any
     */
    options.cookieLocale = cookies.get(options.cookieName);

    /**
     * If we're in a browser, we might also recover the locale from the vlang
     * object left for us in the NUXT state.
     */
    if (process.browser) {
        const serverVlang = (window.__NUXT__ || {}).vlang || {};
        options.ssrLocale = serverVlang.locale;
    }

    /**
     * Creating the instance of Vlang
     */
    const vlang = new Vlang(options);

    /**
     * Injecting the Vlang service into the Nuxt context
     */
    inject('vlang', vlang);

    /**
     * Listens to locale changes in order to set the cookies when that happens
     */
    vlang.vm.$on('locale-change', (locale) => {
        cookies.set(options.cookieName, locale);
    });

    /**
     * If we're in a browser, store the vlang instance in a global variable
     * to facilitate vljs's job
     */
    if (process.browser) {
        window.__vlang = vlang;
    }

    /**
     * Install vlang as a Vue plugin (to get the $t function working)
     */
    Vue.use(vlang);

    /**
     * If we're on the server side, add the locale to the NUXT state for the
     * front-end to be able to pick it up on load (see above).
     */
    if (process.server && beforeNuxtRender) {
        beforeNuxtRender(({ nuxtState }) => {
            nuxtState.vlang = { locale: vlang.getLocale() };
        });
    }
};
