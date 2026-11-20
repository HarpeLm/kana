import { useState } from "react";
import { GitBranch } from "lucide-react";
import { cleanOrphan, scanOrphans, type CleanOutcome, type Orphan } from "../lib/orphans";
import ConfirmDialog from "./ConfirmDialog";

interface OrphanCleanerProps {
  /** Identifiants des conversations qui existent encore. */
  knownIds: string[];
  /** Dossiers des projets où chercher. */
  projects: string[];
}

function describe(orphan: Orphan): string {
  if (orphan.dirty) return "travail non enregistré dans son dossier : gardé";
  if (orphan.ahead > 0) return `${orphan.ahead} commit${orphan.ahead > 1 ? "s" : ""} non fusionné${orphan.ahead > 1 ? "s" : ""} : branche gardée`;
  return orphan.worktree ? "rien à garder : dossier et branche à supprimer" : "branche vide à supprimer";
}

/**
 * Réglages › dossiers de travail. Cherche les branches `kana/…` de conversations disparues. Le nettoyage
 * ne perd jamais de travail : un dossier avec des changements non enregistrés, ou une branche dont les
 * commits ne sont pas fusionnés, est gardé.
 */
export default function OrphanCleaner({ knownIds, projects }: OrphanCleanerProps) {
  const [orphans, setOrphans] = useState<Orphan[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [report, setReport] = useState<{ orphan: Orphan; outcome: CleanOutcome }[]>([]);

  const scan = async () => {
    setBusy(true);
    setError("");
    setReport([]);
    try {
      setOrphans(await scanOrphans(knownIds, projects));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const clean = async () => {
    if (!orphans) return;
    setBusy(true);
    setConfirming(false);
    const results: { orphan: Orphan; outcome: CleanOutcome }[] = [];
    for (const orphan of orphans) {
      try {
        results.push({ orphan, outcome: await cleanOrphan(orphan) });
      } catch (e) {
        results.push({ orphan, outcome: { removed_worktree: false, deleted_branch: false, kept: String(e) } });
      }
    }
    setReport(results);
    setBusy(false);
    setOrphans(await scanOrphans(knownIds, projects).catch(() => []));
  };

  const removable = (orphans ?? []).filter((o) => !o.dirty && (o.worktree !== null || o.merged));

  return (
    <section className="mt-8 space-y-3 rounded-xl border border-[#2e2e2b] bg-[#21211f] p-4">
      <div>
        <h2 className="text-[14px] font-medium text-[#ecebe4]">Dossiers de travail</h2>
        <p className="mt-0.5 text-[12px] text-[#8c8b83]">
          Chaque conversation travaille sur sa propre branche <code>kana/…</code>. Quand la conversation est supprimée, il
          peut en rester des traces. Le nettoyage ne supprime jamais de travail non enregistré ni de commits non fusionnés.
        </p>
      </div>

      <button
        onClick={() => void scan()}
        disabled={busy}
        className="rounded-lg bg-[#2e2e2b] px-3 py-1.5 text-[12px] font-medium text-[#e6e5df] transition hover:bg-[#383835] disabled:opacity-50"
      >
        {busy ? "Recherche…" : orphans ? "Chercher à nouveau" : "Chercher les dossiers orphelins"}
      </button>

      {error && <p className="whitespace-pre-wrap text-[12px] text-red-300">{error}</p>}

      {orphans && orphans.length === 0 && <p className="text-[12.5px] text-[#8c8b83]">Rien à nettoyer : chaque branche kana/… a sa conversation.</p>}

      {orphans && orphans.length > 0 && (
        <>
          <ul className="space-y-1">
            {orphans.map((orphan) => (
              <li key={`${orphan.repo}:${orphan.branch}`} className="flex items-start gap-3 rounded-lg px-1 py-1.5 text-[13px]">
                <GitBranch className="mt-0.5 h-4 w-4 shrink-0 text-[#9a9992]" strokeWidth={1.7} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[#ecebe4]">
                    {orphan.repo_name} · <span className="font-mono text-[12px]">{orphan.branch}</span>
                  </span>
                  <span className={`block text-[12px] ${orphan.dirty || orphan.ahead > 0 ? "text-[#e69b80]" : "text-[#8c8b83]"}`}>{describe(orphan)}</span>
                </span>
              </li>
            ))}
          </ul>
          <button
            onClick={() => setConfirming(true)}
            disabled={busy || removable.length === 0}
            className="rounded-lg bg-[#d97757] px-3 py-1.5 text-[12px] font-medium text-[#181817] transition hover:bg-[#e38768] disabled:opacity-40"
          >
            Nettoyer ce qui est sûr ({removable.length})
          </button>
        </>
      )}

      {report.length > 0 && (
        <ul className="space-y-0.5 border-t border-[#2b2b28] pt-3 text-[12px] text-[#8c8b83]">
          {report.map(({ orphan, outcome }) => (
            <li key={orphan.branch}>
              <span className="font-mono">{orphan.branch}</span> :{" "}
              {outcome.kept
                ? `gardée (${outcome.kept})`
                : "supprimée"}
              {outcome.removed_worktree && !outcome.deleted_branch && !outcome.kept ? " (dossier seulement)" : ""}
            </li>
          ))}
        </ul>
      )}

      {confirming && (
        <ConfirmDialog
          title="Nettoyer les dossiers orphelins ?"
          confirmLabel="Nettoyer"
          confirmTone="accent"
          initialFocus="cancel"
          onCancel={() => setConfirming(false)}
          onConfirm={() => void clean()}
        >
          Kana va supprimer {removable.length} dossier{removable.length > 1 ? "s" : ""} de travail ou branche{removable.length > 1 ? "s" : ""} qui ne
          contiennent plus rien d'utile. Ce qui contient du travail non enregistré ou des commits non fusionnés est gardé.
        </ConfirmDialog>
      )}
    </section>
  );
}
