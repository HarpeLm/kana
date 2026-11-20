import type { ReactNode } from "react";

interface ToolbarButtonProps {
  title: string;
  onClick: () => void;
  active?: boolean;
  children: ReactNode;
}

export default function ToolbarButton({
  title,
  onClick,
  active = false,
  children,
}: ToolbarButtonProps) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`flex h-7 w-7 items-center justify-center rounded-lg transition ${
        active
          ? "bg-[#31312e] text-[#f2f1eb]"
          : "text-[#c4c3bc] hover:bg-[#2a2a27] hover:text-[#f2f1eb]"
      }`}
    >
      {children}
    </button>
  );
}
