import { Globe } from "lucide-react";
import { faviconFor } from "../lib/favicons";
import { siteIconPath } from "../lib/siteIcons";

/** La petite icône d'un site : celle qu'on connaît, sinon son favicon, sinon un globe. */
export default function SiteIcon({ url, className = "h-4 w-4" }: { url: string; className?: string }) {
  let host = "";
  try {
    host = new URL(url).host;
  } catch {
    // adresse illisible : globe
  }
  const path = host ? siteIconPath(host) : null;
  if (path) {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
        <path d={path} />
      </svg>
    );
  }
  const favicon = host ? faviconFor(host) : undefined;
  if (favicon) return <img src={favicon} alt="" className={`${className} rounded-[3px] object-contain`} />;
  return <Globe className={className} strokeWidth={1.7} />;
}
