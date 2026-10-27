# qenbel-site

Static landing page for [qenbel.site](https://qenbel.site). No build step.

- `index.html`, `styles.css`, `main.js`: the page
- `vercel.json`: security headers and clean URLs
- Contact is email only: admin.qenbel@gmail.com

Preview locally: `python -m http.server 4173`, then open http://127.0.0.1:4173

Deploy: import this repo in Vercel (Framework preset: Other, no build command, output directory `.`), then add `qenbel.site` under Project > Domains.
