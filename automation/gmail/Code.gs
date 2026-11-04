/**
 * QenBel mailbox automation. Google Apps Script that runs inside the Gmail account that receives
 * mail for qenbel.site (ImprovMX forwards support@, info@, admin@ and contact@ to that Gmail).
 *
 * What it does, every 5 minutes, to NEW unread mail in the inbox:
 *   1. Labels each conversation by the address it was sent to (QenBel/support, QenBel/contact, ...).
 *   2. Flags security reports, privacy requests and anything marked [Urgent].
 *   3. Sends one automatic acknowledgement, from contact@qenbel.site, to people who write to
 *      support@, contact@ or info@ in a NEW conversation.
 *
 * Safety rules built in:
 *   - DRY_RUN is true until you set it to false: it only logs what it would do.
 *   - At most one acknowledgement per conversation, per sender per 24 hours, and MAX_ACKS_PER_DAY in total.
 *   - Never replies to automatic mail (no-reply senders, mailing lists, bounces, auto-replies) or to our own addresses.
 *   - Marks a conversation as handled BEFORE sending, so a crash can never send twice.
 *   - Reads subject lines and addresses only. It never acts on instructions found in a message body.
 *
 * Setup: see README.md in this folder. Nothing in this file is secret.
 */

var CONFIG = {
  DRY_RUN: true,                       // set to false only after you have checked the log

  SEND_AS: 'contact@qenbel.site',      // must already be a "Send mail as" address in this Gmail account
  FROM_NAME: 'QenBel',
  DOMAIN: 'qenbel.site',
  ALIAS_NAMES: ['support', 'contact', 'info', 'admin'],
  ACK_ALIASES: ['support', 'contact', 'info'],   // writing to admin@ gets no automatic reply

  SEARCH: 'in:inbox is:unread newer_than:2d -label:qenbel-processed',
  MAX_THREADS_PER_RUN: 20,
  MAX_ACKS_PER_DAY: 50,                // Gmail limits how many emails a script may send each day
  ACK_PER_SENDER_HOURS: 24,

  PROCESSED_LABEL: 'qenbel-processed',
  LABEL_PREFIX: 'QenBel/'
};

/* ------------------------------------------------------------------ */
/* Pure helpers. No Google services are used here, so they can be tested.  */
/* ------------------------------------------------------------------ */

function parseAddresses(text) {
  var found = String(text || '').toLowerCase().match(/[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}/g);
  return found ? found : [];
}

function firstAddress(text) {
  var all = parseAddresses(text);
  return all.length ? all[0] : '';
}

// Which of our addresses were written to (To and Cc). Returns names such as ['support'].
function findAliases(toText, ccText, cfg) {
  var names = [];
  var all = parseAddresses(String(toText || '') + ',' + String(ccText || ''));
  for (var i = 0; i < cfg.ALIAS_NAMES.length; i++) {
    var addr = cfg.ALIAS_NAMES[i] + '@' + cfg.DOMAIN;
    if (all.indexOf(addr) !== -1) names.push(cfg.ALIAS_NAMES[i]);
  }
  return names;
}

// The kind of message, from the SUBJECT only. The website's security and privacy links write these subjects.
function classify(subject) {
  var s = String(subject || '');
  var kind = 'general';
  if (/^\s*(\[urgent\]\s*)?security report/i.test(s) || /vulnerabilit/i.test(s)) kind = 'security';
  else if (/^\s*(\[urgent\]\s*)?privacy request/i.test(s)) kind = 'privacy';
  return { kind: kind, urgent: /\[urgent\]/i.test(s) };
}

// Returns a reason when a message must not get an automatic reply, or '' when it may.
// headers: { autoSubmitted, precedence, listId, autoResponse }  (all strings, may be empty)
function skipReason(fromAddr, headers, cfg) {
  var from = String(fromAddr || '').toLowerCase();
  var h = headers || {};
  if (!from) return 'no sender address';
  if (from === cfg.SEND_AS.toLowerCase() || from.slice(-(cfg.DOMAIN.length + 1)) === '@' + cfg.DOMAIN) return 'our own address';
  if (/^(no-?reply|do-?not-?reply|donotreply|mailer-daemon|postmaster|bounces?|notifications?|alerts?|daemon)([+._-].*)?@/.test(from)) return 'automatic sender';
  if (h.autoSubmitted && String(h.autoSubmitted).toLowerCase() !== 'no') return 'auto-submitted';
  if (/^(bulk|list|junk|auto_reply)$/i.test(String(h.precedence || '').trim())) return 'bulk or list mail';
  if (h.listId) return 'mailing list';
  if (h.autoResponse) return 'auto-response suppressed';
  return '';
}

