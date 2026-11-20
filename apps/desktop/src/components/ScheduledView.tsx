export default function ScheduledView() {
  return (
    <div className="flex-1 overflow-y-auto p-7">
      <div className="mx-auto max-w-[620px]">
        <h1 className="mb-1 text-[16px] font-semibold text-[#ecebe4]">Tâches planifiées</h1>
        <p className="mb-6 max-w-[56ch] text-[13px] text-[#8c8b83]">
          Lance un agent à heure fixe ou à intervalle régulier, sans ouvrir l'app.
        </p>
        <div className="rounded-xl border border-dashed border-[#343430] px-4 py-8 text-center text-[13px] text-[#7e7d76]">
          Aucune tâche planifiée pour l'instant.
        </div>
      </div>
    </div>
  );
}
