/* Where the assistant backend lives. Local preview talks to your machine; the live site talks to Render.
   After deploying the backend, set the live URL below (the Render service URL, or api.qenbel.site). */
window.QENBEL_API =
  location.hostname === "localhost" || location.hostname === "127.0.0.1"
    ? "http://127.0.0.1:8787"
    : "https://qenbel-api.onrender.com";
