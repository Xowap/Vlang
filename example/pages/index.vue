<template>
    <div class="vlang-demo">
        <p>
            <label>
                {{ $t("CURRENT_LANG") }}
                <select v-model="lang">
                    <option value="en">{{ $t("ENGLISH") }}</option>
                    <option value="fr">{{ $t("FRENCH") }}</option>
                </select>
            </label>
        </p>

        <h1>{{ $t("SIMPLE") }}</h1>

        <p>
            <label>
                {{ $t("COUNTER") }} <input type="number" v-model="counter" />
            </label>
        </p>

        <p>{{ $t("COUNT", counter) }}</p>

        <fox />

        <nuxt-link :to="{ name: 'other' }">{{ $t("OTHER") }}</nuxt-link>
    </div>
</template>

<messages>
- lang: "en"
  messages:
    SIMPLE: "Vlang Demo!"
    COUNTER: "Counter:"
    OTHER: "Check other page"
    COUNT:
      ",0": "no potatoes"
      "1": "{} potato"
      "2,": "{} potatoes"
    CURRENT_LANG: "Current language"
    FRENCH: "French"
    ENGLISH: "English"
</messages>

<script>
import { HELLO } from "@/lib/messages";
import Fox from "@/components/Fox.vue";

export default {
    components: {
        Fox,
    },

    data() {
        return {
            counter: 0,
            lang: null,
        };
    },

    computed: {
        /**
         * That's to test VLJS translations
         */
        HELLO,
    },

    watch: {
        /**
         * When the select changes the lang, forwards the change to Vlang. Then
         * Vlang will handle changing all the translation strings and saving
         * the new language in the cookies.
         */
        lang(l) {
            this.$vlang.setLocale(l);
        },
    },

    /**
     * During async data you can both read and write the locale. As this
     * happens before even starting to render the page, it is right on time for
     * the first render that happens on the server and will make the initlal
     * HTML code with the right language.
     */
    async asyncData({ $vlang, route }) {
        if (route.query.lang) {
            $vlang.setLocale(route.query.lang);
        }

        return { lang: $vlang.getLocale() };
    },
};
</script>
