/* QenBel assistant page.
   Conversations are saved in this browser only (localStorage).
   Nothing reaches the team until the visitor emails it themselves from the "Email the team" bar. */
(function () {
  "use strict";

  var API = (window.QENBEL_API || "").replace(/\/$/, "");
  var TEAM = "admin.qenbel@gmail.com";
  var STORE_KEY = "qenbel:chats:v2";
  var OLD_KEY = "qenbel:chat:v1";
  var EMAIL_KEY = "qenbel:email";
  var MAX_CHATS = 30;
  var MAX_MSGS = 60;

  var $ = function (s) { return document.querySelector(s); };
  var side = $("#side"), scrim = $("[data-scrim]"), list = $("[data-list]");
  var scroller = $("[data-scroll]"), thread = $("[data-thread]"), empty = $("[data-empty]");
  var form = $("[data-form]"), box = $("#composer"), sendBtn = form.querySelector(".send");

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text; /* textContent only: model output is never parsed as HTML */
    return n;
  }
  function read(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
  function write(key, val) { try { localStorage.setItem(key, val); } catch (e) { /* full or blocked */ } }

  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  /* ---------- storage ---------- */

  // Saved data can be edited by anyone with access to the browser, so check its shape before drawing it.
  function validMessage(m) {
    return !!m && typeof m.content === "string" && (m.role === "user" || m.role === "assistant");
  }

  var store = { activeId: null, chats: [] };
  (function load() {
    try {
      var s = JSON.parse(read(STORE_KEY) || "null");
      if (s && Array.isArray(s.chats)) {
        store = { activeId: typeof s.activeId === "string" ? s.activeId : null, chats: s.chats.filter(function (c) { return c && typeof c.id === "string" && Array.isArray(c.messages); }) };
        store.chats.forEach(function (c) { c.title = String(c.title || "New chat").slice(0, 60); c.messages = c.messages.filter(validMessage); });
      }
    } catch (e) { /* ignore corrupt data */ }
    if (!store.chats.length) { /* bring over the single chat saved by the earlier version */
      try {
        var old = JSON.parse(read(OLD_KEY) || "null");
        if (old && Array.isArray(old.messages) && old.messages.length) {
          store.chats.push({ id: uid(), title: titleFrom(old.messages), createdAt: Date.now(), messages: old.messages });
        }
      } catch (e) { /* ignore */ }
    }
    if (!current()) newChat(true);
  })();
  function save() {
    store.chats = store.chats.filter(function (c) { return c.messages.length || c.id === store.activeId; }).slice(-MAX_CHATS);
    write(STORE_KEY, JSON.stringify(store));
  }
  function current() {
    for (var i = 0; i < store.chats.length; i++) if (store.chats[i].id === store.activeId) return store.chats[i];
    return null;
  }
  function titleFrom(msgs) {
    for (var i = 0; i < msgs.length; i++) if (msgs[i].role === "user") return msgs[i].content.replace(/\s+/g, " ").slice(0, 44);
    return "New chat";
  }
  function newChat(silent) {
    var cur = current();
    if (cur && !cur.messages.length) return cur;
    var c = { id: uid(), title: "New chat", createdAt: Date.now(), messages: [] };
    store.chats.push(c); store.activeId = c.id;
    if (!silent) { save(); renderAll(); box.focus(); }
    return c;
  }

  /* ---------- orbs ---------- */

  var emptyOrb = null;
  function orb(host, mode) { return window.QenBelOrb ? window.QenBelOrb.make(host, mode) : null; }

  /* ---------- messages ---------- */

  function renderMessage(m) {
    var user = m.role === "user";
    var row = el("div", "m " + (user ? "m--user" : "m--bot") + (m.error ? " m--error" : ""));
    if (!user) { var host = el("span", "orb"); host.setAttribute("aria-hidden", "true"); row.appendChild(host); orb(host, "idle"); }
    var body = el("div", "m__body");
    m.content.split(/\n{2,}/).forEach(function (p) { if (p.trim()) body.appendChild(el("p", null, p.trim())); });
    row.appendChild(body);
    thread.appendChild(row);
    return row;
  }
  function scrollDown() { scroller.scrollTop = scroller.scrollHeight; }

  // What the model sees: the text of the conversation, with each assistant reply's signature.
  function historyFor(n) {
    var cur = current();
    return cur.messages.filter(function (m) { return !m.error; }).slice(-n).map(function (m) {
      var o = { role: m.role, content: m.content };
      if (m.role === "assistant" && m.sig) o.sig = m.sig;
      return o;
    });
  }

  /* ---------- email the team: opens the visitor's own email, nothing goes through our servers ---------- */

  var mailbar = $("[data-mailbar]"), mailBtns = $("[data-mailbtns]");
  function enc(s) { return encodeURIComponent(s); }

  function draft() {
    var out = ["Hello QenBel team,", "", "I was chatting with the assistant on qenbel.site and would like to follow up by email.", "", "My message:", "", "[Write what you need here]", "", "-----", "Chat so far (for reference):"];
    current().messages.filter(function (m) { return !m.error; }).slice(-8).forEach(function (m) {
      out.push((m.role === "user" ? "Me: " : "Assistant: ") + m.content.replace(/\s+/g, " ").slice(0, 280));
    });
    out.push("", "Thank you");
    var body = out.join("\r\n");
    if (body.length > 1800) body = body.slice(0, 1780) + "..."; /* keeps the link short enough for every email app */
    return { to: TEAM, subject: "Enquiry from the qenbel.site assistant", body: body };
  }

  function renderMailbar() {
    var has = current().messages.some(function (m) { return m.role === "user"; });
    mailbar.hidden = !has;
    mailBtns.textContent = "";
    if (!has) return;
    var d = draft();
    function link(label, href, cls, external) {
      var a = el("a", cls, label); a.href = href;
      if (external) { a.target = "_blank"; a.rel = "noopener noreferrer"; }
      return a;
    }
    mailBtns.appendChild(link("Open in Gmail", "https://mail.google.com/mail/?view=cm&fs=1&to=" + enc(d.to) + "&su=" + enc(d.subject) + "&body=" + enc(d.body), "mb mb--main", true));
    mailBtns.appendChild(link("Email app", "mailto:" + d.to + "?subject=" + enc(d.subject) + "&body=" + enc(d.body), "mb", false));
    mailBtns.appendChild(link("Outlook", "https://outlook.live.com/mail/0/deeplink/compose?to=" + enc(d.to) + "&subject=" + enc(d.subject) + "&body=" + enc(d.body), "mb", true));
    var copy = el("button", "mb", "Copy details"); copy.type = "button";
    copy.addEventListener("click", function () {
      var text = "To: " + d.to + "\nSubject: " + d.subject + "\n\n" + d.body;
      var ok = function () { copy.textContent = "Copied"; setTimeout(function () { copy.textContent = "Copy details"; }, 2000); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, function () { copy.textContent = "Copy failed"; });
      else copy.textContent = "Copy failed";
    });
    mailBtns.appendChild(copy);
  }

  /* ---------- sidebar ---------- */

  function renderList() {
    list.textContent = "";
    var chats = store.chats.filter(function (c) { return c.messages.length; }).slice().reverse();
    if (!chats.length) { list.appendChild(el("li", "side__empty", "Your chats will appear here.")); return; }
    chats.forEach(function (c) {
      var li = el("li");
      var b = el("button", "conv", c.title); b.type = "button";
      if (c.id === store.activeId) b.setAttribute("aria-current", "true");
      b.addEventListener("click", function () { store.activeId = c.id; save(); renderAll(); closeSide(); });
      li.appendChild(b);
      var d = el("button", "conv__del"); d.type = "button"; d.setAttribute("aria-label", "Delete chat: " + c.title);
      var ns = "http://www.w3.org/2000/svg", s = document.createElementNS(ns, "svg"); s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("aria-hidden", "true");
      var p = document.createElementNS(ns, "path"); p.setAttribute("d", "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"); s.appendChild(p); d.appendChild(s);
      d.addEventListener("click", function () {
        store.chats = store.chats.filter(function (x) { return x.id !== c.id; });
        if (store.activeId === c.id) { store.activeId = null; var last = store.chats[store.chats.length - 1]; if (last) store.activeId = last.id; else newChat(true); }
        save(); renderAll();
      });
      li.appendChild(d); list.appendChild(li);
    });
  }

  function renderAll() {
    var cur = current();
    thread.textContent = "";
    cur.messages.forEach(function (m) { try { renderMessage(m); } catch (e) { /* skip a message that cannot be drawn */ } });
    var has = cur.messages.length > 0;
    empty.hidden = has; thread.hidden = !has;
    if (!emptyOrb) emptyOrb = orb($("[data-empty-orb]"), "idle");
    renderList(); renderMailbar();
    if (has) scrollDown(); else scroller.scrollTop = 0;
  }

  function openSide() { side.classList.add("is-open"); scrim.hidden = false; }
  function closeSide() { side.classList.remove("is-open"); scrim.hidden = true; }
  $("[data-menu]").addEventListener("click", openSide);
  $("[data-side-close]").addEventListener("click", closeSide);
  scrim.addEventListener("click", closeSide);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeSide(); });
  $("[data-new]").addEventListener("click", function () { newChat(false); closeSide(); });

  $("[data-wipe]").addEventListener("click", function () {
    [STORE_KEY, OLD_KEY, EMAIL_KEY, "qenbel:currency"].forEach(function (k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } });
    store = { activeId: null, chats: [] };
    newChat(true); renderAll(); closeSide();
  });

  /* ---------- sending ---------- */

  var busy = false, thinkingRow = null;

  function showThinking() {
    thinkingRow = el("div", "m m--bot");
    var host = el("span", "orb"); host.setAttribute("aria-hidden", "true");
    thinkingRow.appendChild(host);
    var body = el("div", "m__body");
    var t = el("div", "thinking"); var label = el("span", null, "Thinking"); t.appendChild(label);
    body.appendChild(t); thinkingRow.appendChild(body);
    thread.appendChild(thinkingRow);
    orb(host, "thinking");
    thinkingRow._timer = setTimeout(function () { label.textContent = "Still working. The assistant may be waking up"; }, 7000);
    scrollDown();
  }
  function hideThinking() {
    if (!thinkingRow) return;
    clearTimeout(thinkingRow._timer); thinkingRow.remove(); thinkingRow = null;
  }
  function setBusy(v) { busy = v; box.disabled = v; sync(); if (!v) box.focus(); }

  function send(text) {
    text = text.trim();
    var cur = current();
    if (!text || busy) return;
    var first = !cur.messages.length;
    cur.messages.push({ role: "user", content: text.slice(0, 1500) });
    if (first) { cur.title = titleFrom(cur.messages); }
    cur.messages = cur.messages.slice(-MAX_MSGS);
    save();
    if (first) { empty.hidden = true; thread.hidden = false; renderList(); }
    renderMailbar();
    renderMessage(cur.messages[cur.messages.length - 1]);
    box.value = ""; autosize();
    setBusy(true); showThinking();

    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, 70000);
    fetch(API + "/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: historyFor(16) }), signal: ctrl.signal })
      .then(function (res) { return res.json().catch(function () { return {}; }).then(function (data) { return { ok: res.ok, data: data }; }); })
      .then(function (r) {
        hideThinking();
        if (!r.ok || !r.data.reply) throw new Error(r.data.message || "unavailable");
        var msg = { role: "assistant", content: r.data.reply, sig: r.data.sig };
        cur.messages.push(msg); save(); renderMessage(msg); renderMailbar();
      })
      .catch(function (err) {
        hideThinking();
        var known = err && err.message && err.message !== "unavailable" && err.name !== "AbortError" && err.message !== "Failed to fetch";
        var row = renderMessage({ role: "assistant", error: true, content: (known ? err.message : "The assistant could not be reached right now.") + "\n\nYou can email " + TEAM + " instead and the team will reply." });
        var a = el("a", null, TEAM); a.href = "mailto:" + TEAM;
        var p = el("p"); p.appendChild(a); row.querySelector(".m__body").appendChild(p);
      })
      .then(function () { clearTimeout(timer); setBusy(false); scrollDown(); });
  }

  /* ---------- composer ---------- */

  function autosize() {
    box.style.height = "auto";
    var h = Math.min(box.scrollHeight, 144);
    box.style.height = h + "px";
    box.style.overflowY = box.scrollHeight > 144 ? "auto" : "hidden";
  }
  function sync() { sendBtn.disabled = busy || !box.value.trim(); }
  box.addEventListener("input", function () { autosize(); sync(); });
  box.addEventListener("keydown", function (e) { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(box.value); } });
  form.addEventListener("submit", function (e) { e.preventDefault(); send(box.value); });
  Array.prototype.forEach.call(document.querySelectorAll("[data-prompt]"), function (b) {
    b.addEventListener("click", function () { send(b.getAttribute("data-prompt")); });
  });

  function start() { renderAll(); autosize(); sync(); box.focus(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
