import { useRef, useState, type ReactNode } from "react";
import { Activity, MoreHorizontal } from "lucide-react";
import { useClickOutside } from "../hooks/useClickOutside";
import { tr, useLocale } from "../lib/i18n";
import ToolbarButton from "./ToolbarButton";
import { ArtifactsIcon, SideChatIcon } from "./icons";

interface MoreMenuProps {
  showSideChat: boolean;
  onSideChat: () => void;
  showArtifacts: boolean;
  onArtifacts: () => void;
  showInspector?: boolean;
  onInspector?: () => void;
  keepAwake: boolean;
  onKeepAwake: () => void;
}

interface MenuItem {
  label: string;
  shortcut?: string;
  icon: ReactNode;
  active: boolean;
  onClick: () => void;
}

export default function MoreMenu(props: MoreMenuProps) {
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useClickOutside(ref, open, () => setOpen(false));

  const iconClass = "h-[18px] w-[18px]";
  const items: MenuItem[] = [
    {
      label: tr("Conversation annexe", "Side chat", locale),
      shortcut: "⌘;",
      icon: <SideChatIcon className={iconClass} />,
      active: props.showSideChat,
      onClick: props.onSideChat,
    },
    {
      label: tr("Artéfacts", "Artifacts", locale),
      icon: <ArtifactsIcon className={iconClass} />,
      active: props.showArtifacts,
      onClick: props.onArtifacts,
    },
    ...(props.onInspector
      ? [
          {
            label: tr("Inspecteur ACP/MCP & Export", "ACP/MCP Inspector & Export", locale),
            icon: <Activity className={iconClass} strokeWidth={1.7} />,
            active: !!props.showInspector,
            onClick: props.onInspector,
          },
        ]
      : []),
  ];

  return (
    <div className="relative" ref={ref}>
      <ToolbarButton title={tr("Plus", "More", locale)} active={open} onClick={() => setOpen((v) => !v)}>
        <MoreHorizontal className="h-[17px] w-[17px]" strokeWidth={1.6} />
      </ToolbarButton>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-[7px] w-[288px] rounded-xl border border-[#3a3a37] bg-[#2b2b29] p-1.5 shadow-[0_14px_34px_rgba(0,0,0,0.55)]">
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
              {item.shortcut && <span className="text-[12px] text-[#8c8b83]">{item.shortcut}</span>}
            </button>
          ))}

          <div className="mx-[3px] my-1 h-px bg-[#41413d]" />

          <button
            onClick={props.onKeepAwake}
            aria-pressed={props.keepAwake}
            className="flex w-full items-center justify-between rounded-lg px-[11px] py-1.5 text-left"
          >
            <span className="flex flex-col leading-[1.35]">
              <span className="text-[14px] text-[#e6e5df]">
                {tr("Maintenir l'ordinateur actif", "Keep computer awake", locale)}
              </span>
              <span className="text-[13px] text-[#8c8b83]">
                {tr("Uniquement pour cette session", "For this session only", locale)}
              </span>
            </span>
            <span
              className={`ml-3 flex h-4 w-7 shrink-0 items-center rounded-full p-0.5 transition ${
                props.keepAwake ? "justify-end bg-[#2563eb]" : "justify-start bg-[#4a4a46]"
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
