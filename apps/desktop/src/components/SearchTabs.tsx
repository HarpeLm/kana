import { tr, useLocale } from "../lib/i18n";
import { SEARCH_TABS, type SearchTab } from "../lib/searchItems";

interface SearchTabsProps {
  value: SearchTab;
  onChange: (tab: SearchTab) => void;
}

const TAB_EN: Record<SearchTab, string> = {
  all: "All",
  sessions: "Sessions",
  projects: "Projects",
  artifacts: "Artifacts",
  scheduled: "Scheduled tasks",
};

/** Filtres par type en haut de la recherche. */
export default function SearchTabs({ value, onChange }: SearchTabsProps) {
  const locale = useLocale();
  return (
    <div role="tablist" className="flex flex-wrap gap-1">
      {SEARCH_TABS.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={value === tab.id}
          onClick={() => onChange(tab.id)}
          className={`h-8 rounded-lg px-3 text-[14px] transition ${
            value === tab.id
              ? "bg-[#3a3a37] text-[#f0efe9]"
              : "text-[#c4c3bc] hover:bg-[#333330] hover:text-[#f0efe9]"
          }`}
        >
          {tr(tab.label, TAB_EN[tab.id], locale)}
        </button>
      ))}
    </div>
  );
}
