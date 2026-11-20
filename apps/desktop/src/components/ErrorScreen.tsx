import { Component, type ReactNode } from "react";

/** Ce qu'on montre quand l'app plante : le message d'erreur, au lieu d'un écran vide. */
export function ErrorScreen({ error }: { error: unknown }) {
  const text = error instanceof Error ? `${error.message}\n\n${error.stack ?? ""}` : String(error);
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 bg-[#181817] p-8 text-[#ecebe4]">
      <h1 className="text-[18px]">Kana a rencontré une erreur</h1>
      <pre className="max-h-[50vh] max-w-[900px] overflow-auto whitespace-pre-wrap rounded-2xl bg-[#232322] p-4 text-[12px] text-red-300">
        {text}
      </pre>
      <button
        onClick={() => location.reload()}
        className="rounded-full bg-[#ecebe4] px-4 py-1.5 text-[13px] font-medium text-[#181817] hover:bg-white"
      >
        Recharger
      </button>
    </div>
  );
}

/** Attrape les erreurs d'affichage de toute l'app. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: unknown }> {
  state = { error: null as unknown };

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  render() {
    return this.state.error ? <ErrorScreen error={this.state.error} /> : this.props.children;
  }
}
