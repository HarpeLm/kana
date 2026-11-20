import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { loadInitial } from "./lib/startup";

const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);

// L'app s'affiche une fois les conversations et les projets lus dans la base (quelques millisecondes).
loadInitial().then((startup) =>
  root.render(
    <React.StrictMode>
      <App startup={startup} />
    </React.StrictMode>,
  ),
);
