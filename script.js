/* ================================================================
   SIGNAL CHECK — script.js
   ================================================================ */

'use strict';

// ── Constants ────────────────────────────────────────────────────

const SCENARIOS = {
  'new-idea':        { label: 'New Idea',          description: 'You have a concept and want to know if it holds' },
  'existing-product':{ label: 'Existing Product',  description: 'You\'re already building but something feels off' },
  'pivot':           { label: 'Pivot',             description: 'You\'re reconsidering direction and need a pressure test' },
  'pre-launch':      { label: 'Pre-Launch',        description: 'You\'re close to shipping and want to stress-test the bet' },
};

const BRIEF_SECTIONS = [
  { key: 'core_bet',          label: 'The Core Bet' },
  { key: 'killer_assumption', label: 'The Killer Assumption' },
  { key: 'test_hypothesis',   label: 'The Test Hypothesis' },
  { key: 'gap_signal',        label: 'The Gap Signal' },
];

// Scenario → card image mapping
const SCENARIO_IMAGES = {
  'new-idea':         'assets/SignalCard_NewIdea.png',
  'existing-product': 'assets/SignalCard_ExistingProduct.png',
  'pivot':            'assets/SignalCard_Pivot.png',
  'pre-launch':       'assets/SignalCard_Pre-Launch.png',
};

// Hardcoded opening messages — no wasted API call on load
const OPENING_MESSAGES = {
  'new-idea':
    "You've got a concept in your head. Before you do anything else, let's pressure-test the core bet. What's the product, and who's it for — one or two sentences, don't overthink it.",
  'existing-product':
    "Something feels off and you're trying to name it. That's usually a signal worth following. What's the product, and who's it for — in one or two sentences?",
  'pivot':
    "Reconsidering direction means you've already learned something important — you're not starting from zero. What's the product as it stands today, and who's it currently for?",
  'pre-launch':
    "Close to shipping is exactly the right time for a pressure test — not because things are likely wrong, but because you need to know they're not. What's the product, and who's it for?",
};

// Alias map — handles variation in section keys the AI might return
const SECTION_KEY_ALIASES = {
  'core_bet':           'core_bet',
  'core-bet':           'core_bet',
  'core':               'core_bet',
  'bet':                'core_bet',
  'the_core_bet':       'core_bet',
  'killer_assumption':  'killer_assumption',
  'killer-assumption':  'killer_assumption',
  'killer':             'killer_assumption',
  'assumption':         'killer_assumption',
  'the_killer_assumption': 'killer_assumption',
  'test_hypothesis':    'test_hypothesis',
  'test-hypothesis':    'test_hypothesis',
  'hypothesis':         'test_hypothesis',
  'test':               'test_hypothesis',
  'the_test_hypothesis':'test_hypothesis',
  'gap_signal':         'gap_signal',
  'gap-signal':         'gap_signal',
  'gap':                'gap_signal',
  'signal':             'gap_signal',
  'the_gap_signal':     'gap_signal',
};

const MAX_TURNS          = 15;
const WARN_TURN          = 13;
const SESSION_KEY        = 'signalCheckSession';
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

// ── State ────────────────────────────────────────────────────────

let state = {
  scenario:     null,  // { key, label, description }
  messages:     [],    // full conversation history for API
  briefData:    {      // section key → content string (null = not yet filled)
    core_bet:          null,
    killer_assumption: null,
    test_hypothesis:   null,
    gap_signal:        null,
  },
  turnCount:    0,
  sessionStart: null,
  isComplete:   false,
  confirmShown: false,
};

// ── DOM cache ────────────────────────────────────────────────────

let dom = {};

// ── Initialise ───────────────────────────────────────────────────

