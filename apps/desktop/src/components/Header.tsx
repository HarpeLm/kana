import type { ComponentProps } from "react";
import Toolbar from "./Toolbar";

interface HeaderProps {
  title?: string;
  toolbar: ComponentProps<typeof Toolbar>;
}

export default function Header({ title, toolbar }: HeaderProps) {
  return (
    <header className="flex h-[44px] shrink-0 items-center justify-between border-b border-[#262623] px-4">
      <span className="text-[13px] font-medium text-[#e6e5df]">{title}</span>
      <Toolbar {...toolbar} />
    </header>
  );
}
