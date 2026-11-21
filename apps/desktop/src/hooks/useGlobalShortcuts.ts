import { useEffect, useRef } from "react";
import type { View } from "../data";
import type { Conversation } from "../lib/conversations";
import { loadView, orderedVisibleConversations } from "../lib/sidebarView";

interface UseGlobalShortcutsParams {
  blockedByModal: boolean;
  searchOpen: boolean;
  editingId: string | null;
  view: View;
  conversations: Conversation[];
  selectedId: string;
  onToggleSearch: () => void;
  onCreateConversation: () => void;
  onToggleSidebar: () => void;
  onToggleTerminal: () => void;
  onOpenSettings: () => void;
  onToggleSideChat: () => void;
  onToggleDiff: () => void;
  onToggleFiles: () => void;
  onToggleArtifacts: () => void;
  onToggleBrowser: () => void;
  onToggleSessionPanel: () => void;
  onCycleMode: () => void;
  onOpenConversation: (id: string) => void;
}

export function useGlobalShortcuts(params: UseGlobalShortcutsParams) {
  const handleGlobalKeyDown = (event: KeyboardEvent) => {
    if (event.isComposing || event.keyCode === 229) return;
    if (params.blockedByModal || document.querySelector('[role="alertdialog"]') !== null) return;

    const mod = (event.metaKey || event.ctrlKey) && !event.altKey;
    const key = event.key.toLowerCase();

    if (mod && !event.shiftKey && key === "k") {
      event.preventDefault();
      params.onToggleSearch();
      return;
    }

    if (params.searchOpen) return;

    if (mod && !event.shiftKey) {
      if (key === "n") {
        event.preventDefault();
        params.onCreateConversation();
      } else if (key === "b") {
        event.preventDefault();
        params.onToggleSidebar();
      } else if (key === "j") {
        event.preventDefault();
        params.onToggleTerminal();
      } else if (event.key === ",") {
        event.preventDefault();
        params.onOpenSettings();
      } else if (event.key === ";") {
        event.preventDefault();
        params.onToggleSideChat();
      }
      return;
    }

    if (mod && event.shiftKey) {
      if (key === "d") {
        event.preventDefault();
        params.onToggleDiff();
      } else if (key === "e") {
        event.preventDefault();
        params.onToggleFiles();
      } else if (key === "a") {
        event.preventDefault();
        params.onToggleArtifacts();
      } else if (key === "g") {
        event.preventDefault();
        params.onToggleBrowser();
      } else if (key === "p") {
        event.preventDefault();
        params.onToggleSessionPanel();
      } else if (key === "m") {
        event.preventDefault();
        params.onCycleMode();
      }
      return;
    }

    if (
      event.altKey &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.shiftKey &&
      (event.key === "ArrowUp" || event.key === "ArrowDown")
    ) {
      if (params.editingId !== null) return;
      const target = event.target as HTMLElement | null;
      if (target && (target instanceof HTMLInputElement || target.closest(".cm-editor, .xterm"))) return;
      const visible = orderedVisibleConversations(params.conversations, loadView(), params.selectedId);
      if (visible.length <= 1) return;
      event.preventDefault();
      const currentIndex = visible.findIndex((c) => c.id === params.selectedId);
      const delta = event.key === "ArrowDown" ? 1 : -1;
      const nextIndex = currentIndex < 0 ? 0 : (currentIndex + delta + visible.length) % visible.length;
      params.onOpenConversation(visible[nextIndex].id);
    }
  };

  const globalKeyDownRef = useRef(handleGlobalKeyDown);
  globalKeyDownRef.current = handleGlobalKeyDown;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => globalKeyDownRef.current(event);
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
