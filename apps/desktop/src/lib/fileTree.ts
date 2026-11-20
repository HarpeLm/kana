export interface TreeNode {
  name: string;
  /** Chemin complet depuis la racine, séparé par `/`. */
  path: string;
  isDir: boolean;
  children: TreeNode[];
}

export interface TreeRow {
  node: TreeNode;
  depth: number;
}

function sortTree(nodes: TreeNode[]) {
  nodes.sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name));
  for (const node of nodes) if (node.isDir) sortTree(node.children);
}

/** Construit l'arbre à partir de chemins ; les dossiers passent avant les fichiers. */
export function buildTree(paths: string[]): TreeNode[] {
  const roots: TreeNode[] = [];
  const byPath = new Map<string, TreeNode>();

  for (const path of paths) {
    const parts = path.split("/");
    let siblings = roots;
    parts.forEach((name, index) => {
      const fullPath = parts.slice(0, index + 1).join("/");
      let node = byPath.get(fullPath);
      if (!node) {
        node = { name, path: fullPath, isDir: index < parts.length - 1, children: [] };
        byPath.set(fullPath, node);
        siblings.push(node);
      }
      siblings = node.children;
    });
  }

  sortTree(roots);
  return roots;
}

/** Les lignes à afficher : un dossier ne montre son contenu que s'il est déplié. */
export function visibleRows(nodes: TreeNode[], expanded: Set<string>, depth = 0): TreeRow[] {
  return nodes.flatMap((node) => [
    { node, depth },
    ...(node.isDir && expanded.has(node.path) ? visibleRows(node.children, expanded, depth + 1) : []),
  ]);
}

/** Les chemins qui contiennent `query` (sans tenir compte des majuscules), en nombre limité. */
export function filterPaths(paths: string[], query: string, limit = 300): string[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  return paths.filter((p) => p.toLowerCase().includes(needle)).slice(0, limit);
}