function init() {
  dom.chatPanel        = document.getElementById('chat-panel');
  dom.chatMessages     = document.getElementById('chat-messages');
  dom.userInput        = document.getElementById('user-input');
  dom.sendBtn          = document.getElementById('send-btn');
  dom.progressFill     = document.getElementById('progress-fill');
  dom.progressLabel    = document.getElementById('progress-label');
  dom.scenarioTag       = document.getElementById('scenario-tag');
  dom.scenarioHeaderImg = document.getElementById('scenario-header-img');
  dom.briefContent      = document.getElementById('brief-content');
  dom.briefDocMeta     = document.getElementById('brief-doc-meta');
  dom.completionFooter  = document.getElementById('completion-footer');
  dom.emailBriefBtn     = document.getElementById('email-brief-btn');
  dom.downloadBtn       = document.getElementById('download-btn');
  dom.shareBtn          = document.getElementById('share-btn');
  dom.newBriefBtn       = document.getElementById('new-brief-btn');
  dom.sharedViewBanner  = document.getElementById('shared-view-banner');
  dom.emailModal        = document.getElementById('email-modal');
  dom.emailModalClose   = document.getElementById('email-modal-close');
  dom.emailInput        = document.getElementById('email-input');
  dom.emailSubmitBtn    = document.getElementById('email-submit-btn');
  dom.emailOptin        = document.getElementById('email-optin');
  dom.emailError        = document.getElementById('email-error');
  dom.emailFormState    = document.getElementById('email-form-state');
  dom.emailConfirmState = document.getElementById('email-confirm-state');

  const params = new URLSearchParams(window.location.search);

  // ── Shared view mode ─────────────────────────────────────────
  const encodedBrief = params.get('brief');
  if (encodedBrief) {
    loadSharedView(encodedBrief);
    return;
  }

  // ── Active session ────────────────────────────────────────────
  const scenarioKey = params.get('scenario') || '';
  const labelParam  = params.get('label') ? decodeURIComponent(params.get('label'))    : null;
  const descParam   = params.get('desc')  ? decodeURIComponent(params.get('desc'))     : null;

  // Try to resume a saved session for this scenario
  const saved = loadSession();
  if (saved && saved.scenario && saved.scenario.key === scenarioKey) {
    restoreSession(saved);
    return;
  }

  // New session
  if (scenarioKey && SCENARIOS[scenarioKey]) {
    state.scenario = {
      key:         scenarioKey,
      label:       labelParam || SCENARIOS[scenarioKey].label,
      description: descParam  || SCENARIOS[scenarioKey].description,
    };
  } else {
    window.location.href = 'index.html';
    return;
  }

  state.sessionStart = Date.now();

  setupUI();
  bindEvents();
  updateBriefMeta();

  // Show hardcoded opening message
  const openingMsg = OPENING_MESSAGES[scenarioKey] || "What's the product, and who's it for?";
  addMessage('ai', openingMsg);
  state.messages.push({ role: 'assistant', content: openingMsg });

  saveSession();

  // Dev helpers (localhost only)
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    console.log(
      '%c[Signal Check — Dev Mode]%c\n' +
      '  cheat()       — fill all 4 sections instantly\n' +
      '  clearBrief()  — wipe session and reset to start',
      'color: #2C5F5F; font-weight: bold;',
      'color: inherit;'
    );
  }
}

function setupUI() {
  if (state.scenario) {
    if (dom.scenarioTag) dom.scenarioTag.textContent = state.scenario.label;
    if (dom.scenarioHeaderImg) {
      var imgSrc = SCENARIO_IMAGES[state.scenario.key];
      if (imgSrc) {
        dom.scenarioHeaderImg.src = imgSrc;
        dom.scenarioHeaderImg.removeAttribute('hidden');
      }
    }
  }
  updateTurnCounter();
}

