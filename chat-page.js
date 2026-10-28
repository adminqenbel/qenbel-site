/* QenBel assistant page.
   Conversations and estimate cards are saved in this browser only (localStorage).
   Nothing reaches the team until the visitor presses "Send to the QenBel team" on an estimate card. */
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

  /* ---------- location and currency ---------- */

  // Prices are set in USD. The visitor's country picks a display currency; they can change it.
  var fx = { rates: { USD: 1 }, asOf: "" };
  var view = { code: "USD", country: null };
  var CURRENCY_KEY = "qenbel:currency";
  var COMMON = "USD EUR GBP INR AED SAR QAR KWD BHD OMR SGD MYR THB IDR PHP VND JPY KRW CNY HKD TWD AUD NZD CAD CHF SEK NOK DKK PLN CZK HUF RON TRY ILS ZAR NGN KES EGP GHS BRL MXN ARS CLP COP PEN PKR BDT LKR NPR RUB UAH".split(" ");
  var ZONES = {
    "Asia/Kolkata": "IN", "Asia/Calcutta": "IN", "Asia/Dubai": "AE", "Asia/Riyadh": "SA", "Asia/Qatar": "QA", "Asia/Kuwait": "KW",
    "Asia/Singapore": "SG", "Asia/Kuala_Lumpur": "MY", "Asia/Bangkok": "TH", "Asia/Jakarta": "ID", "Asia/Manila": "PH", "Asia/Ho_Chi_Minh": "VN",
    "Asia/Tokyo": "JP", "Asia/Seoul": "KR", "Asia/Shanghai": "CN", "Asia/Hong_Kong": "HK", "Asia/Taipei": "TW", "Asia/Karachi": "PK",
    "Asia/Dhaka": "BD", "Asia/Colombo": "LK", "Asia/Kathmandu": "NP", "Asia/Jerusalem": "IL",
    "Europe/London": "GB", "Europe/Dublin": "IE", "Europe/Paris": "FR", "Europe/Berlin": "DE", "Europe/Madrid": "ES", "Europe/Rome": "IT",
    "Europe/Amsterdam": "NL", "Europe/Brussels": "BE", "Europe/Vienna": "AT", "Europe/Zurich": "CH", "Europe/Stockholm": "SE", "Europe/Oslo": "NO",
    "Europe/Copenhagen": "DK", "Europe/Helsinki": "FI", "Europe/Warsaw": "PL", "Europe/Prague": "CZ", "Europe/Lisbon": "PT", "Europe/Athens": "GR",
    "Europe/Istanbul": "TR", "Europe/Kyiv": "UA", "Europe/Kiev": "UA", "Africa/Lagos": "NG", "Africa/Nairobi": "KE", "Africa/Johannesburg": "ZA",
    "Africa/Cairo": "EG", "Africa/Accra": "GH", "Australia/Sydney": "AU", "Australia/Melbourne": "AU", "Australia/Brisbane": "AU", "Australia/Perth": "AU",
    "Pacific/Auckland": "NZ", "America/Toronto": "CA", "America/Vancouver": "CA", "America/New_York": "US", "America/Chicago": "US",
    "America/Denver": "US", "America/Los_Angeles": "US", "America/Mexico_City": "MX", "America/Sao_Paulo": "BR",
    "America/Argentina/Buenos_Aires": "AR", "America/Bogota": "CO", "America/Santiago": "CL", "America/Lima": "PE"
  };

  // The browser's own clues, used only when the network gives no location: time zone first, then language region.
  function regionHint() {
    try {
      var tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz && ZONES[tz]) return ZONES[tz];
    } catch (e) { /* ignore */ }
    try {
      var lang = (navigator.languages && navigator.languages[0]) || navigator.language || "";
      var m = lang.match(/[-_]([A-Za-z]{2})$/);
      if (m) return m[1].toUpperCase();
    } catch (e) { /* ignore */ }
    return "";
  }

  function money(q, usd) {
    var rate = fx.rates[view.code] || 1;
    var n = usd * rate;
    try {
      return new Intl.NumberFormat(undefined, { style: "currency", currency: view.code, maximumFractionDigits: 0 }).format(n);
    } catch (e) { return view.code + " " + Math.round(n).toLocaleString(); }
  }
  function fxNote() {
    if (view.code === "USD" || !fx.rates[view.code]) return "";
    return "Shown in " + view.code + " at about 1 USD = " + fx.rates[view.code].toFixed(2) + " " + view.code + (fx.asOf ? " (rates as of " + fx.asOf + ")" : "") +
      ". Prices are set in USD, and the team confirms the final price and currency by email.";
  }
  function name(type, code) {
    try { return new Intl.DisplayNames(["en"], { type: type }).of(code) || code; } catch (e) { return code; }
  }

  function setupCurrency() {
    var box = $("[data-loc]"), text = $("[data-loc-text]"), select = $("[data-currency]");
    var hint = regionHint();
    function json(url) { return fetch(url).then(function (r) { if (!r.ok) throw new Error(String(r.status)); return r.json(); }); }

    Promise.all([json(API + "/api/rates"), json(API + "/api/geo?hint=" + encodeURIComponent(hint))]).then(function (r) {
      var rates = r[0], geo = r[1];
      fx = { rates: rates.rates, asOf: rates.asOf || "" };
      var saved = read(CURRENCY_KEY);
      var detected = fx.rates[geo.currency] ? geo.currency : "USD";
      view.code = saved && fx.rates[saved] ? saved : detected;
      view.country = geo.country;

      var codes = COMMON.filter(function (c) { return fx.rates[c]; });
      [detected, view.code].forEach(function (c) { if (codes.indexOf(c) < 0) codes.push(c); });
      var compact = window.matchMedia("(max-width: 52rem)").matches;
      codes.forEach(function (c) {
        var o = el("option", null, compact ? c : c + " - " + name("currency", c)); o.value = c; select.appendChild(o);
      });
      select.value = view.code;
      text.textContent = geo.country ? name("region", geo.country) : "Location not detected";
      text.title = geo.source === "network" ? "Detected from your connection" : geo.source === "browser" ? "Detected from your browser settings" : "Choose your currency";
      box.hidden = false;
      select.addEventListener("change", function () {
        view.code = select.value; write(CURRENCY_KEY, view.code); renderAll();
      });
      if (view.code !== "USD") renderAll();
    }).catch(function () { /* stay in USD and keep the control hidden */ });
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  /* ---------- storage ---------- */

  // Saved data can be edited by anyone with access to the browser, so check its shape before drawing it.
  function validQuote(q) {
    return !!q && typeof q === "object" && Array.isArray(q.lines) && Array.isArray(q.offers) && q.totals && typeof q.totals === "object" &&
      typeof q.title === "string" && typeof q.disclaimer === "string" && typeof q.id === "string" &&
      (q.assumptions === undefined || Array.isArray(q.assumptions)) &&
      q.lines.every(function (l) { return l && Array.isArray(l.includes) && typeof l.amount === "number" && typeof l.serviceName === "string" && typeof l.tierLabel === "string"; }) &&
      q.offers.every(function (o) { return o && typeof o.name === "string"; });
  }
  function validMessage(m) {
    return !!m && typeof m.content === "string" && (m.role === "user" || m.role === "assistant") && (!m.quote || validQuote(m.quote));
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

  /* ---------- estimate card ---------- */

  /* ---------- sending the estimate: open the visitor's own email, nothing goes through our servers ---------- */

  function usd(n) { return "USD " + Math.round(n).toLocaleString("en-US"); }
  function enc(s) { return encodeURIComponent(s); }

  function draftFor(m) {
    var q = m.quote;
    var out = ["Hello QenBel team,", "", "I would like to confirm this estimate from your website assistant (reference " + q.id + ").", ""];
    var names = [];
    q.lines.forEach(function (l) {
      if (names.indexOf(l.serviceName) < 0) names.push(l.serviceName);
      out.push("- " + l.serviceName + ", " + l.tierLabel + (l.quantity > 1 ? " x" + l.quantity : "") + ": " + usd(l.amount) +
        (l.billing === "monthly" ? " per month" : "") + (l.commitMonths ? " (" + l.commitMonths + " month commitment)" : ""));
    });
    q.offers.forEach(function (o) { out.push("Offer applied: " + o.name); });
    var t = q.totals;
    if (t.oneTimeGross) out.push("", "One-time total: " + usd(t.oneTimeTotal));
    if (t.monthlyGross) out.push("Monthly total: " + usd(t.monthlyTotal) + " per month");
    if (view.code !== "USD" && fx.rates[view.code]) out.push("(Shown to me in " + view.code + " at about 1 USD = " + fx.rates[view.code].toFixed(2) + " " + view.code + ".)");
    if (q.assumptions && q.assumptions.length) { out.push("", "Assumptions:"); q.assumptions.forEach(function (x) { out.push("- " + x); }); }

    var said = current().messages.filter(function (x) { return x.role === "user"; }).slice(-4)
      .map(function (x) { return x.content.replace(/\s+/g, " ").slice(0, 300); });
    if (said.length) { out.push("", "About my project:"); said.forEach(function (x) { out.push("- " + x); }); }

    out.push("", "This is an AI estimate. Please confirm the final price and timeline by email.", "", "Thank you");
    var body = out.join("\r\n");
    if (body.length > 1800) body = body.slice(0, 1780) + "..."; /* keeps the link short enough for every email app */
    return { to: TEAM, subject: ("Estimate request " + q.id + ": " + names.join(", ")).slice(0, 90), body: body };
  }

  function renderQuote(m) {
    var q = m.quote;
    var card = el("article", "qc");
    card.setAttribute("aria-label", "Estimate " + q.id);

    var head = el("div", "qc__head");
    head.appendChild(el("h3", null, q.title));
    var isList = q.mode === "list" || q.mode === "offers";
    var isOffers = q.mode === "offers";
    head.appendChild(el("span", "qc__tag", isOffers ? "Offers" : isList ? "Price list" : "AI estimate"));
    head.appendChild(el("span", "qc__ref", isOffers ? "Applied automatically when you qualify" : isList ? "List prices, before any offers" : "Reference " + q.id + ". Valid for " + q.validityDays + " days."));
    card.appendChild(head);

    var ul = el("ul", "qc__lines");
    q.lines.forEach(function (l) {
      var li = el("li", "qc__line");
      var row = el("div", "qc__row");
      var left = el("div");
      left.appendChild(el("div", "qc__name", l.serviceName));
      left.appendChild(el("span", "qc__tier", l.tierLabel + (l.quantity > 1 ? " x" + l.quantity : "")));
      row.appendChild(left);
      var price = el("div", "qc__price", money(q, l.amount));
      if (l.billing === "monthly") price.appendChild(el("small", null, " / month"));
      row.appendChild(price);
      li.appendChild(row);

      var d = el("details");
      d.appendChild(el("summary", null, "What is included"));
      var inc = el("ul");
      l.includes.forEach(function (t) { inc.appendChild(el("li", null, t)); });
      inc.appendChild(el("li", null, "Timeline: " + l.timeline));
      if (l.commitMonths) inc.appendChild(el("li", null, "Commitment: " + l.commitMonths + " months"));
      d.appendChild(inc); li.appendChild(d);
      ul.appendChild(li);
    });
    card.appendChild(ul);

    if (isOffers) {
      var ol = el("ul", "qc__lines");
      q.offers.forEach(function (o) {
        var li = el("li", "qc__line");
        var row = el("div", "qc__row");
        var left = el("div");
        left.appendChild(el("div", "qc__name", o.name));
        left.appendChild(el("div", "qc__offerdesc", o.description));
        row.appendChild(left);
        row.appendChild(el("div", "qc__price", o.percent + "% off"));
        li.appendChild(row); ol.appendChild(li);
      });
      card.appendChild(ol);
    }

    if (!isList && q.offers.length) {
      var of = el("ul", "qc__offers");
      q.offers.forEach(function (o) {
        of.appendChild(el("li", null, o.name + ": saves " + money(q, o.saves) + (o.per === "month" ? "/month" : "")));
      });
      card.appendChild(of);
    }

    var tot = el("div", "qc__totals");
    function totalRow(label, gross, net, suffix) {
      var r = el("div", "qc__total");
      r.appendChild(el("span", null, label));
      var v = el("span");
      if (net !== gross) v.appendChild(el("s", null, money(q, gross)));
      v.appendChild(el("strong", null, money(q, net)));
      if (suffix) v.appendChild(el("small", null, suffix));
      r.appendChild(v); tot.appendChild(r);
    }
    if (q.totals.oneTimeGross) totalRow("One-time total", q.totals.oneTimeGross, q.totals.oneTimeTotal, "");
    if (q.totals.monthlyGross) totalRow("Monthly total", q.totals.monthlyGross, q.totals.monthlyTotal, "/mo");
    if (!isList) card.appendChild(tot);

    if (!isList && q.assumptions && q.assumptions.length) {
      var ad = el("details");
      ad.appendChild(el("summary", null, "Assumptions"));
      var al = el("ul");
      q.assumptions.forEach(function (a) { al.appendChild(el("li", null, a)); });
      ad.appendChild(al); card.appendChild(ad);
    }

    var note = fxNote();
    if (note) card.appendChild(el("p", "qc__fx", note));

    var dis = el("p", "qc__disclaimer");
    dis.appendChild(el("strong", null, isList ? (isOffers ? "Offers are indicative. " : "List prices only. ") : "Estimate only. "));
    dis.appendChild(document.createTextNode(q.disclaimer));
    card.appendChild(dis);

    if (isList) {
      var names = [];
      q.lines.forEach(function (l) { if (names.indexOf(l.serviceName) < 0) names.push(l.serviceName); });
      var ask = names.length ? "Please prepare an estimate for my project. I am interested in: " + names.slice(0, 4).join(", ") + "." : "I would like an estimate for my project.";
      var go = el("button", "qc__go", "Get an estimate for my project"); go.type = "button";
      go.addEventListener("click", function () {
        send(ask);
      });
      card.appendChild(go);
      card.appendChild(el("p", "qc__consent", "Tell me what you run and what needs to change, and I will turn this into an estimate you can send to the team."));
      return card;
    }

    card.appendChild(emailPanel(m));
    return card;
  }

  function emailPanel(m) {
    var d = draftFor(m);
    var box = el("div", "qc__send");
    box.appendChild(el("strong", null, "Send this to the QenBel team"));
    var row = el("div", "qc__btns");
    function link(label, href, cls, external) {
      var a = el("a", cls, label); a.href = href;
      if (external) { a.target = "_blank"; a.rel = "noopener noreferrer"; }
      return a;
    }
    row.appendChild(link("Open in Gmail", "https://mail.google.com/mail/?view=cm&fs=1&to=" + enc(d.to) + "&su=" + enc(d.subject) + "&body=" + enc(d.body), "qc__go", true));
    row.appendChild(link("Email app", "mailto:" + d.to + "?subject=" + enc(d.subject) + "&body=" + enc(d.body), "qc__alt", false));
    row.appendChild(link("Outlook", "https://outlook.live.com/mail/0/deeplink/compose?to=" + enc(d.to) + "&subject=" + enc(d.subject) + "&body=" + enc(d.body), "qc__alt", true));
    var copy = el("button", "qc__alt", "Copy details"); copy.type = "button";
    copy.addEventListener("click", function () {
      var text = "To: " + d.to + "\nSubject: " + d.subject + "\n\n" + d.body;
      var ok = function () { copy.textContent = "Copied"; setTimeout(function () { copy.textContent = "Copy details"; }, 2000); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, function () { copy.textContent = "Copy failed"; });
      else copy.textContent = "Copy failed";
    });
    row.appendChild(copy);
    box.appendChild(row);
    box.appendChild(el("p", "qc__consent", "This opens your email with the details filled in. Nothing is sent until you press Send there. The QenBel team replies by email with the confirmed price and timeline."));
    return box;
  }

  /* ---------- messages ---------- */

  function renderMessage(m) {
    var user = m.role === "user";
    var row = el("div", "m " + (user ? "m--user" : "m--bot") + (m.error ? " m--error" : ""));
    if (!user) { var host = el("span", "orb"); host.setAttribute("aria-hidden", "true"); row.appendChild(host); orb(host, "idle"); }
    var body = el("div", "m__body");
    m.content.split(/\n{2,}/).forEach(function (p) { if (p.trim()) body.appendChild(el("p", null, p.trim())); });
    if (m.quote) body.appendChild(renderQuote(m));
    row.appendChild(body);
    thread.appendChild(row);
    return row;
  }
  function scrollDown() { scroller.scrollTop = scroller.scrollHeight; }

  // What the model sees: the text, plus a one-line note of any estimate card it showed.
  function historyFor(n) {
    var cur = current();
    return cur.messages.filter(function (m) { return !m.error; }).slice(-n).map(function (m) {
      var o = { role: m.role, content: m.content };
      if (m.role === "assistant") { if (m.sig) o.sig = m.sig; if (m.quote && m.quote.input) o.quote = m.quote.input; }
      return o;
    });
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
    renderList();
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
    [STORE_KEY, OLD_KEY, EMAIL_KEY, CURRENCY_KEY].forEach(function (k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } });
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
        if (r.data.quote) msg.quote = r.data.quote;
        cur.messages.push(msg); save(); renderMessage(msg);
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

  function start() { renderAll(); autosize(); sync(); box.focus(); setupCurrency(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
