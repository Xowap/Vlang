Vlang
=====

Vue-lang, a Vue (and Nuxt) translation system.

## Getting started

First step is to add Vlang as a dependency of your project

```
npm add vlang
```

Then you need to create at the root of your project a `vlang.yml` file that
will contain the Vlang configuration for your project:

```yaml
# List of the locales that you want to allow in your project
locales:
    - en
    - fr

# Google sheet into which you want to extract your translation keys.
# Remember the id of Google sheet is inside the url of it.
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
# languages. For example here, we post-process French messages to add the
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

To make easier to work with these plug-in you have to add to your package.json 
the next script configuration:
```json
{
    "scripts": {
        "trans-extract": "vlang-extract -r .",
        "trans-import": "vlang-import -r ."
    }
}
```

## Example

After setting up the project to work with Vlang, you have to add the parameters
to your Vue components, to do this you only have to add the messages tag inside
the component you want to parametrize and also traduce.

Here you have a snippet you can follow to parametrize your components:

```javascript
<template>
    <div class="modal">
        <div class="title">
            { $t(TITLE) }
        </div>
        <div class="responses">
            <div class="btn-yes">{{ $t(YES) }}</div>
            <div class="btn-no">{{ $t(NO) }}</div>
        </div>
    </div>
</template>
<script type="javascript">
    
</script>
<messages>
- lang: "en"
  messages:
    TITLE: Example of vlang config
    YES: Yes
    NO: No
</messages>

<style type="text/css">
    
</style>
```

If you want a full example of an application you can go to
[the example](./example/pages/index.vue) for a better understanding.

## Traducing from one language to other
To do this operation smoothly as possible you have to had all your views
parametrize all your views. Then using the following command:

```commandline
npm trans-extract
```
This is going to add a tab inside the Google sheet for every language that
is declared in the views, and is also currently using inside them.

If you want to do other translations you have to copy this first book and rename 
the copy to the new language using the last column to make these translation.

To import this new translation we have to use the command:
```commandline
npm trans-import
```
These are going to generate a folder named `./i18n` and inside them is going to be
all the translations made with the steps above.