function bindEvents() {
  if (dom.sendBtn)   dom.sendBtn.addEventListener('click', handleSend);
  if (dom.userInput) {
    dom.userInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    });
    dom.userInput.addEventListener('input', function() {
      this.style.height = 'auto';
      this.style.height = Math.min(this.scrollHeight, 120) + 'px';
    });
  }
  if (dom.emailBriefBtn)   dom.emailBriefBtn.addEventListener('click', openEmailModal);
  if (dom.downloadBtn)     dom.downloadBtn.addEventListener('click', downloadPDF);
  if (dom.shareBtn)        dom.shareBtn.addEventListener('click', copyShareableLink);
  if (dom.newBriefBtn)     dom.newBriefBtn.addEventListener('click', startNewBrief);
  if (dom.emailModalClose) dom.emailModalClose.addEventListener('click', closeEmailModal);
  if (dom.emailSubmitBtn)  dom.emailSubmitBtn.addEventListener('click', handleEmailSubmit);
  if (dom.emailModal) {
    dom.emailModal.addEventListener('click', function(e) {
      if (e.target === dom.emailModal) closeEmailModal();
    });
  }
  if (dom.emailInput) {
    dom.emailInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') { e.preventDefault(); handleEmailSubmit(); }
    });
  }
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && dom.emailModal && !dom.emailModal.hidden) closeEmailModal();
  });
}

function updateBriefMeta() {
  if (dom.briefDocMeta && state.sessionStart) {
    dom.briefDocMeta.textContent =
      'Generated by Signal Check · ' +
      new Date(state.sessionStart).toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric'
      });
  }
}


// ── Send & receive messages ───────────────────────────────────────

