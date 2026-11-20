// Script injecté dans chaque page du navigateur de Kana. Il ne fait rien tout seul : il offre
// à l'agent de quoi lire la page (avec des références d'éléments) et agir dessus.
// Chaque fonction renvoie un objet { ok: true, ... } ou { ok: false, error }.
(() => {
  if (window.__kana) return;

  const MAX_TEXT = 40000;
  const SKIP = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "HEAD", "META", "LINK", "SVG", "CANVAS", "IFRAME"]);
  const INTERACTIVE =
    'a[href],button,input:not([type=hidden]),textarea,select,summary,[role=button],[role=link],[role=checkbox],[role=radio],[role=tab],[role=menuitem],[role=switch],[contenteditable=""],[contenteditable="true"]';
  // Un clic sur ce genre de bouton demande l'accord de l'utilisateur.
  const SENSITIVE =
    /(^|[^\p{L}])(pay|payer|paiement|acheter|achat|buy|purchase|order|commander|checkout|confirm|confirmer|delete|supprimer|remove|retirer|send|envoyer|submit|valider|publish|publier|transfer|virement|subscribe|abonner|sign out|log out|déconnexion|se déconnecter)([^\p{L}]|$)/iu;

  let refs = [];

  const clean = (text, max = 120) => (text || "").replace(/\s+/g, " ").trim().slice(0, max);
  const isVisible = (el) => {
    const box = el.getBoundingClientRect();
    if (box.width < 1 || box.height < 1) return false;
    const style = getComputedStyle(el);
    return style.visibility !== "hidden" && style.display !== "none";
  };
  const labelOf = (el) =>
    clean(
      el.getAttribute("aria-label") ||
        (el.labels && el.labels[0] && el.labels[0].innerText) ||
        el.getAttribute("placeholder") ||
        el.getAttribute("title") ||
        el.innerText ||
        (el.type !== "password" && el.value) ||
        el.getAttribute("alt") ||
        el.getAttribute("name"),
    );
  const roleOf = (el) => {
    const tag = el.tagName.toLowerCase();
    const aria = el.getAttribute("role");
    if (aria) return aria;
    if (tag === "a") return "link";
    if (tag === "button" || tag === "summary") return "button";
    if (tag === "select") return "combobox";
    if (tag === "textarea") return "textbox";
    if (tag === "input") {
      const type = (el.type || "text").toLowerCase();
      if (type === "checkbox" || type === "radio") return type;
      if (["submit", "button", "reset", "image"].includes(type)) return "button";
      return "textbox";
    }
    return el.isContentEditable ? "textbox" : "element";
  };
  const isPassword = (el) => el.tagName === "INPUT" && (el.type || "").toLowerCase() === "password";

  function line(el, ref) {
    const role = roleOf(el);
    let text = `[${ref}] ${role} "${labelOf(el)}"`;
    if (role === "link" && el.href) text += ` -> ${el.href}`;
    if (el.disabled) text += " (disabled)";
    if (isPassword(el)) text += " (password: the user fills this in)";
    else if (role === "textbox" && el.value) text += ` value="${clean(el.value, 80)}"`;
    if ((role === "checkbox" || role === "radio" || role === "switch") && (el.checked || el.getAttribute("aria-checked") === "true")) {
      text += " (checked)";
    }
    if (role === "combobox" && el.options) {
      const options = [...el.options].slice(0, 15).map((o) => clean(o.text, 40));
      text += ` value="${clean(el.value, 40)}" options: [${options.join(", ")}]`;
    }
    return text;
  }

  function snapshot() {
    refs = [];
    const lines = [];
    let size = 0;
    const push = (text) => {
      if (!text || lines[lines.length - 1] === text || size > MAX_TEXT) return;
      lines.push(text);
      size += text.length + 1;
    };

    const walk = (parent) => {
      for (const node of parent.childNodes) {
        if (size > MAX_TEXT) return;
        if (node.nodeType === Node.TEXT_NODE) {
          push(clean(node.nodeValue, 300));
          continue;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        if (SKIP.has(node.tagName.toUpperCase()) || !isVisible(node)) continue;

        if (node.matches(INTERACTIVE)) {
          refs.push(node);
          push(line(node, `e${refs.length}`));
        } else if (/^H[1-6]$/.test(node.tagName)) {
          push(`${"#".repeat(Number(node.tagName[1]))} ${clean(node.innerText, 200)}`);
        } else if (!node.querySelector(INTERACTIVE) && !node.querySelector("h1,h2,h3,h4,h5,h6")) {
          // Un bloc sans élément interactif : son texte d'un seul tenant.
          push(clean(node.innerText, 400));
        } else {
          walk(node.shadowRoot || node);
        }
      }
    };
    walk(document.body || document.documentElement);

    const truncated = size > MAX_TEXT ? "\n[snapshot truncated: scroll down and take another]" : "";
    const scroll = `scroll ${Math.round(window.scrollY)}/${Math.round(document.documentElement.scrollHeight - window.innerHeight)}px`;
    return { ok: true, url: location.href, title: document.title, text: lines.join("\n") + truncated + `\n[${scroll}]` };
  }

  const refElement = (ref) => {
    const index = /^e(\d+)$/.exec(ref || "");
    const el = index && refs[Number(index[1]) - 1];
    if (!el) return { error: `Unknown reference "${ref}". Take a new snapshot.` };
    if (!el.isConnected) return { error: `The page changed and "${ref}" is gone. Take a new snapshot.` };
    return { el };
  };

  const fire = (el, type, init) => el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window, ...init }));

  window.__kana = {
    snapshot,

    info: () => ({ ok: true, url: location.href, title: document.title, ready: document.readyState }),

    // Ce que l'outil s'apprête à toucher, pour décider s'il faut l'accord de l'utilisateur.
    describe(ref) {
      const found = refElement(ref);
      if (found.error) return { ok: false, error: found.error };
      const { el } = found;
      const label = labelOf(el);
      // Valider un formulaire de connexion est risqué ; un simple bouton « Voir plus » à côté ne l'est pas.
      const type = (el.type || "").toLowerCase();
      const submits = el.tagName === "BUTTON" ? type !== "button" && type !== "reset" : type === "submit" || type === "image";
      const risky = SENSITIVE.test(label) || (submits && !!(el.form && el.form.querySelector("input[type=password]")));
      return { ok: true, label, role: roleOf(el), password: isPassword(el), risky };
    },

    click(ref) {
      const found = refElement(ref);
      if (found.error) return { ok: false, error: found.error };
      const { el } = found;
      el.scrollIntoView({ block: "center", inline: "center" });
      const box = el.getBoundingClientRect();
      const at = { clientX: box.left + box.width / 2, clientY: box.top + box.height / 2 };
      fire(el, "mousedown", at);
      el.focus?.();
      fire(el, "mouseup", at);
      el.click();
      return { ok: true };
    },

    type(ref, text, submit) {
      const found = refElement(ref);
      if (found.error) return { ok: false, error: found.error };
      const { el } = found;
      if (isPassword(el)) return { ok: false, error: "This is a password field: the user must fill it in." };
      el.scrollIntoView({ block: "center" });
      el.focus();
      if (el.isContentEditable) {
        el.textContent = text;
        el.dispatchEvent(new InputEvent("input", { bubbles: true, data: text, inputType: "insertText" }));
      } else if ("value" in el) {
        // Passer par le setter natif : les frameworks (React…) ne voient pas une simple affectation.
        const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, "value").set.call(el, text);
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      } else {
        return { ok: false, error: `"${ref}" is not a text field.` };
      }
      if (submit) {
        const enter = { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true };
        const proceed = el.dispatchEvent(new KeyboardEvent("keydown", enter));
        el.dispatchEvent(new KeyboardEvent("keyup", enter));
        if (proceed && el.form) {
          try {
            el.form.requestSubmit();
          } catch {
            el.form.submit();
          }
        }
      }
      return { ok: true };
    },

    press(key) {
      const target = document.activeElement || document.body;
      const init = { key, code: key.length === 1 ? `Key${key.toUpperCase()}` : key, bubbles: true, cancelable: true };
      target.dispatchEvent(new KeyboardEvent("keydown", init));
      target.dispatchEvent(new KeyboardEvent("keyup", init));
      return { ok: true };
    },

    select(ref, value) {
      const found = refElement(ref);
      if (found.error) return { ok: false, error: found.error };
      const { el } = found;
      if (el.tagName !== "SELECT") return { ok: false, error: `"${ref}" is not a drop-down list.` };
      const option = [...el.options].find((o) => o.value === value || clean(o.text, 200) === value);
      if (!option) return { ok: false, error: `No option "${value}".` };
      el.value = option.value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return { ok: true };
    },

    scroll(direction, amount) {
      const step = amount || Math.round(window.innerHeight * 0.8);
      if (direction === "top") window.scrollTo(0, 0);
      else if (direction === "bottom") window.scrollTo(0, document.documentElement.scrollHeight);
      else window.scrollBy(0, direction === "up" ? -step : step);
      return { ok: true };
    },
  };
})();
