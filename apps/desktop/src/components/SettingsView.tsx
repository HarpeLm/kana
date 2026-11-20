import { AGENTS } from "../data";
import AccountCard from "./AccountCard";

export default function SettingsView() {
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
      </div>
    </div>
  );
}
