import Vue from "vue";
import Cookies from "universal-cookie";
import { Vlang } from "./runtime";

/**
 * Nuxt plugin to load and inject Vlang (SSR-safe).
 *
 * Key points (memory-safe):
 *  - DO NOT call Vue.use(vlangInstance) per request.
 *  - Install ONE static plugin that defines $t (idempotent).
 *  - Create/inject a per-request Vlang and let $t read it via this.$vlang.
 */

/* -------------------------- helpers -------------------------- */

/** Return true iff a value is a plain object */
function isObj(v) {
	return v && typeof v === "object" && !Array.isArray(v);
}

/**
 * Normalize component-level __messages into:
 *   { [locale: string]: { [key: string]: string|Function } }
 *
 * Accepts:
 *  - Flat dict:                { HELLO:"Hola" }
 *  - Block with messages:      { lang:"es", messages:{ HELLO:"Hola" } }
 *  - Map of locales (flat):    { es:{ HELLO:"Hola" }, en:{ HELLO:"Hello" } }
 *  - Map of locales (blocks):  { es:{ lang:"es", messages:{...} }, en:{...} }
 */
function normalizeMessages(raw, currentLocale) {
	if (!raw) return {};

	// Case A: already a map of locales
	//         { es:{...}, en:{...} }  OR  { es:{lang, messages}, ... }
	const localeKeys = Object.keys(raw || {}).filter(k => typeof raw[k] !== "undefined");
	const looksLikeLocaleMap =
		localeKeys.length > 0 &&
		localeKeys.every(k => isObj(raw[k]) || typeof raw[k] === "string" || typeof raw[k] === "function");

	if (looksLikeLocaleMap && (raw.es || raw.en || Object.keys(raw).some(k => k.includes("-")))) {
		const out = {};
		for (const loc of Object.keys(raw)) {
			const v = raw[loc];
			if (isObj(v) && Object.prototype.hasOwnProperty.call(v, "messages")) {
				out[loc] = v.messages || {};
			} else if (isObj(v)) {
				out[loc] = v;
			} else {
				// unlikely, but keep shape valid
				out[loc] = {};
			}
		}
		return out;
	}

	// Case B: single block { lang, messages }
	if (isObj(raw) && Object.prototype.hasOwnProperty.call(raw, "messages")) {
		const lang = raw.lang || currentLocale || "en";
		return { [lang]: raw.messages || {} };
	}

	// Case C: flat dict for current locale
	if (isObj(raw)) {
		const lang = currentLocale || "en";
		return { [lang]: raw };
	}

	return {};
}

/* --------------------- static Vue plugin --------------------- */

/**
 * Defines `$t` exactly once per process. It does NOT capture per-request data.
 * `$t` reads:
 *   - component-local messages: this.$options.__messages
 *   - current vlang instance:   this.$vlang  (injected below)
 */
const StaticVlangPlugin = {
	install(VueCtor) {
		if (VueCtor.prototype.$t) return; // idempotent

		VueCtor.prototype.$t = function $t(key, n) {
			// component-local messages (whatever the loader put there)
			const raw = (this && this.$options && this.$options.__messages) || {};
			// current vlang instance (injected in this plugin)
			const vlang = this && this.$vlang
				? this.$vlang
				: (process.client && window.__vlang) || null;

			if (!vlang) return key ?? "";

			const messages = normalizeMessages(raw, vlang.getLocale());
			return vlang.translate(key, n, messages);
		};
	}
};

// Install once per process (both server worker and client runtime)
if (!Vue.__vlang_static_installed__) {
	Vue.use(StaticVlangPlugin);
	Object.defineProperty(Vue, "__vlang_static_installed__", { value: true, enumerable: false });
}

/* ------------------------ Nuxt plugin ------------------------ */

export default ({ req, beforeNuxtRender }, inject) => {
	// cookies: server vs client source
	const cookies = process.server
		? new Cookies(req && req.headers && req.headers.cookie)
		: new Cookies();

	// options injected by the module template
	const options = {
		/* <%= '*' + '/' %>
		locales: <%= JSON.stringify(options.locales) %>,
		cookieName: <%= JSON.stringify(options.cookieName) %>,
		<%= '/' + '*' %> */
	};

	// cookie -> cookieLocale
	options.cookieLocale = cookies.get(options.cookieName);

	// client picks SSR locale from nuxtState
	if (process.client) {
		const serverVlang = (window.__NUXT__ || {}).vlang || {};
		options.ssrLocale = serverVlang.locale;
	}

	// per-request instance (SSR-safe; do NOT pass to Vue.use)
	const vlang = new Vlang(options);

	// keep cookie in sync
	vlang.vm.$on("locale-change", (locale) => {
		cookies.set(options.cookieName, locale);
	});

	// inject -> gives this.$vlang (also app/store/context.$vlang)
	inject("vlang", vlang);

	// expose for non-Vue helpers (client)
	if (process.client) {
		window.__vlang = vlang;
	}

	// send current locale to nuxt state (SSR -> client bootstrap)
	if (process.server && beforeNuxtRender) {
		beforeNuxtRender(({ nuxtState }) => {
			nuxtState.vlang = { locale: vlang.getLocale() };
		});
	}
};
