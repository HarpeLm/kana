import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { loadInitialConversations } from "./lib/startup";

const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);

// L'app s'affiche une fois les conversations lues dans la base (quelques millisecondes).
loadInitialConversations().then((conversations) =>
  root.render(
    <React.StrictMode>
      <App initialConversations={conversations} />
    </React.StrictMode>,
  ),
);