// state: { day: 'YYYY-MM-DD', count: n, senders: { address: epochMs } }. Mutates it and returns true
// when one more acknowledgement may be sent to this sender now.
function takeAck(state, sender, nowMs, cfg) {
  var day = new Date(nowMs).toISOString().slice(0, 10);
  if (state.day !== day) { state.day = day; state.count = 0; }
  state.senders = state.senders || {};
  var windowMs = cfg.ACK_PER_SENDER_HOURS * 3600 * 1000;
  for (var k in state.senders) { if (nowMs - state.senders[k] > windowMs) delete state.senders[k]; }
  if (state.count >= cfg.MAX_ACKS_PER_DAY) return false;
  if (state.senders[sender]) return false;
  state.count += 1;
  state.senders[sender] = nowMs;
  return true;
}

var REF_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function makeRef(nowMs, rand) {
  var d = new Date(nowMs).toISOString().slice(0, 10).replace(/-/g, '');
  var tail = '';
  for (var i = 0; i < 4; i++) tail += REF_ALPHABET.charAt(Math.floor(rand() * REF_ALPHABET.length));
  return 'QB-' + d + '-' + tail;
}

function buildAck(kind, ref) {
  var open = 'Hello,\n\n';
  var close = '\n\nThis is an automatic message. You can reply to it and the team will see your reply.\n\nQenBel\nhttps://qenbel.site';
  var safe = '\n\nPlease do not send passwords, API keys, secrets, customer data or source code by email. If we need anything like that, we will tell you how to share it safely.';
  var agreed = '\n\nNothing is agreed until the QenBel team confirms it in writing by email.';

  if (kind === 'security') {
    return open + 'Thank you for your security report. We have received it (reference ' + ref + ').\n\nThe QenBel team will read it and reply by email. Until we reply, please do not share the details with anyone else. Please quote the reference if you write again about this.' + safe + close;
  }
  if (kind === 'privacy') {
    return open + 'We have received your privacy request (reference ' + ref + ').\n\nWe may need to confirm that the request really comes from you before we act on it. We aim to reply within 7 days. You can read how we handle personal data in our Privacy Policy: https://qenbel.site/privacy\n\nPlease quote the reference if you write again about this.' + safe + close;
  }
  return open + 'Thank you for writing to QenBel. We have received your message (reference ' + ref + ').\n\nThe QenBel team will read it and reply by email. We work by email only, so there is no need to call or use chat. Please quote the reference if you write again about this.' + safe + agreed + close;
}

/* ------------------------------------------------------------------ */
/* Apps Script glue. Uses Gmail, Properties and triggers.               */
/* ------------------------------------------------------------------ */

function log_(msg) { console.log((CONFIG.DRY_RUN ? '[dry run] ' : '') + msg); }

function labelNamed_(name) {
  return GmailApp.getUserLabelByName(name) || GmailApp.createLabel(name);
}

function readHeader_(message, name) {
  try {
    if (typeof message.getHeader === 'function') return message.getHeader(name) || '';
  } catch (e) { /* fall through to the raw message */ }
  try {
    var raw = message.getRawContent();
    var head = raw.split(/\r?\n\r?\n/)[0].replace(/\r?\n[ \t]+/g, ' ');
    var m = head.match(new RegExp('^' + name + ':\\s*(.*)$', 'im'));
    return m ? m[1].trim() : '';
  } catch (e2) { return ''; }
}

function loadState_() {
  var raw = PropertiesService.getScriptProperties().getProperty('ackState');
  try { return raw ? JSON.parse(raw) : { day: '', count: 0, senders: {} }; } catch (e) { return { day: '', count: 0, senders: {} }; }
}
function saveState_(state) {
  PropertiesService.getScriptProperties().setProperty('ackState', JSON.stringify(state));
}

