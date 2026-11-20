import { PROVIDERS } from "../data";

interface QuotaWidgetProps {
  onOpen: () => void;
}

const barColor = {
  cooldown: "bg-[#d97757]",
  active: "bg-[#d97757]/75",
  standby: "bg-[#5a5953]",
} as const;

export default function QuotaWidget({ onOpen }: QuotaWidgetProps) {
  return (
    <div
      onClick={onOpen}
      className="cursor-pointer border-t border-[#2b2b28] px-3.5 py-3 transition hover:bg-[#272724]"
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-medium text-[#9a9992]">Quota Relay</span>
        <span className="text-[11px] text-[#d97757]">Configurer</span>
      </div>
      <div className="space-y-2">
        {PROVIDERS.map((p) => (
          <div key={p.name}>
            <div className="mb-1 flex items-center justify-between text-[12px]">
              <span className="text-[#d4d3cb]">
                {p.name.replace(" Code", "").replace(" CLI", "")}
              </span>
              <span className="font-mono text-[11px] text-[#7e7d76]">{p.usage}%</span>
            </div>
            <div className="h-1 w-full overflow-hidden rounded-full bg-[#30302d]">
              <div
                className={`h-full rounded-full ${barColor[p.state]}`}
                style={{ width: `${p.usage}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
