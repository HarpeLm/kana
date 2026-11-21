/**
 * Le script qui tourne dans le cadre isolé pendant l'édition d'une page : il rend le texte modifiable sur place,
 * montre une corbeille au survol d'une ligne, ajoute une ligne avec Entrée, et rapporte chaque changement à
 * l'app (jamais de code de la page : celle-ci a été neutralisée avant).
 */
export const EDITOR_SCRIPT = String.raw`
(function () {
  var SKIP = { SCRIPT: 1, STYLE: 1, TEMPLATE: 1, HEAD: 1, TITLE: 1, META: 1, LINK: 1, SVG: 1, CANVAS: 1, VIDEO: 1, AUDIO: 1, BUTTON: 0, SELECT: 1, TEXTAREA: 1, INPUT: 1 };
  var INLINE = { A: 1, B: 1, I: 1, EM: 1, STRONG: 1, SPAN: 1, CODE: 1, SMALL: 1, SUB: 1, SUP: 1, U: 1, MARK: 1, ABBR: 1, TIME: 1, KBD: 1 };
  var DELETABLE = { LI: 1, TR: 1, P: 1, H1: 1, H2: 1, H3: 1, H4: 1, H5: 1, H6: 1, BLOCKQUOTE: 1, FIGURE: 1, IMG: 1, PRE: 1, DT: 1, DD: 1 };
  var send = function (m) { parent.postMessage(Object.assign({ kana: 1 }, m), '*'); };

  function hasText(el) {
    for (var i = 0; i < el.childNodes.length; i++) {
      var n = el.childNodes[i];
      if (n.nodeType === 3 && n.textContent.trim()) return true;
    }
    return false;
  }
  function pathOf(el) {
    var p = [];
    while (el && el !== document.documentElement) {
      var par = el.parentElement;
      if (!par) return null;
      p.unshift(Array.prototype.indexOf.call(par.children, el));
      el = par;
    }
    return p;
  }
  function nodeAt(path) {
    var n = document.documentElement;
    for (var i = 0; i < path.length; i++) { n = n && n.children[path[i]]; }
    return n || null;
  }

  var timers = new WeakMap();
  function makeEditable(el) {
    el.setAttribute('contenteditable', 'true');
    el.setAttribute('data-kana-text', '');
    el.spellcheck = true;
  }
  // Les éléments qui portent du texte : le plus haut de chaque bloc (les mots en gras ou les liens restent dedans).
  function scan(root) {
    var children = root.children;
    for (var i = 0; i < children.length; i++) {
      var el = children[i];
      if (SKIP[el.tagName] || el.hasAttribute('data-kana-editor')) continue;
      var inlineInsideText = INLINE[el.tagName] && el.parentElement && hasText(el.parentElement);
      if (hasText(el) && !inlineInsideText) { makeEditable(el); continue; }
      scan(el);
    }
  }
  scan(document.body);

  var style = document.createElement('style');
  style.textContent = '[data-kana-text]{outline:none;cursor:text;border-radius:3px;transition:background .12s,box-shadow .12s}'
    + '[data-kana-text]:hover{background:rgba(74,155,255,.10)}'
    + '[data-kana-text]:focus{background:rgba(74,155,255,.14);box-shadow:0 0 0 2px rgba(74,155,255,.55)}'
    + '#kana-trash{position:fixed;z-index:2147483647;display:none;width:26px;height:26px;border:0;border-radius:8px;background:#2a2a28;color:#f87171;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.35);align-items:center;justify-content:center;padding:0}'
    + '#kana-trash:hover{background:#3a2422}'
    + '#kana-grab{position:fixed;z-index:2147483647;display:none;width:20px;height:26px;border:0;border-radius:6px;background:#2a2a28;color:#a8a79f;cursor:grab;box-shadow:0 2px 8px rgba(0,0,0,.35);align-items:center;justify-content:center;padding:0;touch-action:none}'
    + '#kana-grab:hover{background:#3a3a37;color:#fff}'
    + '#kana-note{position:fixed;z-index:2147483647;display:none;width:26px;height:26px;border:0;border-radius:8px;background:#2a2a28;color:#8ab4f8;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.35);align-items:center;justify-content:center;padding:0}'
    + '#kana-note:hover{background:#2a3446}'
    + '[data-kana-marked]{outline:2px solid #4a9bff!important;outline-offset:3px;border-radius:4px}'
    + '#kana-line{position:fixed;z-index:2147483646;display:none;height:3px;border-radius:2px;background:#4a9bff;pointer-events:none}';
  document.head.appendChild(style);

  // Changement de texte : envoyé un court instant après la dernière frappe.
  document.addEventListener('input', function (e) {
    var el = e.target.closest && e.target.closest('[data-kana-text]');
    if (!el) return;
    clearTimeout(timers.get(el));
    timers.set(el, setTimeout(function () {
      var path = pathOf(el);
      if (path) send({ kind: 'text', path: path, html: el.innerHTML });
    }, 250));
  });

  // Pas de mise en forme, pas de HTML collé : seulement du texte.
  document.addEventListener('beforeinput', function (e) {
    if (/^format/.test(e.inputType)) e.preventDefault();
    if (e.inputType === 'insertFromPaste' || e.inputType === 'insertFromDrop') {
      e.preventDefault();
      var text = e.dataTransfer ? e.dataTransfer.getData('text/plain') : '';
      if (text) document.execCommand('insertText', false, text.replace(/\s*\n\s*/g, ' '));
    }
  });

  document.addEventListener('keydown', function (e) {
    var mod = e.metaKey || e.ctrlKey;
    if (mod && !e.shiftKey && e.key.toLowerCase() === 'z') { e.preventDefault(); send({ kind: 'undo' }); return; }
    if (mod && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) { e.preventDefault(); send({ kind: 'redo' }); return; }
    if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); send({ kind: 'save' }); return; }
    var el = e.target.closest && e.target.closest('[data-kana-text]');
    if (!el || e.key !== 'Enter') return;
    e.preventDefault();
    // Entrée dans un paragraphe ou un élément de liste : une nouvelle ligne du même genre, juste dessous.
    if (e.shiftKey || (el.tagName !== 'LI' && el.tagName !== 'P')) return;
    var fresh = el.cloneNode(false);
    fresh.removeAttribute('contenteditable'); fresh.removeAttribute('data-kana-text');
    fresh.innerHTML = '';
    el.parentElement.insertBefore(fresh, el.nextSibling);
    var path = pathOf(fresh);
    if (!path) return;
    var plain = fresh.cloneNode(false);
    send({ kind: 'insert', parent: path.slice(0, -1), index: path[path.length - 1], html: plain.outerHTML });
    makeEditable(fresh);
    fresh.focus();
  });

  // La corbeille : au survol d'une ligne, un bouton pour la supprimer.
  var trash = document.createElement('button');
  trash.id = 'kana-trash';
  trash.title = 'Supprimer cette ligne';
  trash.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/></svg>';
  document.body.appendChild(trash);
  // La poignée : on attrape une ligne pour la déplacer parmi ses voisines ; les numéros d'une liste suivent tout seuls.
  var grab = document.createElement('button');
  grab.id = 'kana-grab';
  grab.title = 'Glisser pour déplacer';
  grab.innerHTML = '<svg width="12" height="14" viewBox="0 0 12 14" fill="currentColor"><circle cx="3.5" cy="2.5" r="1.3"/><circle cx="8.5" cy="2.5" r="1.3"/><circle cx="3.5" cy="7" r="1.3"/><circle cx="8.5" cy="7" r="1.3"/><circle cx="3.5" cy="11.5" r="1.3"/><circle cx="8.5" cy="11.5" r="1.3"/></svg>';
  document.body.appendChild(grab);
  // La bulle de commentaire : un bouton pour demander à l'agent de corriger cette ligne.
  var note = document.createElement('button');
  note.id = 'kana-note';
  note.title = "Commenter (l'agent modifie seulement ici)";
  note.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
  document.body.appendChild(note);
  var line = document.createElement('div');
  line.id = 'kana-line';
  document.body.appendChild(line);
  var drag = null;
  function visible(el) { var r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; }
  grab.addEventListener('pointerdown', function (e) {
    if (!current || !current.parentElement) return;
    e.preventDefault();
    grab.setPointerCapture(e.pointerId);
    drag = { el: current, from: pathOf(current), before: undefined };
    current.style.opacity = '.4';
    trash.style.display = 'none';
  });
  grab.addEventListener('pointermove', function (e) {
    if (!drag) return;
    var sibs = Array.prototype.filter.call(drag.el.parentElement.children, function (c) { return c !== drag.el && visible(c); });
    var before = null;
    for (var i = 0; i < sibs.length; i++) {
      var r = sibs[i].getBoundingClientRect();
      if (e.clientY < r.top + r.height / 2) { before = sibs[i]; break; }
    }
    drag.before = before;
    if (!sibs.length) return;
    var ref = before ? before.getBoundingClientRect() : sibs[sibs.length - 1].getBoundingClientRect();
    var first = sibs[0].getBoundingClientRect();
    line.style.display = 'block';
    line.style.top = (before ? ref.top - 2 : ref.bottom + 1) + 'px';
    line.style.left = first.left + 'px';
    line.style.width = first.width + 'px';
  });
  function endDrag(e, drop) {
    if (!drag) return;
    var d = drag; drag = null;
    d.el.style.opacity = '';
    line.style.display = 'none';
    grab.style.display = 'none';
    if (!drop || d.before === undefined || !d.el.parentElement) return;
    var parent = d.el.parentElement;
    var others = Array.prototype.filter.call(parent.children, function (c) { return c !== d.el; });
    var to = d.before ? others.indexOf(d.before) : others.length;
    var from = Array.prototype.indexOf.call(parent.children, d.el);
    if (to < 0 || to === from) return;
    parent.insertBefore(d.el, others[to] || null);
    send({ kind: 'move', from: d.from, to: to });
  }
  grab.addEventListener('pointerup', function (e) { endDrag(e, true); });
  grab.addEventListener('pointercancel', function (e) { endDrag(e, false); });

  var current = null, hideTimer = null;
  function place(el) {
    var r = el.getBoundingClientRect();
    var movable = el.parentElement && el.parentElement.children.length > 1;
    grab.style.display = movable ? 'flex' : 'none';
    grab.style.top = Math.max(2, r.top + 1) + 'px';
    grab.style.left = Math.max(2, r.left - 24) + 'px';
    note.style.display = 'flex';
    note.style.top = Math.max(2, r.top + 2) + 'px';
    note.style.left = Math.min(window.innerWidth - 58, r.right - 56) + 'px';
    trash.style.display = 'flex';
    trash.style.top = Math.max(2, r.top + 2) + 'px';
    trash.style.left = Math.min(window.innerWidth - 30, r.right - 28) + 'px';
  }
  document.addEventListener('mouseover', function (e) {
    var t = e.target;
    if (drag || t === trash || t === grab || t === note || (note.contains && note.contains(t)) || (trash.contains && trash.contains(t)) || (grab.contains && grab.contains(t))) { clearTimeout(hideTimer); return; }
    var el = t.closest && t.closest('li,tr,p,h1,h2,h3,h4,h5,h6,blockquote,figure,img,pre,dt,dd');
    while (el && !DELETABLE[el.tagName]) el = el.parentElement;
    if (!el || el === document.body) { hideTimer = setTimeout(function () { trash.style.display = 'none'; note.style.display = 'none'; grab.style.display = 'none'; current = null; }, 250); return; }
    clearTimeout(hideTimer);
    current = el;
    place(el);
  });
  note.addEventListener('click', function () {
    if (!current) return;
    var path = pathOf(current);
    if (!path) return;
    var heading = '';
    var h = current;
    while (h && !heading) {
      var prev = h;
      while ((prev = prev.previousElementSibling)) {
        if (/^H[1-6]$/.test(prev.tagName)) { heading = prev.textContent.trim(); break; }
      }
      if (/^H[1-6]$/.test(h.tagName)) heading = h.textContent.trim();
      h = h.parentElement && h.parentElement !== document.body ? h.parentElement : null;
    }
    var r = current.getBoundingClientRect();
    send({ kind: 'comment', path: path, html: current.outerHTML.replace(/ (contenteditable|data-kana-[a-z]+)(="[^"]*")?/g, '').slice(0, 1500), text: current.textContent.trim().slice(0, 300), heading: heading.slice(0, 120), rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom } });
    note.style.display = 'none'; trash.style.display = 'none'; grab.style.display = 'none';
  });
  trash.addEventListener('click', function () {
    if (!current) return;
    var path = pathOf(current);
    if (path) { send({ kind: 'remove', path: path }); current.remove(); }
    trash.style.display = 'none';
    current = null;
  });
  document.addEventListener('scroll', function () { trash.style.display = 'none'; note.style.display = 'none'; if (!drag) grab.style.display = 'none'; }, true);

  // Les liens et boutons de la page ne naviguent pas pendant l'édition.
  document.addEventListener('click', function (e) {
    // Surligner du texte (glisser sur un libellé) ne coche pas la case : seul un vrai clic la coche.
    var sel = window.getSelection && window.getSelection();
    if (sel && !sel.isCollapsed && e.target.closest && e.target.closest('label') && !(e.target.matches && e.target.matches('input'))) {
      e.preventDefault();
      return;
    }
    var a = e.target.closest && e.target.closest('a,button,form');
    if (a && a.id !== 'kana-trash' && a.id !== 'kana-grab' && a.id !== 'kana-note') e.preventDefault();
  }, true);

  // Commandes de l'app : annuler, rétablir (appliquées au cadre).
  window.addEventListener('message', function (e) {
    var m = e.data;
    if (!m || !m.kana) return;
    var el, tpl;
    if (m.cmd === 'mark') {
      Array.prototype.forEach.call(document.querySelectorAll('[data-kana-marked]'), function (x) { x.removeAttribute('data-kana-marked'); });
      el = m.path && nodeAt(m.path); if (el) el.setAttribute('data-kana-marked', '');
      return;
    }
    if (m.cmd === 'set') { el = nodeAt(m.path); if (el) el.innerHTML = m.html; }
    else if (m.cmd === 'remove') { el = nodeAt(m.path); if (el) el.remove(); }
    else if (m.cmd === 'move') {
      el = nodeAt(m.from);
      if (el && el.parentElement) {
        var rest = Array.prototype.filter.call(el.parentElement.children, function (c) { return c !== el; });
        el.parentElement.insertBefore(el, rest[m.to] || null);
      }
    }
    else if (m.cmd === 'insert') {
      var par = nodeAt(m.parent);
      if (par) {
        tpl = document.createElement('template'); tpl.innerHTML = m.html;
        var added = tpl.content.firstElementChild;
        if (added) { par.insertBefore(added, par.children[m.index] || null); scan(par); if (hasText(added)) makeEditable(added); }
      }
    }
    if (m.cmd === 'set' || m.cmd === 'insert') scan(document.body);
  });
  send({ kind: 'ready' });
})();
`;
