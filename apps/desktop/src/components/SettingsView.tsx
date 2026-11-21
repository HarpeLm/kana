import { AGENTS } from "../data";
import { setNotificationPrefs, useNotificationPrefs } from "../lib/settings";
import AccountCard from "./AccountCard";
import OrphanCleaner from "./OrphanCleaner";

interface SettingsViewProps {
  /** Identifiants des conversations et dossiers des projets, pour retrouver les dossiers de travail orphelins. */
  conversationIds: string[];
  projectPaths: string[];
}

export default function SettingsView({ conversationIds, projectPaths }: SettingsViewProps) {
  const notifications = useNotificationPrefs();

  return (
    <div className="flex-1 overflow-y-auto p-7">
      <div className="mx-auto max-w-[620px]">
        <h1 className="mb-1 text-[16px] font-semibold text-[#ecebe4]">Comptes et connexions</h1>
        <p className="mb-6 max-w-[56ch] text-[13px] text-[#8c8b83]">
          Connecte chaque agent avec ton compte, sans clé d'API. Kana ne demande ni ton e-mail ni
          ton mot de passe : l'agent ouvre lui-même sa page de connexion. Une clé d'API reste
          possible et se range dans le Trousseau du Mac.
        </p>

        <div className="space-y-3">
          {AGENTS.map((agent) => (
            <AccountCard key={agent.id} agent={agent} />
          ))}
        </div>

        <section className="mt-8 space-y-3 rounded-xl border border-[#2e2e2b] bg-[#21211f] p-4">
          <div>
            <h2 className="text-[14px] font-medium text-[#ecebe4]">Notifications</h2>
            <p className="mt-0.5 text-[12px] text-[#8c8b83]">
              Alerte le système lorsqu'un agent termine en arrière-plan ou demande une autorisation.
            </p>
          </div>

          <div className="space-y-2.5 text-[13px] text-[#e6e5df]">
            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg bg-[#1b1b19] px-3 py-2">
              <span>Notifications système</span>
              <input
                type="checkbox"
                checked={notifications.enabled}
                onChange={(e) => setNotificationPrefs({ ...notifications, enabled: e.target.checked })}
                className="h-4 w-4 accent-[#d97757]"
              />
            </label>

            <label
              className={`flex items-center justify-between gap-3 rounded-lg bg-[#1b1b19] px-3 py-2 transition ${
                notifications.enabled ? "cursor-pointer" : "cursor-not-allowed opacity-50"
              }`}
            >
              <span>Son de notification</span>
              <input
                type="checkbox"
                checked={notifications.sound}
                disabled={!notifications.enabled}
                onChange={(e) => setNotificationPrefs({ ...notifications, sound: e.target.checked })}
                className="h-4 w-4 accent-[#d97757] disabled:cursor-not-allowed"
              />
            </label>
          </div>
        </section>

        <OrphanCleaner knownIds={conversationIds} projects={projectPaths} />
      </div>
    </div>
  );
}