async function handleSend() {
  const input = dom.userInput;
  if (!input) return;

  // Sanitize input — strip potential injection vectors
  const raw  = input.value.trim();
  const text = raw.replace(/</g, '').replace(/>/g, '').replace(/`/g, '');
  if (!text) return;

  input.value = '';
  input.style.height = '';

  state.turnCount++;
  updateTurnCounter();

  // Enforce session limit
  if (state.turnCount >= MAX_TURNS && !state.isComplete) {
    addMessage('user', text);
    state.messages.push({ role: 'user', content: text });
    disableInput("We've reached the session limit. Your Signal Brief is ready to download or share.");
    return;
  }

  addMessage('user', text);
  state.messages.push({ role: 'user', content: text });

  const typingEl = showTyping();

  var emptyBriefSections = BRIEF_SECTIONS
    .filter(function(s) { return state.briefData[s.key] === null; })
    .map(function(s) { return s.key; });

  // Anthropic API requires messages to start with role 'user' — strip any
  // leading assistant messages (the hardcoded opening message lives here)
  var apiMessages = state.messages.slice();
  while (apiMessages.length && apiMessages[0].role === 'assistant') {
    apiMessages.shift();
  }

  try {
    const resp = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages:           apiMessages,
        scenario:           state.scenario,
        turnCount:          state.turnCount,
        emptyBriefSections: emptyBriefSections,
      }),
    });

    const data = await resp.json();
    removeTyping(typingEl);

    if (!resp.ok || (data.error && !data.message)) {
      addMessage('ai', "I hit a snag on my end. Please try sending your message again.");
      return;
    }

    addMessage('ai', data.message);
    state.messages.push({ role: 'assistant', content: data.message });

    // Handle briefUpdates — fill sections progressively
    if (data.briefUpdates && typeof data.briefUpdates === 'object') {
      var sectionKeys = Object.keys(data.briefUpdates);
      var delay = 0;
      sectionKeys.forEach(function(key) {
        var content = data.briefUpdates[key];
        if (!content || typeof content !== 'string' || content.trim() === '') return;
        var normKey = normalizeSectionKey(key);
        if (normKey && state.briefData[normKey] === null) {
          (function(k, c, d) {
            setTimeout(function() { updateBriefSection(k, c); }, d);
          })(normKey, content, delay);
          delay += 320;
        }
      });
    }

    // Show confirmation card (once only, after Q3 is complete)
    if (data.confirmationReady && data.confirmationText && !state.confirmShown) {
      state.confirmShown = true;
      var sectionCount = data.briefUpdates ? Object.keys(data.briefUpdates).length : 0;
      setTimeout(function() {
        showConfirmationCard(data.confirmationText);
      }, Math.max(400, sectionCount * 320 + 200));
    }

    // Brief complete
    if (data.complete && !state.isComplete) {
      state.isComplete = true;
      var fillCount = data.briefUpdates ? Object.keys(data.briefUpdates).length : 0;
      setTimeout(showCompletionFooter, fillCount * 320 + 500);
    }

    saveSession();

  } catch (err) {
    removeTyping(typingEl);
    addMessage('ai', "I hit a snag on my end. Please try sending your message again.");
  }
}


// ── Chat rendering ────────────────────────────────────────────────

function addMessage(role, content) {
  const el = document.createElement('div');
  el.className = 'msg msg-' + role;
  el.textContent = content;
  dom.chatMessages.appendChild(el);
  scrollMessages();
  return el;
}

function showTyping() {
  const el = document.createElement('div');
  el.className = 'typing-indicator';
  el.innerHTML = '<span></span><span></span><span></span>';
  dom.chatMessages.appendChild(el);
  scrollMessages();
  return el;
}

function removeTyping(el) {
  if (el && el.parentNode) el.parentNode.removeChild(el);
}

function scrollMessages() {
  if (dom.chatMessages) {
    dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight;
  }
}


// ── Confirmation card ─────────────────────────────────────────────

function showConfirmationCard(text) {
  const el = document.createElement('div');
  el.className = 'msg-confirmation';
  el.innerHTML =
    '<div class="confirmation-label">Here\'s what I heard</div>' +
    '<p class="confirmation-text">' + escapeHTML(text) + '</p>' +
    '<div class="confirmation-actions" id="conf-actions">' +
      '<button class="btn-primary btn-sm" id="confirm-yes-btn">Looks right</button>' +
      '<button class="btn-secondary btn-sm" id="confirm-adjust-btn">Let me adjust</button>' +
    '</div>';

  dom.chatMessages.appendChild(el);
  scrollMessages();

  el.querySelector('#confirm-yes-btn').addEventListener('click', function() {
    var actions = el.querySelector('#conf-actions');
    if (actions) actions.innerHTML = '<span class="confirmed-note">✓ Confirmed</span>';
    if (dom.userInput) dom.userInput.value = "That captures it well. Please complete my Signal Brief.";
    handleSend();
  });

  el.querySelector('#confirm-adjust-btn').addEventListener('click', function() {
    var actions = el.querySelector('#conf-actions');
    if (actions) actions.innerHTML = '<span class="confirmed-note">Continuing…</span>';
    if (dom.userInput) dom.userInput.focus();
  });
}


// ── Brief section updates ─────────────────────────────────────────

function updateBriefSection(key, content) {
  var sectionEl = document.getElementById('section-' + key);
  var contentEl = document.getElementById('content-' + key);
  if (!sectionEl || !contentEl) return;

  sectionEl.className = sectionEl.className
    .replace('state-empty', '')
    .replace('state-done', '')
    .trim();
  sectionEl.classList.add('state-populating');

  setTimeout(function() {
    contentEl.innerHTML = renderMarkdown(escapeHTML(content)).replace(/\n/g, '<br>');
    contentEl.removeAttribute('data-placeholder');
    contentEl.contentEditable = 'true';

    sectionEl.classList.remove('state-populating');
    sectionEl.classList.add('state-done', 'state-just-filled');
    setTimeout(function() {
      sectionEl.classList.remove('state-just-filled');
    }, 500);

    state.briefData[key] = content;
    saveSession();
  }, 350);
}

// Restore a section immediately — no animation (used on session restore / shared view)
function restoreBriefSection(key, content) {
  var sectionEl = document.getElementById('section-' + key);
  var contentEl = document.getElementById('content-' + key);
  if (!sectionEl || !contentEl || !content) return;

  contentEl.innerHTML = renderMarkdown(escapeHTML(content)).replace(/\n/g, '<br>');
  contentEl.removeAttribute('data-placeholder');
  contentEl.contentEditable = 'true';

  sectionEl.classList.remove('state-empty', 'state-populating', 'state-just-filled');
  sectionEl.classList.add('state-done');
}


// ── Content formatting ─────────────────────────────────────────────

function renderMarkdown(text) {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>');
}

function escapeHTML(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}


// ── Completion ────────────────────────────────────────────────────

function showCompletionFooter() {
  if (dom.completionFooter) {
    dom.completionFooter.removeAttribute('hidden');
    if (dom.briefContent) {
      dom.briefContent.scrollTop = dom.briefContent.scrollHeight;
    }
  }
}


// ── Turn counter ───────────────────────────────────────────────────

function updateTurnCounter() {
  var pct = Math.min((state.turnCount / MAX_TURNS) * 100, 100);
  if (dom.progressFill) dom.progressFill.style.width = pct + '%';

  if (dom.progressLabel) {
    if (state.turnCount === 0) {
      dom.progressLabel.textContent = 'Ready';
      dom.progressLabel.classList.remove('warn');
    } else {
      dom.progressLabel.textContent = 'Turn ' + state.turnCount + ' of ' + MAX_TURNS;
    }
    if (state.turnCount >= WARN_TURN) {
      dom.progressLabel.classList.add('warn');
    }
  }
}

function disableInput(message) {
  if (dom.userInput) {
    dom.userInput.disabled = true;
    dom.userInput.placeholder = '';
  }
  if (dom.sendBtn) dom.sendBtn.disabled = true;
  if (message) addMessage('system', message);
}


// ── Email modal ────────────────────────────────────────────────────

function openEmailModal() {
  if (!dom.emailModal) return;

  // Reset to default state each time it opens
  if (dom.emailFormState)    dom.emailFormState.removeAttribute('hidden');
  if (dom.emailConfirmState) dom.emailConfirmState.setAttribute('hidden', '');
  if (dom.emailInput)        dom.emailInput.value = '';
  if (dom.emailInput)        dom.emailInput.classList.remove('error');
  if (dom.emailError)        dom.emailError.setAttribute('hidden', '');
  if (dom.emailOptin)        dom.emailOptin.checked = false;
  if (dom.emailSubmitBtn)    dom.emailSubmitBtn.disabled = false;
  if (dom.emailSubmitBtn)    dom.emailSubmitBtn.textContent = 'Send to my inbox';

  dom.emailModal.removeAttribute('hidden');
  document.body.classList.add('modal-open');
  if (dom.emailInput) dom.emailInput.focus();
}

function closeEmailModal() {
  if (!dom.emailModal) return;
  dom.emailModal.setAttribute('hidden', '');
  document.body.classList.remove('modal-open');
}

async function handleEmailSubmit() {
  if (!dom.emailInput || !dom.emailSubmitBtn) return;

  var email = dom.emailInput.value.trim();

  // Client-side validation
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    dom.emailInput.classList.add('error');
    if (dom.emailError) {
      dom.emailError.textContent = 'Please enter a valid email address.';
      dom.emailError.removeAttribute('hidden');
    }
    dom.emailInput.focus();
    return;
  }

  dom.emailInput.classList.remove('error');
  if (dom.emailError) dom.emailError.setAttribute('hidden', '');
  dom.emailSubmitBtn.disabled = true;
  dom.emailSubmitBtn.textContent = 'Sending…';

  var sessionDate = state.sessionStart
    ? new Date(state.sessionStart).toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric'
      })
    : new Date().toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric'
      });

  try {
    var resp = await fetch('/api/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email:       email,
        briefData:   state.briefData,
        scenario:    state.scenario,
        sessionDate: sessionDate,
        optIn:       dom.emailOptin ? dom.emailOptin.checked : false,
      }),
    });

    var data = await resp.json();

    if (!resp.ok || data.error) {
      dom.emailSubmitBtn.disabled = false;
      dom.emailSubmitBtn.textContent = 'Send to my inbox';
      if (dom.emailError) {
        dom.emailError.textContent = data.error || 'Something went wrong. Please try again.';
        dom.emailError.removeAttribute('hidden');
      }
      return;
    }

    // Success — show confirmation
    if (dom.emailFormState)    dom.emailFormState.setAttribute('hidden', '');
    if (dom.emailConfirmState) dom.emailConfirmState.removeAttribute('hidden');

  } catch (err) {
    dom.emailSubmitBtn.disabled = false;
    dom.emailSubmitBtn.textContent = 'Send to my inbox';
    if (dom.emailError) {
      dom.emailError.textContent = 'Something went wrong. Please try again.';
      dom.emailError.removeAttribute('hidden');
    }
  }
}


// ── Download / Share ───────────────────────────────────────────────

function downloadPDF() {
  window.print();
}

function copyShareableLink() {
  var payload = {
    scenario:  state.scenario,
    briefData: state.briefData,
    date: state.sessionStart
      ? new Date(state.sessionStart).toLocaleDateString('en-US', {
          year: 'numeric', month: 'long', day: 'numeric'
        })
      : new Date().toLocaleDateString('en-US', {
          year: 'numeric', month: 'long', day: 'numeric'
        }),
  };

  try {
    var encoded = btoa(encodeURIComponent(JSON.stringify(payload)));
    var url = window.location.origin + window.location.pathname + '?brief=' + encoded;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function() {
        flashButton(dom.shareBtn, 'Copied!');
      });
    } else {
      var ta = document.createElement('textarea');
      ta.value = url;
      ta.style.position = 'fixed';
      ta.style.opacity  = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      flashButton(dom.shareBtn, 'Copied!');
    }
  } catch (e) {
    console.error('Share link error:', e);
  }
}

function flashButton(btn, label) {
  if (!btn) return;
  var orig = btn.textContent;
  btn.textContent = label;
  setTimeout(function() { btn.textContent = orig; }, 2200);
}

function startNewBrief() {
  clearSession();
  window.location.href = 'index.html';
}


// ── Shared view (read-only) ────────────────────────────────────────

function loadSharedView(encoded) {
  document.body.classList.add('shared-view');

  if (dom.sharedViewBanner) dom.sharedViewBanner.removeAttribute('hidden');

  try {
    var payload = JSON.parse(decodeURIComponent(atob(encoded)));

    if (payload.scenario) {
      if (dom.scenarioTag) dom.scenarioTag.textContent = payload.scenario.label || '';
    }

    if (dom.briefDocMeta && payload.date) {
      dom.briefDocMeta.textContent = 'Generated by Signal Check · ' + payload.date;
    }

    if (payload.briefData) {
      Object.keys(payload.briefData).forEach(function(key) {
        var content = payload.briefData[key];
        if (content) restoreBriefSection(key, content);
      });
    }

    if (dom.completionFooter) {
      dom.completionFooter.removeAttribute('hidden');
      var ctaArea = dom.completionFooter.querySelector('.completion-ctas');
      if (ctaArea) {
        ctaArea.innerHTML =
          '<a href="index.html" class="btn-primary">Start your own Signal Check</a>';
      }
      var constellationBlock = dom.completionFooter.querySelector('.constellation-block');
      if (constellationBlock) constellationBlock.style.display = 'none';
      var feedbackPrompt = dom.completionFooter.querySelector('.feedback-prompt');
      if (feedbackPrompt) feedbackPrompt.style.display = 'none';
    }

    document.querySelectorAll('.section-content').forEach(function(el) {
      el.contentEditable = 'false';
    });

  } catch (e) {
    console.error('Failed to load shared view:', e);
    if (dom.briefContent) {
      var errMsg = document.createElement('p');
      errMsg.style.cssText = 'color: var(--muted); font-style: italic; padding: 16px; font-size: 0.9rem;';
      errMsg.textContent = 'This link may be invalid or expired. Start a new Signal Check below.';
      dom.briefContent.appendChild(errMsg);
    }
    if (dom.completionFooter) {
      dom.completionFooter.removeAttribute('hidden');
      var ctaArea = dom.completionFooter.querySelector('.completion-ctas');
      if (ctaArea) {
        ctaArea.innerHTML = '<a href="index.html" class="btn-primary">Start a Signal Check</a>';
      }
    }
  }
}


// ── Session storage ────────────────────────────────────────────────

function saveSession() {
  try {
    var toSave = {
      scenario:     state.scenario,
      messages:     state.messages,
      briefData:    state.briefData,
      turnCount:    state.turnCount,
      sessionStart: state.sessionStart,
      isComplete:   state.isComplete,
      confirmShown: state.confirmShown,
      savedAt:      Date.now(),
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(toSave));
  } catch (e) {
    // localStorage unavailable — silent fail
  }
}

function loadSession() {
  try {
    var raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    var saved = JSON.parse(raw);
    if (Date.now() - saved.savedAt > SESSION_TIMEOUT_MS) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return saved;
  } catch (e) {
    return null;
  }
}

function restoreSession(saved) {
  state.scenario     = saved.scenario     || state.scenario;
  state.messages     = saved.messages     || [];
  state.briefData    = saved.briefData    || state.briefData;
  state.turnCount    = saved.turnCount    || 0;
  state.sessionStart = saved.sessionStart || Date.now();
  state.isComplete   = saved.isComplete   || false;
  state.confirmShown = saved.confirmShown || false;

  setupUI();
  bindEvents();
  updateBriefMeta();

  // Replay messages
  state.messages.forEach(function(msg) {
    var role = msg.role === 'assistant' ? 'ai' : 'user';
    addMessage(role, msg.content);
  });

  // Restore brief sections (no animation)
  BRIEF_SECTIONS.forEach(function(s) {
    if (state.briefData[s.key]) {
      restoreBriefSection(s.key, state.briefData[s.key]);
    }
  });

  if (state.isComplete) showCompletionFooter();

  updateTurnCounter();
}

function clearSession() {
  try { localStorage.removeItem(SESSION_KEY); } catch (e) {}
}


// ── Section key normaliser ─────────────────────────────────────────

function normalizeSectionKey(key) {
  if (!key || typeof key !== 'string') return null;
  var k = key.toLowerCase().trim().replace(/[\s\-]/g, '_');
  return SECTION_KEY_ALIASES[k] ||
    (Object.prototype.hasOwnProperty.call(state.briefData, k) ? k : null);
}


// ── Boot ──────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', init);


// ================================================================
// DEV ONLY — console cheat to bypass the conversation and jump
// straight to a complete Signal Brief.
//
// Usage (browser console on localhost):
//   cheat()       — fills all 4 sections + shows completion footer
//   clearBrief()  — wipes session and resets to start
// ================================================================
window.cheat = function() {

  if (!state.scenario) {
    state.scenario = { key: 'new-idea', label: 'New Idea', description: 'You have a concept and want to know if it holds' };
    state.sessionStart = Date.now();
    setupUI();
    bindEvents();
    updateBriefMeta();
  }

  if (dom.chatMessages) dom.chatMessages.innerHTML = '';

  addMessage('system', '⚡ Cheat mode — Signal Brief pre-filled for testing');

  var sampleData = {
    core_bet:
      'Freelance designers will pay for a tool that auto-generates client-ready proposals from a brief — because time spent on proposals is time not spent on design.',

    killer_assumption:
      'Designers experience proposal creation as painful enough to pay to eliminate it. This is the bet that has to be true because the entire willingness-to-pay argument collapses if proposal writing is seen as "part of the job" rather than friction worth removing.',

    test_hypothesis:
      'We\'ll know this is working if 40% of users who complete a proposal in the tool return to create a second one within 14 days. If that repeat behaviour exists within 30 days of launch, the core pain is real and the tool is delivering on it.',

    gap_signal:
      'What we didn\'t resolve: you know what you\'re building but not who changes their current routine to use it. Are these designers mid-career freelancers managing multiple clients, or early-stage practitioners just learning to pitch? That distinction shapes pricing, onboarding, and the copy on every screen. It\'s also the conversation that takes 20 minutes to crack — and usually unlocks three others.',
  };

  var keys = Object.keys(sampleData);
  keys.forEach(function(key, i) {
    setTimeout(function() {
      updateBriefSection(key, sampleData[key]);
    }, i * 250);
  });

  setTimeout(function() {
    state.turnCount = 7;
    state.isComplete = true;
    state.confirmShown = true;
    updateTurnCounter();
    showCompletionFooter();
    saveSession();
    console.log('✅ Signal Brief complete. Test CTAs, PDF, and share link.');
  }, keys.length * 250 + 600);

  console.log('Filling ' + keys.length + ' sections… watch the brief panel →');
};

window.clearBrief = function() {
  clearSession();
  window.location.reload();
};
