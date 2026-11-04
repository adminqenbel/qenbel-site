# Gmail automation for qenbel.site mail

Runs inside the Gmail account that receives your forwarded mail. The website and its servers are not involved, and no mail password or API key is stored anywhere.

Mail path: `support@ / info@ / admin@ / contact@qenbel.site` -> ImprovMX -> Gmail -> this script -> replies leave from `contact@qenbel.site` through Gmail's "Send mail as" (SMTP2GO).

## What it does

Every 5 minutes, for new unread mail in the inbox:

| Step | Detail |
| --- | --- |
| Label by address | `QenBel/support`, `QenBel/contact`, `QenBel/info`, `QenBel/admin`, or `QenBel/other` |
| Flag | `QenBel/security` (subject "Security report"), `QenBel/privacy` (subject "Privacy request"), `QenBel/urgent` (subject has `[Urgent]`). These are also marked important, and urgent is starred. |
| Acknowledge | One automatic reply with a reference number such as `QB-20261104-K7QM`, only for a NEW conversation written to support@, contact@ or info@. Three wordings: general, security, privacy. |

The support page on the website writes these subjects, so its requests are sorted and acknowledged without any extra code.

It never replies to: no-reply or bounce senders, mailing lists, auto-replies, your own addresses, a second message in a conversation, the same sender twice in 24 hours, or more than 50 senders a day.

## Before you start

1. In Gmail: Settings > Accounts > "Send mail as" must list `contact@qenbel.site` (you have this).
2. Check your DNS mail records in each provider's dashboard. They must allow every service that sends or receives for `qenbel.site`: SPF listing ImprovMX and SMTP2GO, DKIM for SMTP2GO, and a DMARC record. If they are wrong, acknowledgements land in spam. Your providers show the exact values.

## Install (about 10 minutes)

1. Sign in to the Gmail account that receives the mail, then open https://script.google.com and choose **New project**.
2. Replace the default code with the contents of `Code.gs`. Name the project "QenBel mailbox".
3. Select the function `setup` and press **Run**. Google asks you to authorise. It says the app is unverified because it is your own script: choose Advanced, then continue. `setup` checks the send-as address, creates the labels and installs the 5 minute trigger.
4. **Dry run first.** `DRY_RUN` is `true`, so nothing is sent or labelled yet. From another email account, send a test to `support@qenbel.site`. Wait for the mail to arrive, then select `processInbox`, press **Run**, and open **Executions** to read the log. Each line says what it would do.
5. When the log looks right, change `DRY_RUN: true` to `DRY_RUN: false` and save. The next run sends real acknowledgements. Test again with another account and check you receive the reply from `contact@qenbel.site`.

## Stop it

Run the function `uninstall`. Or delete the project at script.google.com.

## Canned replies

See `../templates.md`. These are normal Gmail Templates that you send by hand.

## Limits to know

- A free Gmail account can send about 100 emails a day through scripts. The script stops at 50 acknowledgements a day.
- It reads subject lines, addresses and a few headers only. It never follows instructions found in a message body.
- Anyone can forge a sender address, so an acknowledgement can reach a person who did not write. The limits above reduce this, and the acknowledgement contains nothing private.
- Run `node --test automation/gmail/Code.test.js` from the repository root after any change to `Code.gs`.
