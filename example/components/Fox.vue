<template>
    <p>{{ $t("THE_FOX_SAYS") }} {{ HELLO }}</p>
</template>

<messages>
- lang: "en"
  messages:
    THE_FOX_SAYS: "The fox says:"
</messages>

<script>
import { HELLO } from "@/lib/messages";

export default {
    computed: {
        HELLO,
    },
};
</script>

