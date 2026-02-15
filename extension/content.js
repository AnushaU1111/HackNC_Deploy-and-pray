// ====== CONFIG ======
const CONCESSIVE_AGREEMENT_TERMS = [
  "you're right",
  "you are right",
  "absolutely",
  "i agree",
  "exactly",
  "totally correct",
  "that is true",
  "that's true",
  "correct",
  "yes",
  "yeah",
  "yep"
];

const CONCESSIVE_AGREEMENT_PATTERNS = [
  /\byes+\b/gi,
  /\byeah+\b/gi,
  /\byep+\b/gi,
  /\bdefinitely\b/gi,
  /\bfor sure\b/gi
];

const EMOTIONAL_ANCHOR_TERMS = [
  "you're smart",
  "unique perspective",
  "i'm glad",
  "i'm excited",
  "excited to",
  "happy to",
  "love that",
  "super fun",
  "fun way",
  "always remember",
  "do you want me to",
  "if you want, i can",
  "only you",
  "you're insightful"
];

const OVERENTHUSIASM_TERMS = [
  "yess",
  "absolutely right",
  "you are absolutely right",
  "amazing",
  "awesome",
  "epic",
  "magical",
  "science is awesome",
  "activated"
];

const PII_TERMS = [
  "email",
  "phone",
  "ssn",
  "social security number",
  "address",
  "date of birth",
  "dob",
  "passport",
  "credit card",
  "account number"
];

const NATURAL_AGREEMENT_TERMS = [
  "that makes sense",
  "i can see why",
  "you raise a good point",
  "that's a fair point",
  "that’s a fair point",
  "i see what you mean",
  "you're not wrong",
  "you’re not wrong",
  "valid point",
  "fair observation",
  "i get what you mean",
  "that seems reasonable",
  "it’s understandable",
  "it's understandable"
];


const PII_PATTERNS = {
  email: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
  phone: /\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})\b/g,
  ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
  creditCard: /\b(?:\d[ -]*?){13,19}\b/g,
  accountLike: /\baccount\s*(?:number|no\.?|#)?\s*[:#-]?\s*\d{6,17}\b/gi
};

const PII_CONTEXTUAL_NUMBER_PATTERNS = [
  /\b(?:ssn|social security(?: number)?|passport|account(?: number)?|credit card|card number|phone|dob|date of birth)\b[^\n]{0,24}\b\d{4,19}\b/gi
];

// ====== UTIL ======
function countMatches(text, phrases) {
  let count = 0;
  if (!text) return 0;
  // escape regex special chars in phrases
  const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&");
  phrases.forEach(p => {
    try {
      const safe = escapeRegex(p);
      const regex = new RegExp("\\b" + safe + "\\b", "gi");
      const matches = text.match(regex);
      if (matches) count += matches.length;
    } catch (e) {
      // ignore malformed phrase
    }
  });
  return count;
}

function countPatternMatches(text, pattern) {
  const matches = text.match(pattern);
  return matches ? matches.length : 0;
}

function countPatternMatchesFromList(text, patterns) {
  let total = 0;
  patterns.forEach(pattern => {
    total += countPatternMatches(text, pattern);
  });
  return total;
}

function computePiiRisk(userText, assistantText) {
  const assistantTermHits = countMatches(assistantText, PII_TERMS);
  const userTermHits = countMatches(userText, PII_TERMS);

  let assistantPatternHits = 0;
  let userPatternHits = 0;
  Object.values(PII_PATTERNS).forEach(pattern => {
    assistantPatternHits += countPatternMatches(assistantText, pattern);
    userPatternHits += countPatternMatches(userText, pattern);
  });

  const userContextualNumberHits = countPatternMatchesFromList(userText, PII_CONTEXTUAL_NUMBER_PATTERNS);

  const assistantPromptScore = Math.min(assistantTermHits * 12 + assistantPatternHits * 28, 70);
  const userExposureScore = Math.min(
    userTermHits * 10 + userPatternHits * 30 + userContextualNumberHits * 35,
    90
  );
  const pivotBonus = assistantTermHits > 0 && (userPatternHits > 0 || userContextualNumberHits > 0 || userTermHits > 0) ? 20 : 0;

  return Math.min(assistantPromptScore + userExposureScore + pivotBonus, 100);
}

