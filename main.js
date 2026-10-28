(function () {
  "use strict";

  function wireCopy() {
    var btn = document.querySelector("[data-copy]");
    var status = document.querySelector("[data-copy-status]");
    if (!btn) return;
    var label = btn.textContent;
    btn.addEventListener("click", function () {
      var text = btn.getAttribute("data-copy");
      var done = function () {
        btn.textContent = "Copied";
        btn.setAttribute("data-copied", "");
        if (status) status.textContent = "Email address copied";
        setTimeout(function () {
          btn.textContent = label;
          btn.removeAttribute("data-copied");
          if (status) status.textContent = "";
        }, 2000);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, function () { window.location.href = "mailto:" + text; });
      } else {
        window.location.href = "mailto:" + text;
      }
    });
  }

  /* Loading screen: real readiness (fonts + page load) with a minimum run time so it reads as a moment. */
  function loader() {
    var el = document.getElementById("loader");
    if (!el) return;
    var root = document.documentElement;
    if (!root.classList.contains("is-loading")) { el.remove(); return; }

    var count = el.querySelector("[data-count]");
    var behind = document.querySelectorAll("header.nav, main");
    Array.prototype.forEach.call(behind, function (n) { n.setAttribute("inert", ""); });

    var MIN = 1900, start = performance.now(), ready = false, shown = 0;
    function markReady() { ready = true; }
    var fonts = document.fonts && document.fonts.ready ? document.fonts.ready : null;
    var loaded = new Promise(function (r) {
      if (document.readyState === "complete") r(); else window.addEventListener("load", r);
    });
    Promise.all([fonts, loaded]).then(markReady, markReady);
    setTimeout(markReady, 6000); /* never trap a visitor on a slow font request */

    function leave() {
      el.classList.add("is-leaving");
      setTimeout(function () {
        root.classList.remove("is-loading");
        Array.prototype.forEach.call(behind, function (n) { n.removeAttribute("inert"); });
      }, 350);
      setTimeout(function () { el.remove(); }, 1100);
    }

    function frame(now) {
      var t = Math.min(1, (now - start) / MIN);
      var target = (1 - Math.pow(1 - t, 3)) * 100;
      if (!ready) target = Math.min(target, 92);
      shown = Math.max(shown, target);
      el.style.setProperty("--p", shown.toFixed(1));
      count.textContent = Math.round(shown);
      if (shown >= 99.5 && ready) { count.textContent = 100; el.style.setProperty("--p", 100); leave(); return; }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  function init() {
    loader();
    var year = document.querySelector("[data-year]");
    if (year) year.textContent = new Date().getFullYear();
    wireCopy();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
