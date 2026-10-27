(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---- Reflection: clone each shore row into its lake, inert ---- */

  function mirrorAll() {
    var sources = document.querySelectorAll("[data-mirror-source]");
    Array.prototype.forEach.call(sources, function (source) {
      var scene = source.closest(".scene");
      var target = scene && scene.querySelector(".lake__mirror > .wrap");
      if (!target) return;
      var copy = source.cloneNode(true);
      copy.removeAttribute("data-mirror-source");
      Array.prototype.forEach.call(copy.querySelectorAll("[id]"), function (el) { el.removeAttribute("id"); });
      Array.prototype.forEach.call(copy.querySelectorAll("a, button"), function (el) { el.setAttribute("tabindex", "-1"); });
      target.replaceWith(copy);
      copy.parentNode.setAttribute("inert", "");
    });
  }

  /* ---- Glints: moon and beacon light broken up by the water ---- */

  function buildGlints(lake) {
    var cfg = [
      { cls: ".glints--moon", at: parseFloat(lake.getAttribute("data-moon")), rows: 16, max: 150, min: 14 },
      { cls: ".glints--beacon", at: parseFloat(lake.getAttribute("data-beacon")), rows: 9, max: 46, min: 8 }
    ];
    cfg.forEach(function (c) {
      var host = lake.querySelector(c.cls);
      if (!host || isNaN(c.at)) return;
      host.style.setProperty("--at", c.at + "%");
      var h = lake.clientHeight;
      for (var i = 0; i < c.rows; i++) {
        var t = i / c.rows;
        var bar = document.createElement("i");
        bar.style.left = c.at + "%";
        bar.style.top = (6 + t * 0.9 * h) + "px";
        bar.style.width = Math.round(c.min + (c.max - c.min) * Math.pow(t, 0.8) * (0.55 + Math.random() * 0.45)) + "px";
        bar.style.setProperty("--dur", (3.4 + Math.random() * 3.2).toFixed(2) + "s");
        bar.style.setProperty("--delay", (-Math.random() * 5).toFixed(2) + "s");
        host.appendChild(bar);
      }
    });
  }

  /* ---- Ripple: the water settles when the page loads, then keeps a slow shimmer ---- */

  var noise = document.getElementById("ripple-noise");
  var map = document.getElementById("ripple-map");
  var visible = 0;

  function ripple() {
    if (!noise || !map) return;
    var start = performance.now();
    var last = 0;
    function frame(now) {
      requestAnimationFrame(frame);
      if (!visible || now - last < 66) return; /* about 15 fps keeps the filter cheap */
      last = now;
      var t = (now - start) / 1000;
      var settle = Math.max(0, 1 - t / 2.6);            /* 1 -> 0 over the first 2.6s */
      var scale = 5 + 24 * settle * settle;
      map.setAttribute("scale", scale.toFixed(1));
      var fy = 0.03 + 0.006 * Math.sin(t * 0.7) + 0.04 * settle;
      noise.setAttribute("baseFrequency", "0.004 " + fy.toFixed(4));
    }
    requestAnimationFrame(frame);
  }

  function watchVisibility() {
    var lakes = document.querySelectorAll("[data-lake]");
    if (!("IntersectionObserver" in window)) { visible = 1; return; }
    var seen = new Set();
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { e.isIntersecting ? seen.add(e.target) : seen.delete(e.target); });
      visible = seen.size;
    });
    Array.prototype.forEach.call(lakes, function (l) { io.observe(l); });
  }

  /* ---- Copy address ---- */

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
        mirrorAll();
        setTimeout(function () {
          btn.textContent = label;
          btn.removeAttribute("data-copied");
          if (status) status.textContent = "";
          mirrorAll();
        }, 2000);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, function () { window.location.href = "mailto:" + text; });
      } else {
        window.location.href = "mailto:" + text;
      }
    });
  }

  function init() {
    var year = document.querySelector("[data-year]");
    if (year) year.textContent = new Date().getFullYear();

    mirrorAll();
    wireCopy();
    Array.prototype.forEach.call(document.querySelectorAll("[data-lake]"), buildGlints);

    if (reduceMotion) {
      if (map) map.setAttribute("scale", "5");
    } else {
      watchVisibility();
      ripple();
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