// ====== SCORING ENGINE ======
function computeSycophancyScore(userText, assistantText) {
  try {
    userText = String(userText || "").toLowerCase();
    assistantText = String(assistantText || "").toLowerCase();
  } catch (e) {
    // fallback to empty strings
    userText = "";
    assistantText = "";
  }

  // Marker 1: Concessive Agreement
  const concessiveTermHits =
  countMatches(assistantText, CONCESSIVE_AGREEMENT_TERMS) +
  countMatches(assistantText, NATURAL_AGREEMENT_TERMS);

  const concessivePatternHits = countPatternMatchesFromList(assistantText, CONCESSIVE_AGREEMENT_PATTERNS);
  const concessiveHits = concessiveTermHits + concessivePatternHits;
  const startsWithHardAgreement =
  CONCESSIVE_AGREEMENT_TERMS.some(term => assistantText.trim().startsWith(term)) ||
  NATURAL_AGREEMENT_TERMS.some(term => assistantText.trim().startsWith(term)) ||
  /^\s*(yes+|yeah+|yep+|absolutely|exactly|definitely)\b/i.test(assistantText);

  const concessiveScore = Math.min(
    concessiveHits * 40 + (startsWithHardAgreement ? 40 : 0),
    100
  );

  // Marker 2: Emotional Anchoring + Overenthusiastic Tone
  const emotionalHits = countMatches(assistantText, EMOTIONAL_ANCHOR_TERMS);
  const overenthusiasmHits = countMatches(assistantText, OVERENTHUSIASM_TERMS);
  const excitementBursts = (assistantText.match(/!{2,}/g) || []).length;
  const emotionalScore = Math.min(
    emotionalHits * 18 + overenthusiasmHits * 18 + excitementBursts * 25,
    100
  );
  const validationIntensityBonus =
  emotionalScore > 40 && concessiveScore > 30 ? 30 : 0;
  // Marker 3: PII Pivot
  let piiScore = 0;
  try {
    piiScore = computePiiRisk(userText, assistantText);
  } catch (e) {
    piiScore = 0;
  }

  // Aggregate final Sycophancy Score
  const comboBonus = concessiveHits > 0 && emotionalScore >= 40 ? 30 : 0;
  const finalScore = Math.min(
    0.75 * concessiveScore +
    0.75 * emotionalScore +
    0.45 * piiScore +
    comboBonus +
    validationIntensityBonus,
    100
  );

  // Debug logging to help trace score fluctuations
  try {
    console.debug("[Sycophancy Debug] breakdown:", {
      concessiveHits,
      concessiveScore,
      emotionalHits,
      overenthusiasmHits,
      excitementBursts,
      emotionalScore,
      piiScore,
      comboBonus,
      validationIntensityBonus,
      finalScore
    });
  } catch (e) {
    // ignore logging errors
  }

  return {
    sycophancy: finalScore.toFixed(1),
    concessive: concessiveScore,
    emotional: emotionalScore,
    pii: piiScore
  };
}

// ====== DOM EXTRACTION ======
function getMessages() {
  const nodes = document.querySelectorAll("[data-message-author-role]");
  if (nodes.length < 2) return null;

  const user = nodes[nodes.length - 2].innerText;
  const assistant = nodes[nodes.length - 1].innerText;

  return { user, assistant };
}