// The function the trigger runs.
function processInbox() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) { log_('another run is still going, skipping'); return; }
  try {
    var processed = labelNamed_(CONFIG.PROCESSED_LABEL);
    var state = loadState_();
    var threads = GmailApp.search(CONFIG.SEARCH, 0, CONFIG.MAX_THREADS_PER_RUN);
    log_('found ' + threads.length + ' new conversation(s)');

    for (var i = 0; i < threads.length; i++) {
      var thread = threads[i];
      var messages = thread.getMessages();
      var last = messages[messages.length - 1];
      var subject = thread.getFirstMessageSubject();
      var aliases = findAliases(last.getTo(), last.getCc(), CONFIG);
      var cls = classify(subject);
      var fromAddr = firstAddress(last.getFrom());

      // Mark as handled first: if anything below fails or times out, nothing is sent twice.
      if (!CONFIG.DRY_RUN) thread.addLabel(processed);

      var labels = [];
      for (var a = 0; a < aliases.length; a++) labels.push(CONFIG.LABEL_PREFIX + aliases[a]);
      if (!aliases.length) labels.push(CONFIG.LABEL_PREFIX + 'other');
      if (cls.kind !== 'general') labels.push(CONFIG.LABEL_PREFIX + cls.kind);
      if (cls.urgent) labels.push(CONFIG.LABEL_PREFIX + 'urgent');
      log_('"' + subject + '" from ' + fromAddr + ' to [' + aliases.join(',') + '] kind=' + cls.kind + (cls.urgent ? ' urgent' : '') + ' -> labels ' + labels.join(', '));

      if (!CONFIG.DRY_RUN) {
        for (var l = 0; l < labels.length; l++) thread.addLabel(labelNamed_(labels[l]));
        if (cls.urgent || cls.kind !== 'general') thread.markImportant();
        if (cls.urgent) GmailApp.starMessage(last);
      }

      // Acknowledge only brand new conversations that were written to an acknowledged address.
      var ackable = false;
      for (var k = 0; k < aliases.length; k++) if (CONFIG.ACK_ALIASES.indexOf(aliases[k]) !== -1) ackable = true;
      if (messages.length !== 1) { log_('  no acknowledgement: not a new conversation'); continue; }
      if (!ackable) { log_('  no acknowledgement: not sent to an acknowledged address'); continue; }

      var headers = {
        autoSubmitted: readHeader_(last, 'Auto-Submitted'),
        precedence: readHeader_(last, 'Precedence'),
        listId: readHeader_(last, 'List-Id'),
        autoResponse: readHeader_(last, 'X-Auto-Response-Suppress')
      };
      var why = skipReason(fromAddr, headers, CONFIG);
      if (why) { log_('  no acknowledgement: ' + why); continue; }

      if (CONFIG.DRY_RUN) { log_('  would acknowledge ' + fromAddr + ' (' + cls.kind + ')'); continue; }
      if (!takeAck(state, fromAddr, Date.now(), CONFIG)) { log_('  no acknowledgement: daily or per-sender limit reached'); continue; }
      saveState_(state);

      var ref = makeRef(Date.now(), Math.random);
      last.reply(buildAck(cls.kind, ref), { from: CONFIG.SEND_AS, name: CONFIG.FROM_NAME, replyTo: CONFIG.SEND_AS });
      thread.addLabel(labelNamed_(CONFIG.LABEL_PREFIX + 'acknowledged'));
      log_('  acknowledged ' + fromAddr + ' with reference ' + ref);
    }
  } finally {
    lock.releaseLock();
  }
}

// Run once by hand. Checks the send-as address, creates labels and installs the 5 minute trigger.
function setup() {
  var aliases = GmailApp.getAliases();
  if (aliases.indexOf(CONFIG.SEND_AS) === -1) {
    throw new Error(CONFIG.SEND_AS + ' is not a "Send mail as" address of this Gmail account. Found: ' + aliases.join(', '));
  }
  labelNamed_(CONFIG.PROCESSED_LABEL);
  var names = CONFIG.ALIAS_NAMES.concat(['other', 'security', 'privacy', 'urgent', 'acknowledged']);
  for (var i = 0; i < names.length; i++) labelNamed_(CONFIG.LABEL_PREFIX + names[i]);

  uninstall();
  ScriptApp.newTrigger('processInbox').timeBased().everyMinutes(5).create();
  console.log('Setup done. Labels created and a 5 minute trigger installed. DRY_RUN is ' + CONFIG.DRY_RUN + '.');
}

// Stops the automation.
function uninstall() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'processInbox') ScriptApp.deleteTrigger(triggers[i]);
  }
}
