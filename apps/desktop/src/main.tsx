import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ErrorBoundary, ErrorScreen } from "./components/ErrorScreen";
import { loadInitial } from "./lib/startup";

const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);

// L'app s'affiche une fois les conversations et les projets lus dans la base (quelques millisecondes).
// Si la lecture échoue, on montre l'erreur plutôt qu'un écran vide.
loadInitial()
  .then((startup) =>
    root.render(
      <React.StrictMode>
        <ErrorBoundary>
          <App startup={startup} />
        </ErrorBoundary>
      </React.StrictMode>,
    ),
  )
  .catch((error) => root.render(<ErrorScreen error={error} />));