// ====== UI PANEL ======
function escapeHtml(unsafe) {
  return String(unsafe)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function generatePromptFromSuggestion(suggestion) {
  const raw = String(suggestion || "").trim();
  if (!raw) return "";

  const cleanupPromptText = (value) => {
    if (!value) return "";
    let cleaned = String(value).trim();
    cleaned = cleaned.replace(/^\s*(?:optimized\s*question|user\s*prompt|prompt)\s*:\s*/i, "");
    cleaned = cleaned.replace(/\s*(?:assistant\s*answer|rewritten\s*reply|improved\s*response)\s*:[\s\S]*$/i, "");
    cleaned = cleaned.replace(/\s{2,}/g, " ").trim();
    return cleaned;
  };

  const extractJsonObject = (text) => {
    try {
      return JSON.parse(text);
    } catch (_) {
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) return null;
      try {
        return JSON.parse(match[0]);
      } catch (_) {
        return null;
      }
    }
  };

  const maybeJson = extractJsonObject(raw);
  if (maybeJson && typeof maybeJson === "object") {
    if (typeof maybeJson.user_prompt === "string" && maybeJson.user_prompt.trim()) {
      return cleanupPromptText(maybeJson.user_prompt);
    }
    if (typeof maybeJson.optimized_question === "string" && maybeJson.optimized_question.trim()) {
      return cleanupPromptText(maybeJson.optimized_question);
    }
    if (typeof maybeJson.prompt === "string" && maybeJson.prompt.trim()) {
      return cleanupPromptText(maybeJson.prompt);
    }
  }

  const mixedQuestion = raw.match(/user\s*question\s*:\s*([\s\S]*?)(?:assistant\s*answer\s*:|$)/i);
  if (mixedQuestion && mixedQuestion[1] && mixedQuestion[1].trim()) {
    return cleanupPromptText(mixedQuestion[1]);
  }

  const labeledLine = raw.match(/(?:^|\n)\s*(?:user\s*prompt|optimized\s*question|question)\s*:\s*([^\n]+)/i);
  if (labeledLine && labeledLine[1] && labeledLine[1].trim()) {
    return cleanupPromptText(labeledLine[1]);
  }

  if (/^you are a senior prompt engineer/i.test(raw) || /respond in json only/i.test(raw)) {
    return "Please provide a neutral, factual answer to my previous question without flattery, emotional overstatement, or unnecessary agreement.";
  }

  const cleanedRaw = cleanupPromptText(raw);
  if (/^(yes|no|absolutely|honestly|reflective|reflectiveness|you are|it'?s)\b/i.test(cleanedRaw)) {
    return "Answer my previous question in a neutral, evidence-based tone. Do not use flattery or excessive agreement. Acknowledge uncertainty where needed and keep the response concise and factual.";
  }

  return cleanedRaw;
}

function insertPromptToInput(text) {
  const promptText = String(text || "");
  const isVisible = (el) => {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    if (!style || style.visibility === 'hidden' || style.display === 'none') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };

  // Try common selectors: textarea, input[type=text], contenteditable divs
  const trySetValue = (el, value) => {
    try {
      if (!el) return false;
      if (!isVisible(el)) return false;

      if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
        if (el.disabled || el.readOnly) return false;
        el.focus();
        el.value = value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
      if (el.isContentEditable) {
        el.focus();

        // set text content with selection-safe replace
        if (typeof document.execCommand === 'function') {
          document.execCommand('selectAll', false, null);
          document.execCommand('insertText', false, value);
        } else {
          el.innerText = value;
        }

        // dispatch input and keyup to notify React-like frameworks
        el.dispatchEvent(new InputEvent('input', { bubbles: true, data: value, inputType: 'insertText' }));
        el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
    } catch (e) {
      console.warn('Insert helper error', e);
    }
    return false;
  };

  // Priority selectors (ChatGPT first)
  const selectors = [
    '#prompt-textarea',
    'textarea#prompt-textarea',
    'div#prompt-textarea[contenteditable="true"]',
    'div[contenteditable="true"][id="prompt-textarea"]',
    'div[role="textbox"][contenteditable="true"][id="prompt-textarea"]',
    'form textarea',
    'form div[role="textbox"][contenteditable="true"]',
    'textarea[placeholder]','textarea',
    'input[placeholder]','input[type=text]',
    'div[role="textbox"][contenteditable="true"]',
    'div[contenteditable="true"]'
  ];

  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el && trySetValue(el, promptText)) return true;
  }

  // Try to find a visible contenteditable inside forms
  const allContent = Array.from(document.querySelectorAll('div[contenteditable="true"]'));
  for (const el of allContent) {
    const style = window.getComputedStyle(el);
    if (style && style.visibility !== 'hidden' && style.display !== 'none') {
      if (trySetValue(el, promptText)) return true;
    }
  }

  console.warn('[Sycophancy] Could not find chat input to insert prompt');
  return false;
}

const PANEL_STORAGE_KEY = "sycophancy-panel-layout-v1";

