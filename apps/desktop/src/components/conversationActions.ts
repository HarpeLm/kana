/** Tout ce qu'on peut faire sur une conversation depuis la liste ou le titre. */
export interface ConversationActions {
  onSelect: (id: string) => void;
  onPin: (id: string) => void;
  onToggleUnread: (id: string) => void;
  onStartRename: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onCancelRename: () => void;
  onDuplicate: (id: string) => void;
  onMoveDown: (id: string) => void;
  onMoveToSection: (id: string, project: string) => void;
  /** Glisser-déposer : déplace un dossier avant ou après un autre. */
  onMoveSection: (from: string, to: string) => void;
  /** Nouvelle conversation vide directement dans un dossier. */
  onCreateIn: (project: string) => void;
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
}
