/* Runs before first paint. Shows the loading screen on a visitor's first load of each local day.
   Add ?loader to any URL to force it for testing. */
(function () {
  try {
    var d = new Date();
    var today = d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
    var forced = /[?&]loader(&|=|$)/.test(location.search);
    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    if (forced || localStorage.getItem("qenbel:day") !== today) {
      document.documentElement.classList.add("is-loading");
      if (!forced) localStorage.setItem("qenbel:day", today);
    }
  } catch (e) { /* storage blocked: skip the loader rather than show it on every visit */ }
})();