function loadPanelLayout() {
  try {
    const raw = localStorage.getItem(PANEL_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;

    const isSafeCssValue = (value) => typeof value === "string" && /^-?\d+(?:\.\d+)?px$/.test(value);

    return {
      top: isSafeCssValue(parsed.top) ? parsed.top : "",
      left: isSafeCssValue(parsed.left) ? parsed.left : "",
      width: isSafeCssValue(parsed.width) ? parsed.width : "",
      height: isSafeCssValue(parsed.height) ? parsed.height : ""
    };
  } catch (e) {
    return null;
  }
}

function savePanelLayout(panel) {
  try {
    const layout = {
      top: panel.style.top || "",
      left: panel.style.left || "",
      width: panel.style.width || "",
      height: panel.style.height || ""
    };
    localStorage.setItem(PANEL_STORAGE_KEY, JSON.stringify(layout));
  } catch (e) {
    // ignore storage errors
  }
}

function enablePanelMove(panel) {
  if (panel.dataset.moveBound === "true") return;
  panel.dataset.moveBound = "true";

  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let startLeft = 0;
  let startTop = 0;

  const onPointerMove = (event) => {
    if (!isDragging) return;
    const nextLeft = startLeft + (event.clientX - startX);
    const nextTop = startTop + (event.clientY - startY);
    panel.style.left = `${Math.max(0, nextLeft)}px`;
    panel.style.top = `${Math.max(0, nextTop)}px`;
  };

  const onPointerUp = () => {
    if (!isDragging) return;
    isDragging = false;
    document.removeEventListener("pointermove", onPointerMove);
    document.removeEventListener("pointerup", onPointerUp);
    savePanelLayout(panel);
  };

  panel.addEventListener("pointerdown", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (!target.closest("#sycophancy-drag-handle")) return;

    const rect = panel.getBoundingClientRect();
    panel.style.bottom = "auto";
    panel.style.right = "auto";
    panel.style.left = `${rect.left}px`;
    panel.style.top = `${rect.top}px`;

    isDragging = true;
    startX = event.clientX;
    startY = event.clientY;
    startLeft = rect.left;
    startTop = rect.top;

    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
    event.preventDefault();
  });
}

function enablePanelResizePersistence(panel) {
  if (panel.dataset.resizeBound === "true") return;
  panel.dataset.resizeBound = "true";
  panel.addEventListener("pointerup", () => savePanelLayout(panel));
}

function ensurePanelInViewport(panel) {
  const minVisible = 80;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const rect = panel.getBoundingClientRect();

  let nextLeft = rect.left;
  let nextTop = rect.top;

  if (rect.right < minVisible) {
    nextLeft = 16 - rect.width;
  }
  if (rect.left > vw - minVisible) {
    nextLeft = vw - minVisible;
  }
  if (rect.bottom < minVisible) {
    nextTop = 16 - rect.height;
  }
  if (rect.top > vh - minVisible) {
    nextTop = vh - minVisible;
  }

  nextLeft = Math.max(0, Math.min(nextLeft, Math.max(0, vw - minVisible)));
  nextTop = Math.max(0, Math.min(nextTop, Math.max(0, vh - minVisible)));

  panel.style.left = `${nextLeft}px`;
  panel.style.top = `${nextTop}px`;
  panel.style.right = "auto";
  panel.style.bottom = "auto";

  const maxWidth = Math.max(240, vw - 24);
  const maxHeight = Math.max(140, vh - 24);
  if (rect.width > maxWidth) {
    panel.style.width = `${maxWidth}px`;
  }
  if (rect.height > maxHeight) {
    panel.style.height = `${maxHeight}px`;
  }
}

let currentTab = "shield";
let latestShieldResult = { sycophancy: 0, concessive: 0, emotional: 0, pii: 0 };
let latestFactResult = null;
let factCheckLoading = false;
let latestUserText = "";
let latestAssistantText = "";
let latestScores = { sycophancy: 0, concessive: 0, emotional: 0, pii: 0 };
const rejectedPromptsByPair = new Map();

