/* ================================================================
   SIGNAL CHECK — api/email.js
   Sends the completed Signal Brief to the user via Resend.
   ================================================================ */

'use strict';

const { Resend } = require('resend');

const FROM_ADDRESS  = 'hello@northxnormal.com';
const BCC_ADDRESS   = 'hello@northxnormal.com';
const SUBJECT       = 'Your Signal Check brief from North by Normal';
const APP_SOURCE    = 'agent-signal';
const LOGO_URL      = 'https://fazfolio.com/images/NxN_logo.png';

// ── Basic email validation ──────────────────────────────────────
function isValidEmail(email) {
  return typeof email === 'string' &&
    /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

// ── Sanitise plain text for safe HTML inclusion ─────────────────
function escapeHTML(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Render **bold** and *italic* markdown in email body ─────────
function renderMarkdown(text) {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>');
}

function formatContent(raw) {
  if (!raw) return '<em style="color:#A8A29E;">Not filled in this session.</em>';
  return renderMarkdown(escapeHTML(raw)).replace(/\n/g, '<br>');
}

// ── Build the HTML email ────────────────────────────────────────
function buildEmailHTML({ briefData = {}, scenario, sessionDate }) {
  const scenarioLabel = (scenario && scenario.label) ? escapeHTML(scenario.label) : '';
  const dateStr       = sessionDate ? escapeHTML(sessionDate) : new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const sections = [
    { key: 'core_bet',          label: 'The Core Bet',          accentLeft: false },
    { key: 'killer_assumption', label: 'The Killer Assumption',  accentLeft: false },
    { key: 'test_hypothesis',   label: 'The Test Hypothesis',    accentLeft: false },
    { key: 'gap_signal',        label: 'The Gap Signal',         accentLeft: true  },
  ];

  const sectionHTML = sections.map(s => {
    const borderLeft = s.accentLeft
      ? 'border-left: 4px solid #E07A3F;'
      : 'border-left: 1px solid #DDD7CE;';
    return `
      <tr>
        <td style="padding: 8px 0;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="
                background: #ffffff;
                border: 1px solid #DDD7CE;
                ${borderLeft}
                border-radius: 6px;
                padding: 16px 18px;
              ">
                <p style="
                  font-family: 'Jost', Arial, Helvetica, sans-serif;
                  font-size: 10px;
                  font-weight: 700;
                  text-transform: uppercase;
                  letter-spacing: 0.1em;
                  color: #2C5F5F;
                  margin: 0 0 8px;
                  line-height: 1;
                ">${escapeHTML(s.label)}</p>
                <p style="
                  font-family: Georgia, 'Times New Roman', serif;
                  font-size: 14px;
                  color: #292524;
                  line-height: 1.7;
                  margin: 0;
                ">${formatContent(briefData[s.key])}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${SUBJECT}</title>
</head>
<body style="margin:0; padding:0; background:#FAF8F5; font-family: Georgia, serif;">

  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FAF8F5; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 580px;">

          <!-- Header -->
          <tr>
            <td style="padding-bottom: 24px; text-align: left;">
              <img src="${LOGO_URL}" alt="North by Normal" width="160" height="auto" style="display: block; height: auto; opacity: 1.0; max-width: 100%">
            </td>
          </tr>

          <!-- Brief card -->
          <tr>
            <td style="
              background: #F2EDE6;
              border: 1px solid #DDD7CE;
              border-radius: 8px;
              padding: 28px 28px 24px;
            ">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">

                <!-- Brief doc header -->
                <tr>
                  <td style="
                    padding-bottom: 16px;
                    border-bottom: 2px solid #2C5F5F;
                    margin-bottom: 16px;
                  ">
                    <p style="
                      font-family: 'Jost', Arial, Helvetica, sans-serif;
                      font-size: 22px;
                      font-weight: 300;
                      color: #2C5F5F;
                      margin: 0 0 4px;
                      line-height: 1.15;
                    ">Signal Brief${scenarioLabel ? ' &mdash; ' + scenarioLabel : ''}</p>
                    <p style="
                      font-family: 'Jost', Arial, Helvetica, sans-serif;
                      font-size: 11px;
                      color: #A8A29E;
                      margin: 0;
                    ">Generated by Signal Check &middot; ${dateStr}</p>
                  </td>
                </tr>

                <!-- Spacer -->
                <tr><td style="height: 16px;"></td></tr>

                <!-- Sections -->
                ${sectionHTML}

              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 0 0; text-align: center;">
              <p style="
                font-family: 'Jost', Arial, Helvetica, sans-serif;
                font-size: 13px;
                color: #A8A29E;
                margin: 0 0 6px;
              ">
                <a href="https://northxnormal.com" style="color: #2C5F5F; text-decoration: none;">northxnormal.com</a>
              </p>
              <p style="
                font-family: 'Jost', Arial, Helvetica, sans-serif;
                font-size: 12px;
                color: #C4BDB4;
                margin: 0;
              ">You're receiving this because you requested it at the end of your Signal Check session.</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>`;
}

// ── Handler ─────────────────────────────────────────────────────
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).json({});
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const { email, briefData, scenario, sessionDate } = req.body || {};

  // Validate email
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'A valid email address is required.' });
  }

  // Guard: API key must be present
  if (!process.env.RESEND_API_KEY) {
    console.error('RESEND_API_KEY is not set.');
    return res.status(500).json({ error: 'Email service is not configured.' });
  }

  const resend = new Resend(process.env.RESEND_API_KEY);

  const html = buildEmailHTML({ briefData, scenario, sessionDate });

  try {
    await resend.emails.send({
      from:    FROM_ADDRESS,
      to:      email.trim(),
      bcc:     BCC_ADDRESS,
      subject: SUBJECT,
      html,
      tags: [
        { name: 'app',    value: APP_SOURCE },
        { name: 'opt_in', value: req.body.optIn ? 'true' : 'false' },
      ],
    });

    return res.status(200).json({ success: true });

  } catch (err) {
    console.error('Resend error:', err);
    return res.status(500).json({ error: 'Failed to send. Please try again.' });
  }
};
