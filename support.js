/* QenBel support page.
   Builds an email from the form. It never sends anything: the visitor sends it from their own email account,
   so this page stores and transmits nothing. */
(function () {
  "use strict";

  var TEAM = "contact@qenbel.site";
  var MAX_BODY = 1800; /* keeps the link short enough for every email app */

  var TYPES = {
    general: { label: "General question", subject: "Support: general question", hint: "Anything about QenBel, our services or how we work." },
    project: { label: "Starting a project or an assessment", subject: "Support: new project or assessment", hint: "Say what the application is, how it was built and what worries you." },
    existing: { label: "Help with delivered work", subject: "Support: delivered work", hint: "Say which project or agreement this relates to and what is not working." },
    security: { label: "Security report", subject: "Security report", hint: "Describe what you found in general terms. If the team needs technical detail it will say how to share it safely." },
    privacy: { label: "Privacy request", subject: "Privacy request", hint: "Say what you would like us to do with your personal data, for example see it, correct it or delete it." }
  };

  var form = document.querySelector("[data-form]");
  if (!form) return;
  var f = form.elements;
  var out = form.querySelector("[data-out]"), btns = form.querySelector("[data-btns]"), preview = form.querySelector("[data-preview]");
  var need = form.querySelector("[data-need]"), hint = form.querySelector("[data-hint]"), count = form.querySelector("[data-count]");

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text; /* textContent only: what the visitor types is never parsed as HTML */
    return n;
  }
  function enc(s) { return encodeURIComponent(s); }
  function clean(s) { return String(s || "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim(); }
  function line(s) { return clean(s).replace(/\s+/g, " "); }

  function compose() {
    var t = TYPES[f.type.value] || TYPES.general;
    var summary = line(f.summary.value), details = clean(f.details.value);
    if (!summary || !details) return null;
    var subject = (f.urgent.checked ? "[Urgent] " : "") + t.subject + ": " + summary;
    var rows = ["Hello QenBel team,", "", "Request type: " + t.label];
    if (f.urgent.checked) rows.push("Marked urgent: yes");
    if (line(f.name.value)) rows.push("Name: " + line(f.name.value));
    if (line(f.company.value)) rows.push("Company: " + line(f.company.value));
    if (line(f.project.value)) rows.push("Application or project: " + line(f.project.value));
    rows.push("", "Details:", details, "", "Thank you");
    var body = rows.join("\r\n");
    if (body.length > MAX_BODY) body = body.slice(0, MAX_BODY - 3) + "...";
    return { to: TEAM, subject: subject.slice(0, 160), body: body };
  }

  function link(label, href, cls, external) {
    var a = el("a", cls, label); a.href = href;
    if (external) { a.target = "_blank"; a.rel = "noopener noreferrer"; }
    return a;
  }

  function render() {
    var t = TYPES[f.type.value] || TYPES.general;
    hint.textContent = t.hint;
    count.textContent = String(f.details.value.length);

    var d = compose();
    out.hidden = !d; need.hidden = !!d;
    btns.textContent = "";
    if (!d) { preview.textContent = ""; return; }

    btns.appendChild(link("Open in Gmail", "https://mail.google.com/mail/?view=cm&fs=1&to=" + enc(d.to) + "&su=" + enc(d.subject) + "&body=" + enc(d.body), "mb mb--main", true));
    btns.appendChild(link("Email app", "mailto:" + d.to + "?subject=" + enc(d.subject) + "&body=" + enc(d.body), "mb", false));
    btns.appendChild(link("Outlook", "https://outlook.live.com/mail/0/deeplink/compose?to=" + enc(d.to) + "&subject=" + enc(d.subject) + "&body=" + enc(d.body), "mb", true));

    var copy = el("button", "mb", "Copy details"); copy.type = "button";
    var text = "To: " + d.to + "\nSubject: " + d.subject + "\n\n" + d.body.replace(/\r\n/g, "\n");
    copy.addEventListener("click", function () {
      var ok = function () { copy.textContent = "Copied"; setTimeout(function () { copy.textContent = "Copy details"; }, 2000); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, function () { copy.textContent = "Copy failed"; });
      else copy.textContent = "Copy failed";
    });
    btns.appendChild(copy);

    preview.textContent = text;
  }

  form.addEventListener("input", render);
  form.addEventListener("change", render);
  form.addEventListener("submit", function (e) { e.preventDefault(); }); /* nothing is ever submitted anywhere */
  render();
})();
