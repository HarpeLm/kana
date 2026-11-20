import { Folder, Globe, List, Terminal } from "lucide-react";
import ToolbarButton from "./ToolbarButton";
import MoreMenu from "./MoreMenu";
import { DiffBoxIcon } from "./icons";

type MoreMenuProps = Parameters<typeof MoreMenu>[0];

interface ToolbarProps {
  showPlan: boolean;
  onPlan: () => void;
  showTerminal: boolean;
  onTerminal: () => void;
  showDiff: boolean;
  onDiff: () => void;
  showBrowser: boolean;
  onBrowser: () => void;
  showFiles: boolean;
  onFiles: () => void;
  more: MoreMenuProps;
}

const ICON = "h-[17px] w-[17px]";

export default function Toolbar(p: ToolbarProps) {
  return (
    <div className="flex items-center gap-1">
      <ToolbarButton title="Plan et tâches" active={p.showPlan} onClick={p.onPlan}>
        <List className={ICON} strokeWidth={1.6} />
      </ToolbarButton>
      <ToolbarButton title="Terminal" active={p.showTerminal} onClick={p.onTerminal}>
        <Terminal className={ICON} strokeWidth={1.6} />
      </ToolbarButton>
      <ToolbarButton title="Git Diff" active={p.showDiff} onClick={p.onDiff}>
        <DiffBoxIcon className={ICON} />
      </ToolbarButton>
      <ToolbarButton title="Aperçu Web" active={p.showBrowser} onClick={p.onBrowser}>
        <Globe className={ICON} strokeWidth={1.6} />
      </ToolbarButton>
      <ToolbarButton title="Fichiers du worktree" active={p.showFiles} onClick={p.onFiles}>
        <Folder className={ICON} strokeWidth={1.6} />
      </ToolbarButton>
      <MoreMenu {...p.more} />
    </div>
  );
}
