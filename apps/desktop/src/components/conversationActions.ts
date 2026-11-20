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
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
}
