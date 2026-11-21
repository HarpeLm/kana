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
  const MAX_DIAGNOSTICS = 100;
  const consoleBuffer = [];
  const networkBuffer = [];

  const pushBounded = (buffer, entry) => {
    buffer.push(entry);
    if (buffer.length > MAX_DIAGNOSTICS) buffer.shift();
  };

  const formatConsoleArg = (arg) => {
    if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
    if (typeof arg === "string") return arg;
    try {
      return JSON.stringify(arg);
    } catch {
      return String(arg);
    }
  };

  for (const level of ["error", "warn"]) {
    const orig = console[level];
    if (typeof orig === "function") {
      console[level] = function (...args) {
        try {
          pushBounded(consoleBuffer, {
            level,
            message: args.map(formatConsoleArg).join(" ").slice(0, 500),
            source: location.href,
            at: Date.now(),
          });
        } catch {}
        return orig.apply(this, args);
      };
    }
  }

  window.addEventListener("error", (event) => {
    try {
      pushBounded(consoleBuffer, {
        level: "error",
        message: String(event.message || (event.error && event.error.message) || "Uncaught error").slice(0, 500),
        source: event.filename ? `${event.filename}:${event.lineno || 0}` : location.href,
        at: Date.now(),
      });
    } catch {}
  });

  window.addEventListener("unhandledrejection", (event) => {
    try {
      const reason = event.reason;
      const msg = reason instanceof Error ? `${reason.name}: ${reason.message}` : String(reason || "Unhandled rejection");
      pushBounded(consoleBuffer, {
        level: "error",
        message: `UnhandledRejection: ${msg}`.slice(0, 500),
        source: location.href,
        at: Date.now(),
      });
    } catch {}
  });

  if (typeof window.fetch === "function") {
    const origFetch = window.fetch.bind(window);
    window.fetch = async function (input, init) {
      const start = Date.now();
      const method = ((init && init.method) || (input && input.method) || "GET").toUpperCase();
      const url = typeof input === "string" ? input : (input && input.url) || String(input);
      try {
        const res = await origFetch(input, init);
        if (res.status >= 400) {
          pushBounded(networkBuffer, {
            method,
            url: String(url).slice(0, 400),
            status: res.status,
            statusText: res.statusText || "HTTP Error",
            durationMs: Date.now() - start,
            at: Date.now(),
          });
        }
        return res;
      } catch (err) {
        pushBounded(networkBuffer, {
          method,
          url: String(url).slice(0, 400),
          status: 0,
          statusText: err instanceof Error ? err.message : "Network error",
          durationMs: Date.now() - start,
          at: Date.now(),
        });
        throw err;
      }
    };
  }

  if (typeof XMLHttpRequest !== "undefined") {
    const origOpen = XMLHttpRequest.prototype.open;
    const origSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
      this.__kanaReq = { method: String(method || "GET").toUpperCase(), url: String(url || ""), start: 0 };
      return origOpen.call(this, method, url, ...rest);
    };
    XMLHttpRequest.prototype.send = function (...args) {
      if (this.__kanaReq) {
        this.__kanaReq.start = Date.now();
        this.addEventListener("loadend", () => {
          const meta = this.__kanaReq;
          if (!meta) return;
          if (this.status >= 400 || this.status === 0) {
            pushBounded(networkBuffer, {
              method: meta.method,
              url: meta.url.slice(0, 400),
              status: this.status,
              statusText: this.statusText || (this.status === 0 ? "XHR network error" : "HTTP Error"),
              durationMs: Date.now() - meta.start,
              at: Date.now(),
            });
          }
        });
      }
      return origSend.apply(this, args);
    };
  }

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

    screenshot(ref, fullPage) {
      if (refs.length === 0) snapshot();
      let targetEl = null;
      if (ref) {
        const found = refElement(ref);
        if (found.error) return { ok: false, error: found.error };
        targetEl = found.el;
      }
      const targetBox = targetEl ? targetEl.getBoundingClientRect() : null;
      const width = Math.max(320, Math.min(1600, Math.round(targetBox ? targetBox.width + 48 : window.innerWidth || 1280)));
      const rawHeight = targetBox
        ? targetBox.height + 72
        : fullPage
          ? Math.max(window.innerHeight || 720, document.documentElement.scrollHeight || 720)
          : window.innerHeight || 720;
      const height = Math.max(240, Math.min(2000, Math.round(rawHeight)));

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return { ok: false, error: "Canvas 2D context is not available." };

      const bodyBg = getComputedStyle(document.body || document.documentElement).backgroundColor;
      ctx.fillStyle = bodyBg && bodyBg !== "rgba(0, 0, 0, 0)" ? bodyBg : "#181817";
      ctx.fillRect(0, 0, width, height);

      // En-tête de repère visuel pour le modèle multimodal
      ctx.fillStyle = "#222220";
      ctx.fillRect(0, 0, width, 36);
      ctx.fillStyle = "#ecebe4";
      ctx.font = "bold 13px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText(`${clean(document.title || "Page", 60)} — ${clean(location.href, 90)}`, 12, 22);

      const offsetX = targetBox ? Math.max(0, targetBox.left - 24) : 0;
      const offsetY = targetBox ? Math.max(0, targetBox.top - 48) : 0;

      // Dessin des titres visibles
      ctx.fillStyle = "#d9d8d0";
      ctx.font = "bold 15px -apple-system, BlinkMacSystemFont, sans-serif";
      const headings = document.querySelectorAll("h1,h2,h3");
      for (const h of headings) {
        if (!isVisible(h)) continue;
        const b = h.getBoundingClientRect();
        const x = Math.round(b.left - offsetX);
        const y = Math.round(b.top - offsetY + 36);
        if (y < 40 || y > height - 12) continue;
        ctx.fillText(clean(h.innerText, 80), Math.max(12, x), y);
      }

      // Dessin des éléments interactifs référencés [eN]
      refs.forEach((el, idx) => {
        if (!el.isConnected || !isVisible(el)) return;
        const b = el.getBoundingClientRect();
        const x = Math.round(b.left - offsetX);
        const y = Math.round(b.top - offsetY + 36);
        const w = Math.max(28, Math.min(width - x - 4, Math.round(b.width)));
        const h = Math.max(20, Math.min(120, Math.round(b.height)));
        if (y + h < 36 || y > height) return;
        const tag = `e${idx + 1}`;
        const isTarget = targetEl === el;
        ctx.strokeStyle = isTarget ? "#f59e0b" : "#6ea8fe";
        ctx.lineWidth = isTarget ? 2.5 : 1.25;
        ctx.strokeRect(x, y, w, h);
        ctx.fillStyle = isTarget ? "rgba(245, 158, 11, 0.2)" : "rgba(110, 168, 254, 0.12)";
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = "#ecebe4";
        ctx.font = "11px ui-monospace, SFMono-Regular, monospace";
        ctx.fillText(`[${tag}] ${clean(labelOf(el), 36)}`, x + 4, y + 14);
      });

      const dataUrl = canvas.toDataURL("image/png");
      const base64 = dataUrl.replace(/^data:image\/png;base64,/, "");
      return {
        ok: true,
        url: location.href,
        title: document.title,
        width,
        height,
        ref: ref || null,
        fullPage: !!fullPage,
        data: base64,
      };
    },

    consoleErrors(includeWarnings, clear) {
      const items = consoleBuffer.filter((e) => includeWarnings || e.level === "error");
      if (clear) consoleBuffer.length = 0;
      return { ok: true, url: location.href, title: document.title, entries: items };
    },

    networkErrors(clear) {
      const items = [...networkBuffer];
      if (clear) networkBuffer.length = 0;
      return { ok: true, url: location.href, title: document.title, entries: items };
    },

    upload(ref, fileName, mimeType, base64) {
      const found = refElement(ref);
      if (found.error) return { ok: false, error: found.error };
      const { el } = found;
      if (el.tagName !== "INPUT" || (el.type || "").toLowerCase() !== "file") {
        return { ok: false, error: `"${ref}" is not an <input type="file"> element.` };
      }
      try {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const file = new File([bytes], fileName, { type: mimeType || "application/octet-stream" });
        const dt = new DataTransfer();
        dt.items.add(file);
        el.files = dt.files;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return { ok: true, fileName, size: bytes.length };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },

    setViewport(width, height, preset) {
      const root = document.documentElement;
      if (preset === "desktop" || (!width && !height)) {
        root.style.removeProperty("max-width");
        root.style.removeProperty("margin-left");
        root.style.removeProperty("margin-right");
        delete root.dataset.kanaViewport;
      } else {
        if (width) {
          root.style.maxWidth = `${width}px`;
          root.style.marginLeft = "auto";
          root.style.marginRight = "auto";
        }
        root.dataset.kanaViewport = preset || `${width}x${height || ""}`;
      }
      window.dispatchEvent(new Event("resize"));
      return {
        ok: true,
        preset: preset || "custom",
        width: width || window.innerWidth,
        height: height || window.innerHeight,
      };
    },
  };
})();
