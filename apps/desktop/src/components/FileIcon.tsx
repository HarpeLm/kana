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
  typescript: { Icon: FileCode, color: "#4aa3ff" },
  javascript: { Icon: FileCode, color: "#f0db4f" },
  json: { Icon: FileJson, color: "#f0b429" },
  markdown: { Icon: FileText, color: "#4fc3f7" },
  rust: { Icon: FileCode, color: "#ff8a50" },
  css: { Icon: FileCode, color: "#b86bff" },
  html: { Icon: FileCode, color: "#ff6a55" },
  python: { Icon: FileCode, color: "#5dd27a" },
  toml: { Icon: FileCog, color: "#e5a34a" },
  yaml: { Icon: FileCog, color: "#e5a34a" },
  properties: { Icon: FileCog, color: "#e5a34a" },
  shell: { Icon: FileTerminal, color: "#5dd27a" },
  go: { Icon: FileCode, color: "#4fc3f7" },
  c: { Icon: FileCode, color: "#4aa3ff" },
  cpp: { Icon: FileCode, color: "#4aa3ff" },
  java: { Icon: FileCode, color: "#ff6a55" },
  csharp: { Icon: FileCode, color: "#6fd16f" },
  kotlin: { Icon: FileCode, color: "#b86bff" },
  ruby: { Icon: FileCode, color: "#ff6a55" },
  swift: { Icon: FileCode, color: "#ff8a50" },
  lua: { Icon: FileCode, color: "#4aa3ff" },
  sql: { Icon: FileCode, color: "#f0b429" },
  xml: { Icon: FileCode, color: "#ff8a50" },
  dockerfile: { Icon: FileCode, color: "#4aa3ff" },
  diff: { Icon: FileDiff, color: "#5dd27a" },
  plain: { Icon: File, color: "#b0aea6" },
};

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "ico", "bmp", "svg", "icns"]);

/** Icône et couleur d'un fichier : d'abord son nom, puis son extension, puis son langage. */
function lookOf(path: string): Look {
  const name = baseName(path).toLowerCase();
  if (name.endsWith(".lock")) return { Icon: FileLock, color: "#b0aea6" };
  if (name.startsWith(".git")) return { Icon: GitBranch, color: "#ff6a55" };
  if (IMAGE_EXTENSIONS.has(name.slice(name.lastIndexOf(".") + 1))) {
    return { Icon: FileImage, color: "#b86bff" };
  }
  return BY_LANGUAGE[languageOf(path)];
}

/** Icône colorée d'un fichier, selon son type. */
export default function FileIcon({ path, className = "h-[15px] w-[15px]" }: { path: string; className?: string }) {
  const { Icon, color } = lookOf(path);
  return <Icon className={`${className} shrink-0`} style={{ color }} strokeWidth={1.6} />;
}
