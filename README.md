Vlang
=====

Vue-lang, a Vue (and Nuxt) translation system.

## Getting started

First step is to add Vlang as a dependency of your project

```
npm add vlang
```

Then you need to create a the root of your project a `vlang.yml` file that
will contain the Vlang configuration for your project:

```yaml
# List of the locales that you want to allow in your project
locales:
    - en
    - fr

# Google sheet into which you want to extract your translation keys. If you
# don't want to use this feature, put an empty list instead.
outputs:
    - type: google_sheets
      id: "1vxkEbYWM9Q93vuiPN-IA588OMJ1yWjzPib2b4cX2EBc"

# Google sheet from which you get your translated content. Usually the same as
# the outputs. You can also put an empty list.
inputs:
    - type: google_sheets
      id: "1vxkEbYWM9Q93vuiPN-IA588OMJ1yWjzPib2b4cX2EBc"

# Vlang stores imported translations as `.vlg` files. See it as .mo files. All
# of them will be stored in this directory.
i18n_directory: ./i18n

# Some filters are available to post-process imported messages in some
# languages. By example here, we post-process French messages to add the
# appropriate whitespaces around punctuation.
filters:
    fr:
        - frenchPunctuation
```

Once this is done, you can add the module in your `nuxt.config.js` file

```javascript
module.exports = {
    modules: ["vlang/nuxt"],
};
```

Now all you have left to do is to write components with translations in them.
See [the example](./example/pages/index.vue) for a better understanding of how
it goes.