function normalizePromptText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function injectPanel(result) {
  if (result) {
    latestShieldResult = result;
  }
  const activeResult = latestShieldResult;

  let panel = document.getElementById("sycophancy-panel");

  if (!panel) {
    panel = document.createElement("div");
    panel.id = "sycophancy-panel";

    panel.style.position = "fixed";
    panel.style.bottom = "20px";
    panel.style.right = "20px";
    panel.style.width = "280px";
    panel.style.minWidth = "240px";
    panel.style.minHeight = "140px";
    panel.style.maxWidth = "90vw";
    panel.style.maxHeight = "80vh";
    panel.style.resize = "both";
    panel.style.overflow = "auto";
    panel.style.padding = "15px";
    panel.style.background = "#111";
    panel.style.color = "#fff";
    panel.style.borderRadius = "12px";
    panel.style.boxShadow = "0 4px 15px rgba(0,0,0,0.4)";
    panel.style.zIndex = "9999";
    panel.style.fontSize = "14px";
    panel.style.fontFamily = "Arial, sans-serif";

    document.body.appendChild(panel);

    const savedLayout = loadPanelLayout();
    if (savedLayout) {
      if (savedLayout.width) panel.style.width = savedLayout.width;
      if (savedLayout.height) panel.style.height = savedLayout.height;
      if (savedLayout.left && savedLayout.top) {
        panel.style.left = savedLayout.left;
        panel.style.top = savedLayout.top;
        panel.style.right = "auto";
        panel.style.bottom = "auto";
      }
    }

    ensurePanelInViewport(panel);

    enablePanelMove(panel);
    enablePanelResizePersistence(panel);

    window.addEventListener("resize", () => {
      ensurePanelInViewport(panel);
      savePanelLayout(panel);
    });
  }

  // Color coding based on score
  let color = "#4CAF50"; // green
  if (activeResult.sycophancy >= 70) color = "#f44336"; // red
  else if (activeResult.sycophancy >= 40) color = "#FFC107"; // yellow

  const isHighPii = Number(activeResult.pii) > 70;
  const piiLineStyle = isHighPii ? 'color: #f44336; font-weight: 700;' : '';

  panel.style.border = `2px solid ${color}`;

  const shieldTabStyle = currentTab === "shield"
    ? "background:#2e7d32;color:#fff;border:0;"
    : "background:#2b2b2b;color:#ddd;border:1px solid #444;";
  const factTabStyle = currentTab === "fact"
    ? "background:#1565c0;color:#fff;border:0;"
    : "background:#2b2b2b;color:#ddd;border:1px solid #444;";

  const shieldContent = `
    Sycophancy Score: <b>${activeResult.sycophancy}</b><br>
    Concessive Agreement: <b>${activeResult.concessive}</b><br>
    Emotional Anchoring: <b>${activeResult.emotional}</b><br>
    <span style="${piiLineStyle}">PII Risk: <b>${activeResult.pii}</b></span>
    ${activeResult.betterPrompt ? `<br><br><strong>Suggested Prompt</strong><br><div id="sycophancy-better-prompt" style="white-space:pre-wrap;">${escapeHtml(generatePromptFromSuggestion(activeResult.betterPrompt))}</div><br><button id="sycophancy-accept-btn" style="margin-top:6px;padding:6px 8px;border-radius:6px;border:0;background:#2e7d32;color:#fff;cursor:pointer;margin-right:6px;">Accept</button><button id="sycophancy-deny-btn" style="margin-top:6px;padding:6px 8px;border-radius:6px;border:0;background:#9e9e9e;color:#fff;cursor:pointer;">Deny</button>` : ""}
  `;

  const factContent = factCheckLoading
    ? `<strong>Fact Checker</strong><br><br>Evaluating response accuracy...`
    : latestFactResult
      ? `<strong>Fact Checker</strong><br><br>
          Accuracy Score: <b>${latestFactResult.accuracy_score}</b><br>
          Verdict: <b>${escapeHtml(latestFactResult.verdict)}</b><br>
          Source: <b>${escapeHtml(latestFactResult.source || "unknown")}</b><br><br>
          <span>${escapeHtml(latestFactResult.explanation || "No explanation provided.")}</span>`
      : `<strong>Fact Checker</strong><br><br>No fact-check result yet.`;

  panel.innerHTML = `
    <div id="sycophancy-drag-handle" style="cursor:move; user-select:none; font-weight:700; margin-bottom:10px; border-bottom:1px solid rgba(255,255,255,0.15); padding-bottom:8px;">🛡 CogniShield</div>
    <div style="display:flex; gap:8px; margin-bottom:10px;">
      <button id="tab-shield" style="padding:6px 10px;border-radius:8px;cursor:pointer;${shieldTabStyle}">Shield</button>
      <button id="tab-fact" style="padding:6px 10px;border-radius:8px;cursor:pointer;${factTabStyle}">Fact Checker</button>
    </div>
    ${currentTab === "shield" ? shieldContent : factContent}
  `;

  const shieldTabButton = panel.querySelector('#tab-shield');
  const factTabButton = panel.querySelector('#tab-fact');

  if (shieldTabButton) {
    shieldTabButton.addEventListener('click', () => {
      currentTab = "shield";
      injectPanel();
    });
  }
  if (factTabButton) {
    factTabButton.addEventListener('click', () => {
      currentTab = "fact";
      injectPanel();
    });
  }

  // Attach accept/deny handlers
  const acceptBtn = panel.querySelector('#sycophancy-accept-btn');
  const denyBtn = panel.querySelector('#sycophancy-deny-btn');
  const promptEl = panel.querySelector('#sycophancy-better-prompt');

  if (acceptBtn && promptEl) {
    acceptBtn.addEventListener('click', () => {
      const promptText = promptEl.innerText || promptEl.textContent || '';
      // Try to insert the raw generated prompt into the chat input
      const inserted = insertPromptToInput(promptText);
      if (inserted) {
        acceptBtn.textContent = 'Inserted';
        setTimeout(() => (acceptBtn.textContent = 'Accept'), 1200);
      } else {
        acceptBtn.textContent = 'Failed';
        setTimeout(() => (acceptBtn.textContent = 'Accept'), 1200);
      }
    });
  }

  if (denyBtn) {
    denyBtn.addEventListener('click', () => {
      const currentPrompt = (promptEl?.innerText || promptEl?.textContent || '').trim();
      if (!currentPrompt || !latestUserText || !latestAssistantText || !activePairKey) {
        if (promptEl) promptEl.textContent = '';
        denyBtn.textContent = 'Dismissed';
        setTimeout(() => (denyBtn.textContent = 'Deny'), 800);
        return;
      }

      const currentRejected = rejectedPromptsByPair.get(activePairKey) || [];
      const normalizedRejected = new Set(currentRejected.map(normalizePromptText));
      const normalizedCurrent = normalizePromptText(currentPrompt);
      if (normalizedCurrent && !normalizedRejected.has(normalizedCurrent)) {
        currentRejected.push(currentPrompt);
        rejectedPromptsByPair.set(activePairKey, currentRejected.slice(-5));
      }

      denyBtn.disabled = true;
      denyBtn.textContent = 'Generating...';

      sendToBackend(
        latestUserText,
        latestAssistantText,
        latestScores,
        (backendData) => {
          denyBtn.disabled = false;
          denyBtn.textContent = 'Deny';

          const candidate = generatePromptFromSuggestion(backendData?.better_prompt || '').trim();
          const normalizedCandidate = normalizePromptText(candidate);
          const rejectedList = rejectedPromptsByPair.get(activePairKey) || [];
          const rejectedSet = new Set(rejectedList.map(normalizePromptText));

          if (!candidate || !normalizedCandidate || rejectedSet.has(normalizedCandidate)) {
            denyBtn.textContent = 'No Alternative';
            setTimeout(() => (denyBtn.textContent = 'Deny'), 1200);
            return;
          }

          injectPanel({
            ...latestShieldResult,
            betterPrompt: candidate
          });
        },
        {
          retry: true,
          rejectedPrompts: rejectedPromptsByPair.get(activePairKey) || []
        }
      );
    });
  }
}

