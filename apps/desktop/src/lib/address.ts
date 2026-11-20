const SEARCH_URL = "https://duckduckgo.com/?q=";

const LOCAL = /^(localhost|\d{1,3}(\.\d{1,3}){3})(:\d+)?([/?#].*)?$/i;
const DOMAIN = /^[^\s/?#]+\.[a-z]{2,}(:\d+)?([/?#].*)?$/i;

/**
 * Transforme ce qui est tapé dans la barre d'adresse en adresse web :
 * une adresse complète reste telle quelle, un nom de domaine reçoit `https://`,
 * `localhost` et les adresses IP reçoivent `http://`, et tout le reste devient une recherche.
 * Renvoie une chaîne vide si rien n'est tapé.
 */
export function normalizeAddress(input: string): string {
  const text = input.trim();
  if (!text) return "";
  if (/^https?:\/\/\S+$/i.test(text)) return text;
  if (/\s/.test(text)) return SEARCH_URL + encodeURIComponent(text);
  if (LOCAL.test(text)) return `http://${text}`;
  if (DOMAIN.test(text)) return `https://${text}`;
  return SEARCH_URL + encodeURIComponent(text);
}

/** Nom court d'un onglet quand la page n'a pas (encore) de titre : son domaine. */
export function hostOf(url: string): string {
  try {
    return new URL(url).host || url;
  } catch {
    return url;
  }
}
