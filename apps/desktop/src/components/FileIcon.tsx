import {
  File,
  FileCode,
  FileCog,
  FileDiff,
  FileImage,
  FileJson,
  FileLock,
  FileTerminal,
  FileText,
  GitBranch,
  type LucideIcon,
} from "lucide-react";
import { baseName, languageOf, type Language } from "../lib/fileKinds";

interface Look {
  Icon: LucideIcon;
  color: string;
}

const BY_LANGUAGE: Record<Language, Look> = {
  typescript: { Icon: FileCode, color: "#6aa6e8" },
  javascript: { Icon: FileCode, color: "#e0c458" },
  json: { Icon: FileJson, color: "#e0b25f" },
  markdown: { Icon: FileText, color: "#6fc3c9" },
  rust: { Icon: FileCode, color: "#e69b80" },
  css: { Icon: FileCode, color: "#c792ea" },
  html: { Icon: FileCode, color: "#e5786d" },
  python: { Icon: FileCode, color: "#7fc08c" },
  toml: { Icon: FileCog, color: "#c9a27a" },
  yaml: { Icon: FileCog, color: "#c9a27a" },
  properties: { Icon: FileCog, color: "#c9a27a" },
  shell: { Icon: FileTerminal, color: "#7fc08c" },
  go: { Icon: FileCode, color: "#6fc3c9" },
  c: { Icon: FileCode, color: "#6aa6e8" },
  cpp: { Icon: FileCode, color: "#6aa6e8" },
  java: { Icon: FileCode, color: "#e5786d" },
  csharp: { Icon: FileCode, color: "#9bd4a6" },
  kotlin: { Icon: FileCode, color: "#c792ea" },
  ruby: { Icon: FileCode, color: "#e5786d" },
  swift: { Icon: FileCode, color: "#e69b80" },
  lua: { Icon: FileCode, color: "#6aa6e8" },
  sql: { Icon: FileCode, color: "#e0b25f" },
  xml: { Icon: FileCode, color: "#e69b80" },
  dockerfile: { Icon: FileCode, color: "#6aa6e8" },
  diff: { Icon: FileDiff, color: "#7fc08c" },
  plain: { Icon: File, color: "#9a9992" },
};

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "ico", "bmp", "svg", "icns"]);

/** Icône et couleur d'un fichier : d'abord son nom, puis son extension, puis son langage. */
function lookOf(path: string): Look {
  const name = baseName(path).toLowerCase();
  if (name.endsWith(".lock")) return { Icon: FileLock, color: "#9a9992" };
  if (name.startsWith(".git")) return { Icon: GitBranch, color: "#e5786d" };
  if (IMAGE_EXTENSIONS.has(name.slice(name.lastIndexOf(".") + 1))) {
    return { Icon: FileImage, color: "#c792ea" };
  }
  return BY_LANGUAGE[languageOf(path)];
}

/** Icône colorée d'un fichier, selon son type. */
export default function FileIcon({ path, className = "h-[15px] w-[15px]" }: { path: string; className?: string }) {
  const { Icon, color } = lookOf(path);
  return <Icon className={`${className} shrink-0`} style={{ color }} strokeWidth={1.6} />;
}
