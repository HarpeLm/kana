//! Interface Web & Mobile embarquée pour le serveur autonome Kana Cloud (`kana serve`).

/// Modèle HTML/CSS/JS du tableau de bord Web/Mobile Kana Cloud (`{auth_hint}` remplacé dynamiquement).
pub const CLOUD_DASHBOARD_HTML: &str = r#"<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>Kana Cloud — Compagnon Web &amp; Mobile</title>
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    body {
      margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #181817; color: #ecebe4; line-height: 1.45;
      padding: 16px; max-width: 760px; margin-inline: auto;
    }
    header { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
    h1 { font-size: 18px; margin: 0; }
    .sub { font-size: 12.5px; color: #8c8b83; margin: 2px 0 0; }
    .badge { font-size: 12px; padding: 4px 10px; border-radius: 999px; background: #243828; color: #8ce09b; }
    .badge.err { background: #3d2324; color: #f48b87; }
    .card { background: #21211f; border: 1px solid #343430; border-radius: 14px; padding: 14px; margin-bottom: 14px; }
    label { display: block; font-size: 12px; color: #9a9992; margin-bottom: 6px; }
    input, select, textarea {
      width: 100%; background: #181817; color: #ecebe4; border: 1px solid #363632;
      border-radius: 9px; padding: 9px 11px; font-size: 14px; outline: none;
    }
    input:focus, select:focus, textarea:focus { border-color: #3b82f6; }
    .row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px; }
    @media (max-width: 520px) { .row { grid-template-columns: 1fr; } }
    button {
      background: #1e40af; color: #f8fafc; border: 0; border-radius: 9px;
      padding: 9px 14px; font-size: 13.5px; font-weight: 600; cursor: pointer;
    }
    button:hover { background: #2563eb; }
    button.sec { background: #2f2f2c; color: #ecebe4; font-weight: 500; }
    .actions { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-top: 12px; }
    .job { border-top: 1px solid #2f2f2c; padding: 10px 0; }
    .job:first-child { border-top: 0; padding-top: 0; }
    .job-head { display: flex; justify-content: space-between; gap: 8px; font-size: 12.5px; color: #9a9992; }
    .status { padding: 2px 8px; border-radius: 999px; font-size: 11px; background: #2f2f2c; color: #dcdbd3; }
    .status.done { background: #243828; color: #8ce09b; }
    .status.running, .status.queued { background: #223042; color: #8ab4f8; }
    .status.error { background: #3d2324; color: #f48b87; }
    pre { white-space: pre-wrap; word-break: break-word; background: #181817; padding: 10px; border-radius: 8px; font-size: 12px; margin: 8px 0 0; }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>Kana Cloud</h1>
      <p class="sub">Compagnon Web &amp; Mobile · __AUTH_HINT__</p>
    </div>
    <span id="healthBadge" class="badge">Connexion…</span>
  </header>

  <section class="card">
    <label for="tokenInput">Jeton Bearer (enregistré localement sur cet appareil)</label>
    <div style="display:flex;gap:8px;">
      <input id="tokenInput" type="password" placeholder="Coller le token Kana Cloud…" />
      <button id="saveTokenBtn" type="button" class="sec">Enregistrer</button>
    </div>
  </section>

  <form id="runForm" class="card">
    <label for="promptInput">Nouvelle tâche agent</label>
    <textarea id="promptInput" rows="3" placeholder="Ex. Analyse les erreurs CI et propose un correctif…"></textarea>
    <div class="row">
      <div>
        <label for="agentSelect">Agent</label>
        <select id="agentSelect">
          <option value="claude">Claude</option>
          <option value="codex">Codex</option>
          <option value="gemini">Gemini</option>
        </select>
      </div>
      <div>
        <label for="modeSelect">Mode</label>
        <select id="modeSelect">
          <option value="auto">Auto (exécution)</option>
          <option value="plan">Plan (lecture seule)</option>
          <option value="cross-review">Cross-Review (3 agents)</option>
        </select>
      </div>
    </div>
    <div class="actions">
      <span id="formMsg" class="sub"></span>
      <button type="submit">Lancer sur Kana Cloud</button>
    </div>
  </form>

  <section class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
      <strong style="font-size:14px;">Jobs récents</strong>
      <button id="refreshBtn" type="button" class="sec" style="padding:5px 10px;font-size:12px;">Actualiser</button>
    </div>
    <div id="jobsList" class="sub">Aucun job pour l'instant.</div>
  </section>

  <script>
    const params = new URLSearchParams(location.search);
    if (params.get("token")) localStorage.setItem("kana-cloud-token", params.get("token"));
    const tokenInput = document.getElementById("tokenInput");
    tokenInput.value = localStorage.getItem("kana-cloud-token") || "";
    const authHeaders = () => {
      const t = tokenInput.value.trim();
      return t ? { "Authorization": "Bearer " + t } : {};
    };
    document.getElementById("saveTokenBtn").onclick = () => {
      localStorage.setItem("kana-cloud-token", tokenInput.value.trim());
      loadJobs();
    };
    async function loadHealth() {
      const badge = document.getElementById("healthBadge");
      try {
        const res = await fetch("/api/health");
        const data = await res.json();
        badge.textContent = data.ok ? `En ligne · ${data.activeJobs} actif(s)` : "Hors ligne";
        badge.className = data.ok ? "badge" : "badge err";
      } catch {
        badge.textContent = "Injoignable";
        badge.className = "badge err";
      }
    }
    async function loadJobs() {
      const listEl = document.getElementById("jobsList");
      try {
        const res = await fetch("/api/jobs", { headers: authHeaders() });
        if (res.status === 401) {
          listEl.textContent = "Token Bearer manquant ou invalide.";
          return;
        }
        const jobs = await res.json();
        if (!Array.isArray(jobs) || jobs.length === 0) {
          listEl.textContent = "Aucun job pour l'instant.";
          return;
        }
        listEl.innerHTML = jobs.map((j) => `
          <div class="job">
            <div class="job-head">
              <span><strong>${j.agent}</strong> · ${j.mode}</span>
              <span class="status ${j.status}">${j.status}</span>
            </div>
            <div style="margin-top:4px;font-size:13.5px;color:#ecebe4;">${escapeHtml(j.prompt)}</div>
            ${j.output ? `<pre>${escapeHtml(j.output)}</pre>` : ""}
            ${j.error ? `<pre style="color:#f48b87;">${escapeHtml(j.error)}</pre>` : ""}
          </div>
        `).join("");
      } catch (e) {
        listEl.textContent = "Erreur de chargement : " + e;
      }
    }
    function escapeHtml(s) {
      return String(s).replace(/[&<>"]/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c]));
    }
    document.getElementById("runForm").onsubmit = async (e) => {
      e.preventDefault();
      const prompt = document.getElementById("promptInput").value.trim();
      if (!prompt) return;
      const msg = document.getElementById("formMsg");
      msg.textContent = "Envoi…";
      try {
        const res = await fetch("/api/run", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({
            prompt,
            agent: document.getElementById("agentSelect").value,
            mode: document.getElementById("modeSelect").value,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          msg.textContent = data.error || "Erreur HTTP " + res.status;
          return;
        }
        document.getElementById("promptInput").value = "";
        msg.textContent = "Job soumis (" + data.id + ")";
        loadHealth();
        loadJobs();
      } catch (err) {
        msg.textContent = "Échec d'envoi : " + err;
      }
    };
    document.getElementById("refreshBtn").onclick = () => { loadHealth(); loadJobs(); };
    loadHealth();
    loadJobs();
    setInterval(() => { loadHealth(); loadJobs(); }, 5000);
  </script>
</body>
</html>
"#;

pub fn companion_web_html(auth_required: bool) -> String {
    let auth_hint = if auth_required {
        "Authentification Bearer requise"
    } else {
        "Accès libre (configurez --token en production)"
    };
    CLOUD_DASHBOARD_HTML.replace("__AUTH_HINT__", auth_hint)
}
