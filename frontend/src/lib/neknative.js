import { registerPlugin } from "@capacitor/core";

// Single shared handle to the native "NekNative" plugin. Registering the same
// plugin name from several modules logs "already registered" warnings, so every
// caller imports this one instance instead of calling registerPlugin again.
const NekNative = registerPlugin("NekNative");

export default NekNative;
