interface RightPanelProps {
  showPlan: boolean;
  showArtifacts: boolean;
  showBackgroundTasks: boolean;
  showDiff: boolean;
}

const addedLine = "block bg-emerald-500/10 text-emerald-400";

export default function RightPanel({
  showPlan,
  showArtifacts,
  showBackgroundTasks,
  showDiff,
}: RightPanelProps) {
  return (
    <section className="flex w-[400px] shrink-0 flex-col border-l border-[#2b2b28] bg-[#1d1d1b]">
      {showPlan && (
        <div className="border-b border-[#2b2b28] p-4">
          <div className="mb-1.5 text-[13px] font-medium text-[#e6e5df]">Plan et tâches</div>
          <div className="text-[12px] text-[#8c8b83]">Aucune tâche pour cette conversation.</div>
        </div>
      )}

      {showArtifacts && (
        <div className="border-b border-[#2b2b28] p-4">
          <div className="mb-1.5 text-[13px] font-medium text-[#e6e5df]">Artéfacts</div>
          <div className="text-[12px] text-[#8c8b83]">
            Aucun artéfact généré dans cette session.
          </div>
        </div>
      )}

      {showBackgroundTasks && (
        <div className="border-b border-[#2b2b28] p-4">
          <div className="mb-1.5 text-[13px] font-medium text-[#e6e5df]">
            Tâches en arrière-plan
          </div>
          <div className="text-[12px] text-[#8c8b83]">Aucune tâche active en arrière-plan.</div>
        </div>
      )}

      {showDiff && (
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="border-b border-[#2b2b28] px-4 py-2.5 font-mono text-[12px] text-[#a3a29a]">
            git diff crates/kana-acp/src/lib.rs
          </div>
          <pre className="flex-1 overflow-auto p-4 font-mono text-[12.5px] leading-[1.6] text-[#a3a29a] select-text">
            <span className="text-[#787770]">@@ -1,4 +1,6 @@</span>
            {"\n"}
            <span className={addedLine}>+ pub struct AcpClient {"{"}</span>
            <span className={addedLine}>{"+     command: String,"}</span>
            <span className={addedLine}>+ {"}"}</span>
          </pre>
        </div>
      )}
    </section>
  );
}
