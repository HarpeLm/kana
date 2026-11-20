import type { ReactNode } from "react";

interface IconProps {
  className?: string;
}

function Svg({ className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {children}
    </svg>
  );
}

export function DiffBoxIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="3.5" />
      <path d="M12 7.5v5" />
      <path d="M9.5 10h5" />
      <path d="M9.5 15.5h5" />
    </Svg>
  );
}

export function ArtifactsIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="3" y="7" width="12" height="14" rx="3" />
      <path d="M9 7V6a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3h-3" />
    </Svg>
  );
}

export function SideChatIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M10.5 3.5a7.5 7.5 0 1 1-4.1 13.8L3.5 18l.9-3.2A7.5 7.5 0 0 1 10.5 3.5z" />
      <circle cx="16" cy="16.5" r="2.8" />
      <path d="m18 18.6 2.2 2.2" />
    </Svg>
  );
}

export function BackgroundTasksIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M12 3.5 20.5 12 12 20.5 3.5 12z" />
      <path d="m10 10-2 2 2 2" />
      <path d="m14 10 2 2-2 2" />
    </Svg>
  );
}
