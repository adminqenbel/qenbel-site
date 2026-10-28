/* Where the assistant backend lives. Local preview talks to your machine; the live site talks to Render
   through its custom domain. */
window.QENBEL_API =
  location.hostname === "localhost" || location.hostname === "127.0.0.1"
    ? "http://127.0.0.1:8787"
    : "https://api.qenbel.site";
