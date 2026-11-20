interface RightPanelProps {
  showPlan: boolean;
  showArtifacts: boolean;
  showBackgroundTasks: boolean;
}

export default function RightPanel({ showPlan, showArtifacts, showBackgroundTasks }: RightPanelProps) {
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
          <div className="text-[12px] text-[#8c8b83]">Aucun artéfact généré dans cette session.</div>
        </div>
      )}

      {showBackgroundTasks && (
        <div className="border-b border-[#2b2b28] p-4">
          <div className="mb-1.5 text-[13px] font-medium text-[#e6e5df]">Tâches en arrière-plan</div>
          <div className="text-[12px] text-[#8c8b83]">Aucune tâche active en arrière-plan.</div>
        </div>
      )}
    </section>
  );
}
