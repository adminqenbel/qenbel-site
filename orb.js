/* The QenBel orb: a small canvas animation, no dependencies.
   QenBelOrb.make(hostElement, "thinking" | "idle") returns an orb whose .mode can be changed. */
(function () {
  "use strict";
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var orbs = [];
  var running = false;
  var last = 0;

  function Orb(canvas) {
    this.c = canvas; this.ctx = canvas.getContext("2d"); this.t = Math.random() * 10; this.mode = "idle";
    this.resize();
  }
  Orb.prototype.resize = function () {
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var s = this.c.clientWidth || 44;
    this.c.width = this.c.height = Math.round(s * dpr);
    this.size = this.c.width;
  };
  Orb.prototype.draw = function (dt) {
    var ctx = this.ctx, s = this.size, r = s / 2, thinking = this.mode === "thinking";
    this.t += dt * (thinking ? 2.8 : 0.7);
    var t = this.t, spread = thinking ? 0.46 : 0.28;
    ctx.clearRect(0, 0, s, s);
    ctx.save();
    ctx.beginPath(); ctx.arc(r, r, r * 0.92, 0, 6.2832); ctx.clip();
    ctx.fillStyle = "#0B2A6B"; ctx.fillRect(0, 0, s, s);
    ctx.globalCompositeOperation = "lighter";
    var blobs = [["80,140,255", 0.0], ["37,99,217", 2.1], ["190,220,255", 4.2], ["120,175,255", 5.3]];
    for (var i = 0; i < blobs.length; i++) {
      var ph = blobs[i][1];
      var x = r + Math.cos(t * (0.8 + i * 0.23) + ph) * r * spread;
      var y = r + Math.sin(t * (1.1 + i * 0.17) + ph * 1.3) * r * spread;
      var rad = r * (0.7 - i * 0.06) * (thinking ? 1.1 : 1);
      var g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, "rgba(" + blobs[i][0] + ",0.85)");
      g.addColorStop(1, "rgba(" + blobs[i][0] + ",0)");
      ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
    }
    ctx.restore();
    ctx.beginPath(); ctx.arc(r, r, r * 0.92, 0, 6.2832);
    ctx.lineWidth = Math.max(1.5, s * 0.04);
    ctx.strokeStyle = "rgba(200,225,255," + (thinking ? 1 : 0.8) + ")"; ctx.stroke();
  };

  function loop(now) {
    requestAnimationFrame(loop);
    var dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (document.hidden) return;
    for (var i = orbs.length - 1; i >= 0; i--) {
      var o = orbs[i];
      if (!o.c.isConnected) { orbs.splice(i, 1); continue; }
      if (o.c.offsetParent !== null) o.draw(dt);
    }
  }

  function startMarked() {
    var hosts = document.querySelectorAll("[data-orb]");
    for (var i = 0; i < hosts.length; i++) if (!hosts[i].firstChild) window.QenBelOrb.make(hosts[i]);
  }

  window.QenBelOrb = {
    make: function (host, mode) {
      var c = document.createElement("canvas");
      host.appendChild(c);
      var o = new Orb(c);
      if (mode) o.mode = mode;
      orbs.push(o);
      if (reduce) o.draw(0.5);
      else if (!running) { running = true; requestAnimationFrame(loop); }
      return o;
    },
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", startMarked);
  else startMarked();
})();