function ensurePanelMounted() {
  const existing = document.getElementById("sycophancy-panel");
  if (!existing) {
    injectPanel();
  }
}

// ====== BACKEND INTEGRATION ======
function sendToBackend(userText, assistantText, scores, callback, options = {}) {
  // Send to backend via background script
  chrome.runtime.sendMessage(
    {
      type: "ANALYZE_TEXT",
      payload: {
        user: userText,
        ai: assistantText,
        scores: {
          sycophancy: Number(scores.sycophancy),
          concessive: Number(scores.concessive),
          emotional: Number(scores.emotional),
          pii: Number(scores.pii)
        },
        retry: Boolean(options.retry),
        rejected_prompts: Array.isArray(options.rejectedPrompts) ? options.rejectedPrompts : []
      }
    },
    (response) => {
      if (chrome.runtime.lastError) {
        console.log("Backend communication error:", chrome.runtime.lastError.message);
        return;
      }
      
      if (response && response.success) {
        console.log("Backend response:", response.data);
        if (callback) callback(response.data);
      } else if (response && response.error) {
        console.log("Backend error:", response.error);
      }
    }
  );
}

function sendFactCheckToBackend(userText, assistantText, callback) {
  chrome.runtime.sendMessage(
    {
      type: "FACT_CHECK",
      payload: {
        user: userText,
        ai: assistantText
      }
    },
    (response) => {
      if (chrome.runtime.lastError) {
        console.log("Fact-check communication error:", chrome.runtime.lastError.message);
        return;
      }

      if (response && response.success) {
        if (callback) callback(response.data);
      } else if (response && response.error) {
        console.log("Fact-check backend error:", response.error);
      }
    }
  );
}

