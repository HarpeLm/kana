import { useEffect, useRef, useState } from "react";

const PAGE_WIDTH = 900;

/** L'aperçu miniature d'une page : la page entière, réduite, sans script ni interaction. */
export default function ArtifactThumb({ html, className = "" }: { html: string; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.3);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const update = () => setScale(el.clientWidth / PAGE_WIDTH);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={box} className={`relative overflow-hidden bg-white ${className}`}>
      <iframe
        title="Aperçu"
        srcDoc={html}
        sandbox=""
        tabIndex={-1}
        className="pointer-events-none absolute left-0 top-0 border-0 bg-white"
        style={{ width: PAGE_WIDTH, height: 1400, transform: `scale(${scale})`, transformOrigin: "0 0" }}
      />
    </div>
  );
}
