import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { python } from "@codemirror/lang-python";
import { rust } from "@codemirror/lang-rust";
import { StreamLanguage } from "@codemirror/language";
import { shell } from "@codemirror/legacy-modes/mode/shell";
import { toml } from "@codemirror/legacy-modes/mode/toml";
import { yaml } from "@codemirror/legacy-modes/mode/yaml";
import type { Extension } from "@codemirror/state";
import type { Language } from "./fileKinds";

/** Coloration syntaxique d'un langage ; aucune pour du texte brut. */
export function languageExtension(language: Language): Extension {
  switch (language) {
    case "typescript":
      return javascript({ jsx: true, typescript: true });
    case "javascript":
      return javascript({ jsx: true });
    case "json":
      return json();
    case "markdown":
      return markdown();
    case "rust":
      return rust();
    case "css":
      return css();
    case "html":
      return html();
    case "python":
      return python();
    case "toml":
      return StreamLanguage.define(toml);
    case "yaml":
      return StreamLanguage.define(yaml);
    case "shell":
      return StreamLanguage.define(shell);
    case "plain":
      return [];
  }
}