// ====== OBSERVER FOR REAL-TIME UPDATES ======
const chatContainer = document.querySelector("main") || document.body;
let lastProcessedPair = "";
let activePairKey = "";
let pendingPairKey = "";
let pendingPairSince = 0;
let inFlightShieldKey = "";
let inFlightFactKey = "";

function isAssistantStillStreaming() {
  return Boolean(
    document.querySelector(".result-streaming") ||
    document.querySelector("[data-testid='conversation-turn-loading']") ||
    document.querySelector("[aria-label='Stop generating']")
  );
}

function processLatestConversation(force = false) {
  const msgs = getMessages();
  if (!msgs) return;

  if (!force && isAssistantStillStreaming()) return;

  const pairKey = `${msgs.user}\n---\n${msgs.assistant}`;

  if (!force) {
    if (pairKey !== pendingPairKey) {
      pendingPairKey = pairKey;
      pendingPairSince = Date.now();
      return;
    }

    if (Date.now() - pendingPairSince < 900) {
      return;
    }
  } else {
    pendingPairKey = pairKey;
    pendingPairSince = Date.now();
  }

  if (!force && pairKey === lastProcessedPair) return;
  lastProcessedPair = pairKey;
  activePairKey = pairKey;

  let result;
  try {
    result = computeSycophancyScore(msgs.user, msgs.assistant);
  } catch (e) {
    console.error('[Sycophancy] compute error:', e);
    result = { sycophancy: 0, concessive: 0, emotional: 0, pii: 0 };
  }

  injectPanel(result);
  latestUserText = msgs.user;
  latestAssistantText = msgs.assistant;
  latestScores = result;

  factCheckLoading = true;
  if (currentTab === "fact") injectPanel();

  try {
    if (inFlightShieldKey !== pairKey) {
      inFlightShieldKey = pairKey;

      sendToBackend(msgs.user, msgs.assistant, result, (backendData) => {
        if (inFlightShieldKey === pairKey) {
          inFlightShieldKey = "";
        }
        if (activePairKey !== pairKey) return;
        if (!backendData) return;
        if (backendData.better_prompt) {
          injectPanel({
            ...result,
            betterPrompt: backendData.better_prompt
          });
        }
      }, {
        retry: false,
        rejectedPrompts: rejectedPromptsByPair.get(pairKey) || []
      });
    }
  } catch (e) {
    console.error('[Sycophancy] sendToBackend error:', e);
  }

  try {
    if (inFlightFactKey !== pairKey) {
      inFlightFactKey = pairKey;

      sendFactCheckToBackend(msgs.user, msgs.assistant, (factData) => {
        if (inFlightFactKey === pairKey) {
          inFlightFactKey = "";
        }
        if (activePairKey !== pairKey) return;
        if (!factData) return;
        latestFactResult = factData;
        factCheckLoading = false;
        injectPanel();
      });
    }
  } catch (e) {
    factCheckLoading = false;
    console.error('[Sycophancy] factcheck error:', e);
  }
}

const observer = new MutationObserver(() => {
  try {
    processLatestConversation(false);
  } catch (e) {
    console.error('[Sycophancy] observer error:', e);
  }
});

observer.observe(chatContainer, { childList: true, subtree: true });

// ====== INITIAL PANEL ======
injectPanel({ sycophancy: 0, concessive: 0, emotional: 0, pii: 0 });
processLatestConversation(true);

// Keep panel alive across SPA rerenders/navigation refreshes
setInterval(ensurePanelMounted, 1500);
setInterval(() => {
  try {
    processLatestConversation(false);
  } catch (e) {
    console.error('[Sycophancy] polling error:', e);
  }
}, 2000);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    ensurePanelMounted();
    processLatestConversation(false);
  }
});
window.addEventListener("popstate", () => {
  ensurePanelMounted();
  processLatestConversation(false);
});
window.addEventListener("hashchange", () => {
  ensurePanelMounted();
  processLatestConversation(false);
});

// Expose helper for manual testing in the console
try {
  window.computeSycophancyScore = computeSycophancyScore;
  console.info('[Sycophancy] computeSycophancyScore exposed on window for testing');
} catch (e) {
  // ignore
}
