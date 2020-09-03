import { vljs } from "vlang";

const $t = vljs(/* VLANG
- lang: en
  messages:
    HELLO: "Hello"
*/);

export const HELLO = () => $t("HELLO");
