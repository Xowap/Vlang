<template>
    <div class="other">
        <h1>{{ $t("OTHER") }}</h1>

        <fox />
    </div>
</template>

<messages>
- lang: en
  messages:
    OTHER: Other Page
</messages>

<script>
import Fox from "@/components/Fox";

export default {
    components: {
        Fox,
    },
};
</script>
