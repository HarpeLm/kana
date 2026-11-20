import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { python } from "@codemirror/lang-python";
import { rust } from "@codemirror/lang-rust";
import { StreamLanguage, type StreamParser } from "@codemirror/language";
import { c, cpp, csharp, java, kotlin } from "@codemirror/legacy-modes/mode/clike";
import { diff } from "@codemirror/legacy-modes/mode/diff";
import { dockerFile } from "@codemirror/legacy-modes/mode/dockerfile";
import { go } from "@codemirror/legacy-modes/mode/go";
import { lua } from "@codemirror/legacy-modes/mode/lua";
import { properties } from "@codemirror/legacy-modes/mode/properties";
import { ruby } from "@codemirror/legacy-modes/mode/ruby";
import { shell } from "@codemirror/legacy-modes/mode/shell";
import { standardSQL } from "@codemirror/legacy-modes/mode/sql";
import { swift } from "@codemirror/legacy-modes/mode/swift";
import { toml } from "@codemirror/legacy-modes/mode/toml";
import { xml } from "@codemirror/legacy-modes/mode/xml";
import { yaml } from "@codemirror/legacy-modes/mode/yaml";
import type { Extension } from "@codemirror/state";
import type { Language } from "./fileKinds";

// biome-ignore lint/suspicious/noExplicitAny: les modes historiques ont chacun leur type d'état
const stream = (parser: StreamParser<any>) => StreamLanguage.define(parser);

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
      return stream(toml);
    case "yaml":
      return stream(yaml);
    case "shell":
      return stream(shell);
    case "go":
      return stream(go);
    case "c":
      return stream(c);
    case "cpp":
      return stream(cpp);
    case "java":
      return stream(java);
    case "csharp":
      return stream(csharp);
    case "kotlin":
      return stream(kotlin);
    case "ruby":
      return stream(ruby);
    case "swift":
      return stream(swift);
    case "lua":
      return stream(lua);
    case "sql":
      return stream(standardSQL);
    case "xml":
      return stream(xml);
    case "dockerfile":
      return stream(dockerFile);
    case "properties":
      return stream(properties);
    case "diff":
      return stream(diff);
    case "plain":
      return [];
  }
}
