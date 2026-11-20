/**
 * Transforme les références GitHub écrites en toutes lettres (`owner/repo#12`) en liens
 * markdown, sauf dans le code. GitHub redirige `/issues/N` vers la pull request quand c'en est une.
 */
export function linkifyGithubRefs(source: string): string {
  // Les blocs et morceaux de code (index impairs après le découpage) restent intacts.
  return source
    .split(/(```[\s\S]*?```|`[^`\n]*`)/)
    .map((part, index) =>
      index % 2 === 1
        ? part
        : part.replace(
            /(^|[\s(])([A-Za-z0-9][\w.-]*\/[\w.-]+)#(\d+)\b/g,
            (_match, before: string, repo: string, number: string) =>
              `${before}[${repo}#${number}](https://github.com/${repo}/issues/${number})`,
          ),
    )
    .join("");
}
