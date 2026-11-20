import { useRef, useState, type ReactNode } from "react";
import { MoreHorizontal, Smartphone } from "lucide-react";
import { useClickOutside } from "../hooks/useClickOutside";
import ToolbarButton from "./ToolbarButton";
import { ArtifactsIcon, BackgroundTasksIcon, SideChatIcon } from "./icons";

interface MoreMenuProps {
  showArtifacts: boolean;
  onArtifacts: () => void;
  showSideChat: boolean;
  onSideChat: () => void;
  showBackgroundTasks: boolean;
  onBackgroundTasks: () => void;
  showSimulator: boolean;
  onSimulator: () => void;
  keepAwake: boolean;
  onKeepAwake: () => void;
}

interface MenuItem {
  label: string;
  icon: ReactNode;
  active: boolean;
  onClick: () => void;
  shortcut?: string;
}

export default function MoreMenu(props: MoreMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useClickOutside(ref, open, () => setOpen(false));

  const iconClass = "h-[18px] w-[18px]";
  const items: MenuItem[] = [
    {
      label: "Artéfacts",
      icon: <ArtifactsIcon className={iconClass} />,
      active: props.showArtifacts,
      onClick: props.onArtifacts,
    },
    {
      label: "Conversation annexe",
      icon: <SideChatIcon className={iconClass} />,
      shortcut: "⌘;",
      active: props.showSideChat,
      onClick: props.onSideChat,
    },
    {
      label: "Tâches en arrière-plan",
      icon: <BackgroundTasksIcon className={iconClass} />,
      active: props.showBackgroundTasks,
      onClick: props.onBackgroundTasks,
    },
    {
      label: "Simulateur iOS",
      icon: <Smartphone className={iconClass} strokeWidth={1.6} />,
      active: props.showSimulator,
      onClick: props.onSimulator,
    },
  ];

  return (
    <div className="relative" ref={ref}>
      <ToolbarButton title="Plus" active={open} onClick={() => setOpen((v) => !v)}>
        <MoreHorizontal className="h-[17px] w-[17px]" strokeWidth={1.6} />
      </ToolbarButton>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-[7px] w-[274px] rounded-xl border border-[#3a3a37] bg-[#2b2b29] p-1.5 shadow-[0_14px_34px_rgba(0,0,0,0.55)]">
          {items.map((item) => (
            <button
              key={item.label}
              onClick={() => {
                item.onClick();
                setOpen(false);
              }}
              className={`flex h-7 w-full items-center gap-2.5 rounded-lg px-[11px] text-left text-[14px] transition ${
                item.active
                  ? "bg-[#41413d] text-[#f2f1eb]"
                  : "text-[#e6e5df] hover:bg-[#383835]"
              }`}
            >
              <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center">
                {item.icon}
              </span>
              <span className="flex-1 truncate">{item.label}</span>
              {item.shortcut && (
                <span className="text-[13px] text-[#9a9992]">{item.shortcut}</span>
              )}
            </button>
          ))}

          <div className="mx-[3px] my-1 h-px bg-[#41413d]" />

          <button
            onClick={props.onKeepAwake}
            className="flex w-full items-center justify-between rounded-lg px-[11px] py-1.5 text-left"
          >
            <span className="flex flex-col leading-[1.35]">
              <span className="text-[14px] text-[#e6e5df]">Maintenir l'ordinateur actif</span>
              <span className="text-[13px] text-[#8c8b83]">Uniquement pour cette session</span>
            </span>
            <span
              className={`ml-3 flex h-4 w-7 shrink-0 items-center rounded-full p-0.5 transition ${
                props.keepAwake ? "justify-end bg-[#d97757]" : "justify-start bg-[#4a4a46]"
              }`}
            >
              <span className="h-3 w-3 rounded-full bg-[#f2f1eb]" />
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
