/* WebMCP: lets an AI agent in the visitor's browser use three safe actions on this page.
   All three only return text. None sends anything, makes a network request or changes the page.
   The enquiry tool builds a draft that the visitor must send from their own email account.
   Where the browser has no WebMCP, this file does nothing. */
(function () {
  "use strict";

  var mc = window.navigator && window.navigator.modelContext;
  if (!mc || typeof mc.registerTool !== "function") return;

  var TEAM = "contact@qenbel.site";
  var NAMES = ["get_qenbel_overview", "list_qenbel_services", "prepare_enquiry_email"];

  // Kept in step with the services on this page and in the assistant. No prices: QenBel does not publish any.
  var SERVICES = [
    ["Application Health Check", "A review of an existing application: architecture, code quality, dependencies, configuration and risks, ending in a prioritised report and roadmap. The usual starting point."],
    ["Code Review and Quality", "Code review, refactoring, error handling, type safety and tests."],
    ["Security and Hardening", "Application security assessment and fixes, only on systems the client owns or has authorised in writing."],
    ["Performance Optimization", "Profiling and tuning of front end, back end, database and APIs, with before and after measurements."],
    ["Production Readiness", "Getting an application ready to launch: QA, environments, CI/CD, domain and SSL, backups, rollback plan and monitoring."],
    ["Continuous Engineering", "Ongoing monitoring, maintenance and security updates after launch."]
  ];

  function reply(text) { return { content: [{ type: "text", text: text }] }; }
  function clean(v, max) {
    return String(v == null ? "" : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, max);
  }
  function oneLine(v, max) { return clean(v, max).replace(/\s+/g, " "); }

  // Agent input can be influenced by a web page, so refuse anything that looks like a real secret.
  var SECRET = /-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:sk|pk|rk)[-_][A-Za-z0-9_-]{20,}|\bAKIA[0-9A-Z]{16}\b|\bghp_[A-Za-z0-9]{30,}|\b(?:password|passwd|secret|api[_ -]?key|token)\s*[:=]\s*\S{6,}/i;

  var tools = [
    {
      name: NAMES[0],
      description: "Returns a short description of QenBel, a small Indian software engineering company, what it works on, how it works with clients and how to contact it. Read only.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true },
      execute: function () {
        return reply([
          "QenBel is a small Indian software engineering company. It helps startups, small businesses and growing teams improve software they already have, whether built with AI coding tools, by developers, or both: review, security, quality, performance, deployment and ongoing engineering.",
          "How it works: the client emails a short description; the team replies by email; a written proposal follows after the team understands the project; work starts only with written authorisation. QenBel never changes a production system without a verified backup, testing and the client's release approval.",
          "QenBel works by email only (" + TEAM + "), gives no prices outside a written proposal, and agrees nothing until it confirms it in writing by email.",
          "Website: https://qenbel.site"
        ].join("\n\n"));
      }
    },
    {
      name: NAMES[1],
      description: "Lists QenBel's main services with a one line description of each. QenBel publishes no prices. Read only.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true },
      execute: function () {
        return reply(SERVICES.map(function (s) { return "- " + s[0] + ": " + s[1]; }).join("\n"));
      }
    },
    {
      name: NAMES[2],
      description: "Prepares a draft email to the QenBel team for the user. It does NOT send anything: show the draft to the user, who sends it from their own email account. Never include passwords, API keys, secrets, customer data or source code.",
      inputSchema: {
        type: "object",
        properties: {
          message: { type: "string", maxLength: 1500, description: "What the user needs: what the application is, how it was built, what worries them, any deadline. No secrets." },
          subject: { type: "string", maxLength: 100, description: "A short subject line." },
          name: { type: "string", maxLength: 80, description: "The user's name, if they want to give it." },
          company: { type: "string", maxLength: 80, description: "The user's company, if they want to give it." }
        },
        required: ["message"],
        additionalProperties: false
      },
      annotations: { readOnlyHint: true },
      execute: function (args) {
        args = args || {};
        var message = clean(args.message, 1500);
        if (!message) return reply("A message is needed. Ask the user what they would like to tell QenBel.");
        if (SECRET.test(message)) return reply("The message appears to contain a password, key or other secret. Remove it and try again: secrets must never be sent in a first email. The QenBel team will say how to share anything sensitive safely.");

        var subject = oneLine(args.subject, 100) || "Enquiry from an AI agent on behalf of a user";
        var rows = ["Hello QenBel team,", ""];
        if (oneLine(args.name, 80)) rows.push("Name: " + oneLine(args.name, 80));
        if (oneLine(args.company, 80)) rows.push("Company: " + oneLine(args.company, 80));
        rows.push("", message, "", "Thank you");
        var body = rows.join("\r\n");
        var link = "mailto:" + TEAM + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);

        return reply([
          "Draft prepared. Nothing has been sent. Show it to the user; they send it from their own email.",
          "To: " + TEAM,
          "Subject: " + subject,
          "",
          body.replace(/\r\n/g, "\n"),
          "",
          "Link that opens the draft in the user's email app: " + link
        ].join("\n"));
      }
    }
  ];

  var controller = typeof AbortController === "function" ? new AbortController() : null;
  var registered = [];
  tools.forEach(function (tool) {
    try {
      mc.registerTool(tool, controller ? { signal: controller.signal } : undefined);
      registered.push(tool.name);
    } catch (e) { /* this browser's WebMCP rejected the tool: skip it */ }
  });

  // Remove the tools when the page goes away.
  window.addEventListener("pagehide", function () {
    if (controller) controller.abort();
    if (typeof mc.unregisterTool === "function") {
      registered.forEach(function (n) { try { mc.unregisterTool(n); } catch (e) { /* already removed */ } });
    }
  }, { once: true });
})();
