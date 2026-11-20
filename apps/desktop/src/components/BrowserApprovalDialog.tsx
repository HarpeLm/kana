import type { AgentApproval } from "../lib/browserAgent";
import ConfirmDialog from "./ConfirmDialog";

interface BrowserApprovalDialogProps {
  approval: AgentApproval;
  onAnswer: (allow: boolean) => void;
}

/**
 * Un agent veut utiliser le navigateur. Le focus est sur « Refuser » : une touche Entrée tapée
 * par hasard au moment où la fenêtre apparaît ne doit rien autoriser.
 */
export default function BrowserApprovalDialog({ approval, onAnswer }: BrowserApprovalDialogProps) {
  const forSite = approval.kind === "host";

  return (
    <ConfirmDialog
      title={forSite ? "Un agent veut utiliser le navigateur" : "Autoriser cette action ?"}
      confirmLabel={forSite ? "Autoriser ce site" : "Autoriser"}
      cancelLabel="Refuser"
      confirmTone="accent"
      initialFocus="cancel"
      onConfirm={() => onAnswer(true)}
      onCancel={() => onAnswer(false)}
    >
      {forSite ? (
        <>
          Il veut lire et utiliser des pages de <strong className="font-medium text-[#e6e5df]">{approval.host}</strong>.
          Il verra le contenu des pages que tu y as ouvertes, y compris tes comptes si tu es connecté.
          L'accord vaut jusqu'à la fermeture de Kana.
        </>
      ) : (
        <>
          <strong className="font-medium text-[#e6e5df]">{approval.detail}</strong> sur {approval.host}. Cette action
          peut modifier un compte ou envoyer quelque chose.
        </>
      )}
    </ConfirmDialog>
  );
}
