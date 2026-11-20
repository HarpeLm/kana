import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import { X } from "lucide-react";
import { useBrowserTabs } from "../hooks/useBrowserTabs";
import { useNativeBounds } from "../hooks/useNativeBounds";
import { normalizeAddress } from "../lib/address";
import {
  backBrowser,
  closeBrowser,
  forwardBrowser,
  listenBrowser,
  navigateBrowser,
  openBrowser,
  reloadBrowser,
  setBrowserBounds,
  setBrowserVisible,
  type Bounds,
} from "../lib/browser";
import { inTauri } from "../lib/env";
import BrowserBar from "./BrowserBar";
import SidePane from "./SidePane";
import TerminalTabs from "./TerminalTabs";
import ToolbarButton from "./ToolbarButton";

interface BrowserDockProps {
  visible: boolean;
  /** Une fenêtre ou un menu de l'app est ouvert : la vue native, qui passerait par-dessus, se cache. */
  suspended: boolean;
  width: number;
  dragging: boolean;
  onResizeStart: (event: PointerEvent) => void;
  onClose: () => void;
}

const ignore = () => {};

/**
 * Volet Globe : un navigateur dans Kana, avec des onglets. Chaque onglet est une vue web native
 * posée sur l'emplacement vide du volet. Les sessions (cookies) sont conservées entre deux
 * lancements. Masqué, le volet garde ses onglets ouverts.
 */
export default function BrowserDock({ visible, suspended, width, dragging, onResizeStart, onClose }: BrowserDockProps) {
  const { tabs, activeId, add, select, close, setUrl, setTitle, setLoading } = useBrowserTabs();
  const slot = useRef<HTMLDivElement>(null);
  const created = useRef(new Set<string>());
  const bounds = useRef<Bounds | null>(null);
  const tabsRef = useRef(tabs);
  const [address, setAddress] = useState(tabs[0].url);
  const [editing, setEditing] = useState(false);

  const active = tabs.find((t) => t.id === activeId) ?? tabs[0];
  const shown = visible && !suspended;

  // Une vue native n'existe qu'une fois l'emplacement mesuré ; chaque onglet a la sienne.
  const ensureViews = useCallback(() => {
    const area = bounds.current;
    if (!area) return;
    for (const tab of tabsRef.current) {
      if (created.current.has(tab.id)) continue;
      created.current.add(tab.id);
      openBrowser(tab.id, tab.url, area).catch(() => created.current.delete(tab.id));
    }
  }, []);

  useEffect(() => {
    tabsRef.current = tabs;
    if (visible) ensureViews();
  }, [tabs, visible, ensureViews]);

  useNativeBounds(slot, inTauri && visible, (area) => {
    bounds.current = area;
    ensureViews();
    for (const id of created.current) setBrowserBounds(id, area).catch(ignore);
  });

  // Seul l'onglet actif est affiché, et seulement si rien ne passe par-dessus.
  useEffect(() => {
    if (!inTauri) return;
    const timer = setTimeout(() => {
      for (const id of created.current) setBrowserVisible(id, shown && id === activeId).catch(ignore);
    }, 0);
    return () => clearTimeout(timer);
  }, [shown, activeId, tabs]);

  useEffect(() => {
    if (!inTauri) return;
    let off: (() => void) | undefined;
    let cancelled = false;
    listenBrowser({
      onNavigated: setUrl,
      onTitle: setTitle,
      onLoading: setLoading,
      onNewTab: (url) => add(url),
    }).then((unlisten) => (cancelled ? unlisten() : (off = unlisten)));
    return () => {
      cancelled = true;
      off?.();
    };
  }, [add, setUrl, setTitle, setLoading]);

  // La barre d'adresse suit la page, sauf pendant qu'on la modifie.
  useEffect(() => {
    if (!editing) setAddress(active.url);
  }, [active.url, active.id, editing]);

  const closeTab = (id: string) => {
    close(id);
    created.current.delete(id);
    closeBrowser(id).catch(ignore);
  };

  const submit = () => {
    const url = normalizeAddress(address);
    if (!url) return;
    setUrl(activeId, url);
    navigateBrowser(activeId, url).catch(ignore);
  };

  return (
    <SidePane
      label="Navigateur"
      visible={visible}
      width={width}
      dragging={dragging}
      onResizeStart={onResizeStart}
      header={
        <>
          <TerminalTabs
            tabs={tabs}
            activeId={activeId}
            onSelect={select}
            onClose={closeTab}
            onAdd={() => add()}
            addLabel="Nouvel onglet"
          />
          <ToolbarButton title="Fermer le navigateur" onClick={onClose}>
            <X className="h-[17px] w-[17px]" strokeWidth={1.6} />
          </ToolbarButton>
        </>
      }
    >
      <div className="flex h-full flex-col">
        <BrowserBar
          address={address}
          loading={active.loading}
          onAddressChange={setAddress}
          onFocusChange={setEditing}
          onSubmit={submit}
          onBack={() => backBrowser(activeId).catch(ignore)}
          onForward={() => forwardBrowser(activeId).catch(ignore)}
          onReload={() => reloadBrowser(activeId).catch(ignore)}
        />
        {inTauri ? (
          <div ref={slot} className="min-h-0 flex-1" />
        ) : (
          <p className="p-4 text-[13px] text-[#8c8b83]">
            Le navigateur fonctionne dans la fenêtre de l'app Kana, pas dans un navigateur.
          </p>
        )}
      </div>
    </SidePane>
  );
}
