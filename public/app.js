const SESSION_ROUNDS = 5;
const REVEAL_COUNT_DURATION_MS = 1100;
const REVEAL_INFO_DELAY_MS = 260;
const REVEAL_LIST_DELAY_MS = 220;
const COUNT_SOUND_INTERVAL_MS = 50;
const SLIDER_SOUND_INTERVAL_MS = 18;
const SLIDER_SOUND_STEP_VALUE = 0.5;
const WHOLE_GUESS_MIN = 0;
const WHOLE_GUESS_MAX = 50;
const FRACTION_GUESS_MIN = 0;
const FRACTION_GUESS_MAX = 90;
const FRACTION_GUESS_STEP = 10;
const LEADERBOARD_LIMIT = 10;
const LOCAL_STORAGE_KEYS = {
  displayName: "kzo.displayName",
  personalBest: "kzo.personalBest",
  lastLeaderboardResult: "kzo.lastLeaderboardResult"
};
const SUPABASE_FUNCTION_NAME = "submit-score";
const DISPLAY_NAME_PATTERN = /^[\p{L}\p{N}_ -]+$/u;
const AudioContextClass = window.AudioContext || window.webkitAudioContext;
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

const currencyFormatter = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 2
});

const dateFormatter = new Intl.DateTimeFormat("he-IL", {
  day: "numeric",
  month: "numeric",
  year: "numeric"
});

const state = {
  catalog: null,
  currentRound: null,
  audioContext: null,
  lastSliderSoundAt: 0,
  lastSliderSoundValue: null,
  revealAnimationFrame: null,
  revealSequenceId: 0,
  revealTimeouts: [],
  session: null,
  guessDraft: {
    whole: 25,
    fraction: 90
  },
  supabaseClient: null,
  supabaseEnabled: false,
  supabaseInitPromise: null,
  supabaseReady: false,
  supabaseUserId: null,
  leaderboardEntries: [],
  leaderboardLoading: false,
  leaderboardSubmitting: false,
  leaderboardFeedback: "",
  leaderboardFeedbackTone: "neutral",
  pendingNameAction: null,
  playerProfile: {
    displayName: "",
    personalBest: 0,
    personalBestAt: "",
    lastLeaderboardResult: null
  },
  view: "loading"
};

const elements = {
  actualReadoutSide: document.querySelector("#actual-readout-side"),
  catalogUpdated: document.querySelector("#catalog-updated"),
  chainTarget: document.querySelector("#chain-target"),
  displayNameInput: document.querySelector("#display-name-input"),
  differenceReadout: document.querySelector("#difference-readout"),
  finalScore: document.querySelector("#final-score"),
  guessForm: document.querySelector("#guess-form"),
  guessFractionSlider: document.querySelector("#guess-fraction-slider"),
  resultGap: document.querySelector("#result-gap"),
  guessReadout: document.querySelector("#guess-readout"),
  guessSubmit: document.querySelector("#guess-submit"),
  guessValue: document.querySelector("#guess-value"),
  guessWholeSlider: document.querySelector("#guess-whole-slider"),
  nextButton: document.querySelector("#next-button"),
  priceList: document.querySelector("#price-list"),
  productMeta: document.querySelector("#product-meta"),
  productName: document.querySelector("#product-heading"),
  productPanel: document.querySelector("#product-panel"),
  productVisual: document.querySelector("#product-visual"),
  progressDots: document.querySelector("#progress-dots"),
  leaderboardEditNameButton: document.querySelector("#leaderboard-edit-name-button"),
  leaderboardFeedback: document.querySelector("#leaderboard-feedback"),
  leaderboardList: document.querySelector("#leaderboard-list"),
  leaderboardProfile: document.querySelector("#leaderboard-profile"),
  leaderboardSubmitButton: document.querySelector("#leaderboard-submit-button"),
  nameCancelButton: document.querySelector("#name-cancel-button"),
  nameError: document.querySelector("#name-error"),
  nameForm: document.querySelector("#name-form"),
  nameModal: document.querySelector("#name-modal"),
  nameModalBackdrop: document.querySelector("#name-modal-backdrop"),
  nameModalCopy: document.querySelector("#name-modal-copy"),
  nameModalTitle: document.querySelector("#name-modal-title"),
  nameSaveButton: document.querySelector("#name-save-button"),
  personalBestCopy: document.querySelector("#personal-best-copy"),
  personalBestScore: document.querySelector("#personal-best-score"),
  restartButton: document.querySelector("#restart-button"),
  resultDirection: document.querySelector("#result-direction"),
  resultPanel: document.querySelector("#result-panel"),
  resultScoreSlot: document.querySelector("#result-score-slot"),
  roundIndicator: document.querySelector("#round-indicator"),
  roundScore: document.querySelector("#round-score"),
  summaryCopy: document.querySelector("#summary-copy"),
  summaryPanel: document.querySelector("#summary-panel"),
  summaryRounds: document.querySelector("#summary-rounds"),
  totalScore: document.querySelector("#total-score")
};

function formatCurrency(value) {
  return currencyFormatter.format(value);
}

function formatDate(dateValue) {
  if (!dateValue) {
    return "";
  }

  const parsed = new Date(dateValue);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return dateFormatter.format(parsed);
}

function getRuntimeConfig() {
  const appConfig = window.__APP_CONFIG__ ?? {};

  return {
    supabaseUrl: typeof appConfig.supabaseUrl === "string" ? appConfig.supabaseUrl : "",
    supabasePublishableKey:
      typeof appConfig.supabasePublishableKey === "string" ? appConfig.supabasePublishableKey : ""
  };
}

function readStoredJson(key, fallbackValue) {
  try {
    const rawValue = window.localStorage.getItem(key);
    if (!rawValue) {
      return fallbackValue;
    }

    return JSON.parse(rawValue);
  } catch {
    return fallbackValue;
  }
}

function writeStoredJson(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

function normalizeDisplayName(displayName) {
  return displayName.trim().replace(/\s+/g, " ");
}

function validateDisplayName(displayName) {
  const normalized = normalizeDisplayName(displayName);

  if (normalized.length < 2 || normalized.length > 20) {
    return { error: "בחרו שם באורך 2-20 תווים." };
  }

  if (!DISPLAY_NAME_PATTERN.test(normalized)) {
    return { error: "אפשר להשתמש בעברית, אנגלית, מספרים, רווחים, _ ו--." };
  }

  return { normalized };
}

function loadLocalPlayerProfile() {
  const personalBestRecord = readStoredJson(LOCAL_STORAGE_KEYS.personalBest, null);
  const lastLeaderboardResult = readStoredJson(LOCAL_STORAGE_KEYS.lastLeaderboardResult, null);

  try {
    state.playerProfile.displayName =
      window.localStorage.getItem(LOCAL_STORAGE_KEYS.displayName) ?? "";
  } catch {
    state.playerProfile.displayName = "";
  }

  state.playerProfile.personalBest =
    typeof personalBestRecord?.score === "number" ? personalBestRecord.score : 0;
  state.playerProfile.personalBestAt =
    typeof personalBestRecord?.achievedAt === "string" ? personalBestRecord.achievedAt : "";
  state.playerProfile.lastLeaderboardResult =
    lastLeaderboardResult && typeof lastLeaderboardResult === "object" ? lastLeaderboardResult : null;
}

function persistDisplayName(displayName) {
  state.playerProfile.displayName = displayName;

  try {
    window.localStorage.setItem(LOCAL_STORAGE_KEYS.displayName, displayName);
  } catch {}
}

function updateLocalPersonalBest(score) {
  const achievedAt = new Date().toISOString();
  const previousBest = state.playerProfile.personalBest;
  const isNewLocalBest = score > previousBest;

  if (!isNewLocalBest) {
    return false;
  }

  state.playerProfile.personalBest = score;
  state.playerProfile.personalBestAt = achievedAt;
  writeStoredJson(LOCAL_STORAGE_KEYS.personalBest, {
    score,
    achievedAt
  });

  return true;
}

function storeLastLeaderboardResult(result) {
  state.playerProfile.lastLeaderboardResult = result;
  writeStoredJson(LOCAL_STORAGE_KEYS.lastLeaderboardResult, result);
}

function hide(element) {
  element.classList.add("panel-hidden");
}

function show(element) {
  element.classList.remove("panel-hidden");
}

function ensureAudioContext() {
  if (!AudioContextClass) {
    return null;
  }

  if (!state.audioContext) {
    state.audioContext = new AudioContextClass();
  }

  if (state.audioContext.state === "suspended") {
    state.audioContext.resume().catch(() => {});
  }

  return state.audioContext;
}

function playTone({
  frequency,
  endFrequency = frequency,
  durationMs = 80,
  gain = 0.025,
  type = "sine"
}) {
  const audioContext = ensureAudioContext();
  if (!audioContext) {
    return;
  }

  const startAt = audioContext.currentTime;
  const stopAt = startAt + durationMs / 1000;
  const oscillator = audioContext.createOscillator();
  const envelope = audioContext.createGain();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(Math.max(frequency, 120), startAt);
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(endFrequency, 120), stopAt);

  envelope.gain.setValueAtTime(0.0001, startAt);
  envelope.gain.exponentialRampToValueAtTime(gain, startAt + 0.012);
  envelope.gain.exponentialRampToValueAtTime(0.0001, stopAt);

  oscillator.connect(envelope);
  envelope.connect(audioContext.destination);
  oscillator.start(startAt);
  oscillator.stop(stopAt + 0.02);
}

function playClickSound() {
  const audioContext = ensureAudioContext();
  if (!audioContext) {
    return;
  }

  const startAt = audioContext.currentTime;

  const thumpOscillator = audioContext.createOscillator();
  const thumpGainNode = audioContext.createGain();
  thumpOscillator.type = "sine";
  thumpOscillator.frequency.setValueAtTime(190, startAt);
  thumpOscillator.frequency.exponentialRampToValueAtTime(112, startAt + 0.055);
  thumpGainNode.gain.setValueAtTime(0.03, startAt);
  thumpGainNode.gain.exponentialRampToValueAtTime(0.001, startAt + 0.06);
  thumpOscillator.connect(thumpGainNode);
  thumpGainNode.connect(audioContext.destination);
  thumpOscillator.start(startAt);
  thumpOscillator.stop(startAt + 0.06);

  const tickStart = startAt + 0.008;
  const tickOscillator = audioContext.createOscillator();
  const tickGainNode = audioContext.createGain();
  tickOscillator.type = "triangle";
  tickOscillator.frequency.setValueAtTime(780, tickStart);
  tickOscillator.frequency.exponentialRampToValueAtTime(520, tickStart + 0.045);
  tickGainNode.gain.setValueAtTime(0.015, tickStart);
  tickGainNode.gain.exponentialRampToValueAtTime(0.001, tickStart + 0.05);
  tickOscillator.connect(tickGainNode);
  tickGainNode.connect(audioContext.destination);
  tickOscillator.start(tickStart);
  tickOscillator.stop(tickStart + 0.05);
}

function playCountStep(progress) {
  playCountStepDetailed(progress, false);
}

function playCountStepDetailed(progress, isMajorStep) {
  const audioContext = ensureAudioContext();
  if (!audioContext) {
    return;
  }

  const clampedProgress = Math.min(Math.max(progress, 0), 1);
  const startAt = audioContext.currentTime;
  const baseFrequency = 523 * 2 ** (clampedProgress * 2);
  const volume = isMajorStep ? 0.08 : 0.04;
  const durationSeconds = isMajorStep ? 0.09 : 0.04;

  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();
  oscillator.type = "triangle";
  oscillator.frequency.setValueAtTime(baseFrequency, startAt);
  gainNode.gain.setValueAtTime(volume, startAt);
  gainNode.gain.exponentialRampToValueAtTime(0.001, startAt + durationSeconds);
  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);
  oscillator.start(startAt);
  oscillator.stop(startAt + durationSeconds);

  if (!isMajorStep) {
    return;
  }

  const harmonicOscillator = audioContext.createOscillator();
  const harmonicGainNode = audioContext.createGain();
  harmonicOscillator.type = "sine";
  harmonicOscillator.frequency.setValueAtTime(baseFrequency * 2, startAt);
  harmonicGainNode.gain.setValueAtTime(0.035, startAt);
  harmonicGainNode.gain.exponentialRampToValueAtTime(0.001, startAt + 0.12);
  harmonicOscillator.connect(harmonicGainNode);
  harmonicGainNode.connect(audioContext.destination);
  harmonicOscillator.start(startAt);
  harmonicOscillator.stop(startAt + 0.12);
}

function playCountLandingSound() {
  const audioContext = ensureAudioContext();
  if (!audioContext) {
    return;
  }

  const frequencies = [1046, 1318, 1568];

  frequencies.forEach((frequency, index) => {
    const noteStart = audioContext.currentTime + index * 0.03;
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, noteStart);
    gainNode.gain.setValueAtTime(0.06, noteStart);
    gainNode.gain.exponentialRampToValueAtTime(0.001, noteStart + 0.2);
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.start(noteStart);
    oscillator.stop(noteStart + 0.2);
  });
}

function playPerfectScoreSound() {
  const audioContext = ensureAudioContext();
  if (!audioContext) {
    return;
  }

  const notes = [1568, 2093, 2637];

  notes.forEach((frequency, index) => {
    const noteStart = audioContext.currentTime + index * 0.05;
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.type = index === notes.length - 1 ? "triangle" : "sine";
    oscillator.frequency.setValueAtTime(frequency, noteStart);
    oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.03, noteStart + 0.09);
    gainNode.gain.setValueAtTime(index === notes.length - 1 ? 0.07 : 0.05, noteStart);
    gainNode.gain.exponentialRampToValueAtTime(0.001, noteStart + 0.22);
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.start(noteStart);
    oscillator.stop(noteStart + 0.22);
  });
}

function playSliderStep(progress) {
  const audioContext = ensureAudioContext();
  if (!audioContext) {
    return;
  }

  const clampedProgress = Math.min(Math.max(progress, 0), 1);
  const burstDurationSeconds = 0.018;
  const frameCount = Math.max(1, Math.floor(audioContext.sampleRate * burstDurationSeconds));
  const noiseBuffer = audioContext.createBuffer(1, frameCount, audioContext.sampleRate);
  const channelData = noiseBuffer.getChannelData(0);

  for (let index = 0; index < frameCount; index += 1) {
    channelData[index] = (Math.random() * 2 - 1) * 0.5;
  }

  const source = audioContext.createBufferSource();
  source.buffer = noiseBuffer;

  const filter = audioContext.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(1800 + clampedProgress * 3600, audioContext.currentTime);
  filter.Q.setValueAtTime(2.5, audioContext.currentTime);

  const gainNode = audioContext.createGain();
  gainNode.gain.setValueAtTime(0.12, audioContext.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(
    0.002,
    audioContext.currentTime + burstDurationSeconds
  );

  source.connect(filter);
  filter.connect(gainNode);
  gainNode.connect(audioContext.destination);
  source.start();
  source.stop(audioContext.currentTime + burstDurationSeconds + 0.01);
}

function clampWholeGuess(value) {
  return Math.min(WHOLE_GUESS_MAX, Math.max(WHOLE_GUESS_MIN, Math.round(value)));
}

function clampFractionGuess(value, wholeGuess) {
  if (wholeGuess >= WHOLE_GUESS_MAX) {
    return 0;
  }

  const roundedValue = Math.round(value / FRACTION_GUESS_STEP) * FRACTION_GUESS_STEP;
  return Math.min(FRACTION_GUESS_MAX, Math.max(FRACTION_GUESS_MIN, roundedValue));
}

function getCurrentGuessParts() {
  const wholeGuess = clampWholeGuess(Number(elements.guessWholeSlider.value));
  const fractionGuess = clampFractionGuess(Number(elements.guessFractionSlider.value), wholeGuess);

  return {
    whole: wholeGuess,
    fraction: fractionGuess
  };
}

function getCurrentGuessValue() {
  const guessParts = getCurrentGuessParts();
  return Number((guessParts.whole + guessParts.fraction / 100).toFixed(2));
}

function syncGuessControls(wholeGuess, fractionGuess) {
  const safeWholeGuess = clampWholeGuess(wholeGuess);
  const safeFractionGuess = clampFractionGuess(fractionGuess, safeWholeGuess);

  elements.guessWholeSlider.value = String(safeWholeGuess);
  elements.guessFractionSlider.value = String(safeFractionGuess);
  elements.guessFractionSlider.disabled = safeWholeGuess >= WHOLE_GUESS_MAX;

  state.guessDraft = {
    whole: safeWholeGuess,
    fraction: safeFractionGuess
  };
}

function resetSliderSoundState(currentValue = null) {
  state.lastSliderSoundAt = 0;
  state.lastSliderSoundValue = currentValue;
}

function maybePlaySliderSound() {
  const currentValue = getCurrentGuessValue();
  const min = WHOLE_GUESS_MIN;
  const max = WHOLE_GUESS_MAX;
  const safeRange = max - min || 1;
  const normalizedProgress = (currentValue - min) / safeRange;
  const roundedValue =
    Math.round(currentValue / SLIDER_SOUND_STEP_VALUE) * SLIDER_SOUND_STEP_VALUE;
  const now = window.performance.now();
  const previousValue = state.lastSliderSoundValue;

  if (previousValue !== null && roundedValue === previousValue) {
    return;
  }

  if (now - state.lastSliderSoundAt < SLIDER_SOUND_INTERVAL_MS) {
    return;
  }

  playSliderStep(normalizedProgress);
  state.lastSliderSoundAt = now;
  state.lastSliderSoundValue = roundedValue;
}

function cancelRevealSequence() {
  state.revealSequenceId += 1;

  if (state.revealAnimationFrame !== null) {
    window.cancelAnimationFrame(state.revealAnimationFrame);
    state.revealAnimationFrame = null;
  }

  for (const timeoutId of state.revealTimeouts) {
    window.clearTimeout(timeoutId);
  }

  state.revealTimeouts = [];
}

function queueRevealStep(callback, delayMs) {
  const sequenceId = state.revealSequenceId;
  const timeoutId = window.setTimeout(() => {
    state.revealTimeouts = state.revealTimeouts.filter((entry) => entry !== timeoutId);

    if (sequenceId !== state.revealSequenceId) {
      return;
    }

    callback();
  }, delayMs);

  state.revealTimeouts.push(timeoutId);
}

function concealRevealStep(element) {
  element.setAttribute("aria-hidden", "true");
  element.classList.remove("reveal-step--visible");
}

function revealStep(element) {
  const sequenceId = state.revealSequenceId;

  window.requestAnimationFrame(() => {
    if (sequenceId !== state.revealSequenceId) {
      return;
    }

    window.requestAnimationFrame(() => {
      if (sequenceId !== state.revealSequenceId) {
        return;
      }

      element.removeAttribute("aria-hidden");
      element.classList.add("reveal-step--visible");
    });
  });
}

function resetRevealSequenceUI() {
  concealRevealStep(elements.resultDirection);
  concealRevealStep(elements.resultGap);
  concealRevealStep(elements.resultScoreSlot);
  concealRevealStep(elements.priceList);
  concealRevealStep(elements.nextButton);
  elements.nextButton.disabled = true;
}

function showRevealInfoStage() {
  revealStep(elements.resultDirection);
  revealStep(elements.resultGap);
  revealStep(elements.resultScoreSlot);
}

function showRevealFinalStage() {
  revealStep(elements.priceList);
  revealStep(elements.nextButton);
  elements.nextButton.disabled = false;
}

function animateActualPrice(actualPrice, roundScore) {
  const sequenceId = state.revealSequenceId;
  const startTime = window.performance.now();
  let lastSoundAt = startTime - COUNT_SOUND_INTERVAL_MS;
  let lastWholeValue = 0;

  elements.actualReadoutSide.textContent = formatCurrency(0);

  function tick(now) {
    if (sequenceId !== state.revealSequenceId) {
      return;
    }

    const progress = Math.min((now - startTime) / REVEAL_COUNT_DURATION_MS, 1);
    const easedProgress = 1 - (1 - progress) ** 3;
    const currentValue = Number((actualPrice * easedProgress).toFixed(2));
    const wholeValue = Math.floor(currentValue);
    elements.actualReadoutSide.textContent = formatCurrency(currentValue);

    if (now - lastSoundAt >= COUNT_SOUND_INTERVAL_MS) {
      playCountStepDetailed(easedProgress, wholeValue !== lastWholeValue);
      lastSoundAt = now;
      lastWholeValue = wholeValue;
    }

    if (progress < 1) {
      state.revealAnimationFrame = window.requestAnimationFrame(tick);
      return;
    }

    state.revealAnimationFrame = null;
    elements.actualReadoutSide.textContent = formatCurrency(actualPrice);
    playCountLandingSound();
    if (roundScore === 100) {
      queueRevealStep(playPerfectScoreSound, 130);
    }
    showRevealInfoStage();
    queueRevealStep(showRevealFinalStage, REVEAL_INFO_DELAY_MS + REVEAL_LIST_DELAY_MS);
  }

  state.revealAnimationFrame = window.requestAnimationFrame(tick);
}

function renderCatalogStamp() {
  const formattedDate = formatDate(state.catalog?.meta?.updatedAt);
  elements.catalogUpdated.textContent = formattedDate ? `עודכן ${formattedDate}` : "";
}

function setLeaderboardFeedback(message, tone = "neutral") {
  state.leaderboardFeedback = message;
  state.leaderboardFeedbackTone = tone;
  elements.leaderboardFeedback.textContent = message;
  elements.leaderboardFeedback.className = "leaderboard-feedback";

  if (tone === "error") {
    elements.leaderboardFeedback.classList.add("leaderboard-feedback--error");
  }
}

function renderLeaderboardList() {
  elements.leaderboardList.replaceChildren();

  if (state.leaderboardLoading) {
    const item = document.createElement("li");
    item.className = "leaderboard-item";
    item.textContent = "טוען את טבלת השיאים...";
    elements.leaderboardList.append(item);
    return;
  }

  if (!state.leaderboardEntries.length) {
    const item = document.createElement("li");
    item.className = "leaderboard-item";
    item.textContent = state.supabaseEnabled
      ? "עוד אין תוצאות בטבלה."
      : "טבלת השיאים תהיה זמינה אחרי חיבור ל-Supabase.";
    elements.leaderboardList.append(item);
    return;
  }

  state.leaderboardEntries.forEach((entry, index) => {
    const item = document.createElement("li");
    item.className = "leaderboard-item";

    if (entry.player_id === state.supabaseUserId) {
      item.classList.add("leaderboard-item--current");
    }

    const rank = document.createElement("span");
    rank.className = "leaderboard-item__rank";
    rank.textContent = `#${index + 1}`;

    const name = document.createElement("span");
    name.className = "leaderboard-item__name";
    name.textContent = entry.display_name;

    const score = document.createElement("strong");
    score.className = "leaderboard-item__score";
    score.textContent = `${entry.best_score} נק׳`;

    item.append(rank, name, score);
    elements.leaderboardList.append(item);
  });
}

function renderLeaderboardControls() {
  const hasDisplayName = Boolean(state.playerProfile.displayName);

  if (!state.supabaseEnabled) {
    elements.leaderboardProfile.textContent = "הטבלה תופעל אחרי חיבור ל-Supabase.";
  } else if (hasDisplayName) {
    elements.leaderboardProfile.textContent = `נרשם כ: ${state.playerProfile.displayName}`;
  } else {
    elements.leaderboardProfile.textContent = "נבקש שם רק כשתרצו לשלוח תוצאה.";
  }

  elements.leaderboardSubmitButton.textContent = state.leaderboardSubmitting
    ? "שולח..."
    : hasDisplayName
      ? "עדכן בטבלה"
      : "שלח לטבלה";
  elements.leaderboardSubmitButton.disabled = !state.supabaseEnabled || state.leaderboardSubmitting;

  elements.leaderboardEditNameButton.textContent = hasDisplayName ? "ערוך שם" : "הוסף שם";
}

function renderSummaryBest(totalScore, isNewLocalBest) {
  elements.personalBestScore.textContent = String(state.playerProfile.personalBest);

  if (isNewLocalBest) {
    elements.personalBestCopy.textContent = "שיא אישי חדש במכשיר הזה!";
    return;
  }

  if (state.playerProfile.personalBest > 0 && totalScore < state.playerProfile.personalBest) {
    elements.personalBestCopy.textContent = "השיא המקומי נשמר כאן במכשיר.";
    return;
  }

  elements.personalBestCopy.textContent = "";
}

function openNameModal(mode) {
  state.pendingNameAction = mode;
  elements.nameError.textContent = "";
  elements.displayNameInput.value = state.playerProfile.displayName;

  if (mode === "submit") {
    elements.nameModalTitle.textContent = "איך נרשום אותך?";
    elements.nameModalCopy.textContent = "השם יישמר במכשיר הזה וישמש אותך גם בפעם הבאה.";
    elements.nameSaveButton.textContent = "שמור ושלח";
  } else {
    elements.nameModalTitle.textContent = "עדכון שם";
    elements.nameModalCopy.textContent = "אפשר לעדכן את השם המקומי שלך לפני השליחה הבאה.";
    elements.nameSaveButton.textContent = "שמור שם";
  }

  show(elements.nameModal);
  window.requestAnimationFrame(() => {
    elements.displayNameInput.focus();
    elements.displayNameInput.select();
  });
}

function closeNameModal() {
  state.pendingNameAction = null;
  elements.nameError.textContent = "";
  hide(elements.nameModal);
}

async function ensureSupabaseClient() {
  if (state.supabaseInitPromise) {
    return state.supabaseInitPromise;
  }

  const runtimeConfig = getRuntimeConfig();
  const createClient = window.supabase?.createClient;

  if (!runtimeConfig.supabaseUrl || !runtimeConfig.supabasePublishableKey || !createClient) {
    state.supabaseEnabled = false;
    renderLeaderboardControls();
    renderLeaderboardList();
    return null;
  }

  state.supabaseEnabled = true;
  state.supabaseInitPromise = (async () => {
    const client = createClient(runtimeConfig.supabaseUrl, runtimeConfig.supabasePublishableKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        storageKey: "kzo.supabase.auth"
      }
    });

    client.auth.onAuthStateChange((_event, session) => {
      state.supabaseUserId = session?.user?.id ?? null;
    });

    const {
      data: { session }
    } = await client.auth.getSession();

    if (!session) {
      const { error } = await client.auth.signInAnonymously();
      if (error) {
        throw error;
      }
    }

    const {
      data: { user },
      error: userError
    } = await client.auth.getUser();

    if (userError) {
      throw userError;
    }

    state.supabaseClient = client;
    state.supabaseReady = true;
    state.supabaseUserId = user?.id ?? null;
    renderLeaderboardControls();

    return client;
  })().catch((error) => {
    state.supabaseEnabled = false;
    state.supabaseReady = false;
    state.supabaseInitPromise = null;
    setLeaderboardFeedback("לא הצלחתי להתחבר לטבלת השיאים כרגע.", "error");
    console.error(error);
    return null;
  });

  return state.supabaseInitPromise;
}

async function loadLeaderboardPreview() {
  state.leaderboardLoading = true;
  renderLeaderboardControls();
  renderLeaderboardList();

  const client = await ensureSupabaseClient();
  if (!client) {
    state.leaderboardLoading = false;
    renderLeaderboardControls();
    renderLeaderboardList();
    return;
  }

  const { data, error } = await client
    .from("public_leaderboard")
    .select("player_id, display_name, best_score, best_score_at")
    .order("best_score", { ascending: false })
    .order("best_score_at", { ascending: true })
    .limit(LEADERBOARD_LIMIT);

  state.leaderboardLoading = false;

  if (error) {
    state.leaderboardEntries = [];
    setLeaderboardFeedback("לא הצלחתי לטעון את טבלת השיאים.", "error");
    renderLeaderboardControls();
    renderLeaderboardList();
    return;
  }

  state.leaderboardEntries = data ?? [];

  if (!state.leaderboardFeedback && state.playerProfile.lastLeaderboardResult?.leaderboardRank) {
    setLeaderboardFeedback(
      `המקום האחרון שלך: #${state.playerProfile.lastLeaderboardResult.leaderboardRank}`
    );
  }

  renderLeaderboardControls();
  renderLeaderboardList();
}

function buildSubmissionRounds() {
  return (state.session?.results ?? []).map((result) => ({
    roundNumber: result.roundNumber,
    roundScore: result.roundScore,
    productId: result.productId,
    productNameHe: result.productNameHe
  }));
}

async function submitLeaderboardScore(displayNameOverride = null) {
  if (!state.session || state.leaderboardSubmitting) {
    return;
  }

  const client = await ensureSupabaseClient();
  if (!client) {
    setLeaderboardFeedback("טבלת השיאים לא זמינה כרגע.", "error");
    return;
  }

  state.leaderboardSubmitting = true;
  setLeaderboardFeedback("");
  renderLeaderboardControls();

  const displayName = displayNameOverride ?? state.playerProfile.displayName;
  const payload = {
    score: state.session.totalScore,
    rounds: buildSubmissionRounds(),
    catalogUpdatedAt: state.catalog?.meta?.updatedAt ?? null,
    ...(displayName ? { displayName } : {})
  };

  const { data, error } = await client.functions.invoke(SUPABASE_FUNCTION_NAME, {
    body: payload
  });

  state.leaderboardSubmitting = false;

  if (error || !data?.accepted) {
    const message = data?.error ?? error?.message ?? "שליחת התוצאה נכשלה.";
    setLeaderboardFeedback(message, "error");
    renderLeaderboardControls();
    return;
  }

  if (typeof data.displayName === "string" && data.displayName) {
    persistDisplayName(data.displayName);
  }

  storeLastLeaderboardResult({
    bestScore: data.bestScore,
    leaderboardRank: data.leaderboardRank,
    submittedAt: new Date().toISOString()
  });

  if (data.isNewBest && data.leaderboardRank) {
    setLeaderboardFeedback(`שיא חדש! כרגע אתה במקום #${data.leaderboardRank}`);
  } else if (data.leaderboardRank) {
    setLeaderboardFeedback(`התוצאה נשמרה. כרגע אתה במקום #${data.leaderboardRank}`);
  } else {
    setLeaderboardFeedback("התוצאה נשמרה בטבלה.");
  }

  renderLeaderboardControls();
  await loadLeaderboardPreview();
}

function renderProgressDots() {
  elements.progressDots.replaceChildren();

  const completed = state.session?.results.length ?? 0;
  const activeIndex =
    state.view === "guess" ? completed : state.view === "reveal" ? Math.max(completed - 1, 0) : -1;

  for (let index = 0; index < SESSION_ROUNDS; index += 1) {
    const dot = document.createElement("span");
    dot.className = "progress-dots__item";

    if (index < completed) {
      dot.classList.add("progress-dots__item--done");
    }

    if (index === activeIndex && state.view === "guess") {
      dot.classList.add("progress-dots__item--active");
    }

    elements.progressDots.append(dot);
  }
}

function renderHud() {
  const completed = state.session?.results.length ?? 0;
  const roundNumber =
    state.view === "guess" ? Math.min(completed + 1, SESSION_ROUNDS) : Math.min(completed, SESSION_ROUNDS);

  elements.roundIndicator.textContent = `${Math.max(roundNumber, 1)}/${SESSION_ROUNDS}`;
  elements.totalScore.textContent = String(state.session?.totalScore ?? 0);
  renderProgressDots();
}

function updateSliderValue() {
  elements.guessValue.textContent = formatCurrency(getCurrentGuessValue());
}

function renderProductFallback(product) {
  const wrapper = document.createElement("div");
  wrapper.setAttribute("role", "img");
  wrapper.setAttribute("aria-label", product.canonicalNameHe);

  const brand = document.createElement("span");
  brand.className = "product-visual__brand";
  brand.textContent = product.brandHe ?? "מוצר";

  const name = document.createElement("span");
  name.className = "product-visual__name";
  name.textContent = product.categoryHe ?? "סופר";

  const size = document.createElement("span");
  size.className = "product-visual__size";
  size.textContent = product.sizeHe ?? "";

  wrapper.append(brand, name, size);
  elements.productVisual.append(wrapper);
}

function handleSliderInput() {
  const guessParts = getCurrentGuessParts();
  syncGuessControls(guessParts.whole, guessParts.fraction);
  updateSliderValue();
  maybePlaySliderSound();
}

function renderProductVisual(product) {
  elements.productVisual.replaceChildren();

  if (product.image?.url) {
    const loader = document.createElement("div");
    loader.className = "product-visual__loader";
    loader.setAttribute("aria-hidden", "true");

    const image = document.createElement("img");
    image.className = "product-visual__image product-visual__image--loading";
    image.alt = product.canonicalNameHe;
    image.loading = "eager";
    image.decoding = "async";
    image.fetchPriority = "high";

    const revealImage = () => {
      if (!image.isConnected) {
        return;
      }
      image.classList.remove("product-visual__image--loading");
      loader.remove();
    };

    image.addEventListener("load", revealImage, { once: true });
    image.addEventListener(
      "error",
      () => {
        if (!image.isConnected) {
          return;
        }
        elements.productVisual.replaceChildren();
        renderProductFallback(product);
      },
      { once: true }
    );

    image.src = product.image.url;
    elements.productVisual.append(loader, image);

    if (image.complete && image.naturalWidth > 0) {
      revealImage();
    }
    return;
  }

  renderProductFallback(product);
}

function createSliderRange() {
  return {
    wholeMin: WHOLE_GUESS_MIN,
    wholeMax: WHOLE_GUESS_MAX,
    wholeStep: 1,
    fractionMin: FRACTION_GUESS_MIN,
    fractionMax: FRACTION_GUESS_MAX,
    fractionStep: FRACTION_GUESS_STEP
  };
}

function buildGuessFeedback(actualPrice, guess) {
  const absoluteDifference = Number(Math.abs(actualPrice - guess).toFixed(2));
  const percentDifference = Number(((absoluteDifference / actualPrice) * 100).toFixed(1));

  if (absoluteDifference <= 0.15) {
    return {
      tone: "exact",
      directionHe: "בול",
      absoluteDifference,
      percentDifference
    };
  }

  return {
    tone: guess > actualPrice ? "high" : "low",
    directionHe: guess > actualPrice ? "גבוה מדי" : "נמוך מדי",
    absoluteDifference,
    percentDifference
  };
}

function calculateRoundScore(actualPrice, guess) {
  const percentDifference = Math.abs(actualPrice - guess) / actualPrice;
  return Math.max(0, Math.round(100 - percentDifference * 100));
}

function createRoundFromCatalog(catalog, usedProductIds) {
  const allProducts = (catalog?.products ?? []).filter(
    (product) => (product.pricesByChain ?? []).length >= 2
  );
  const availableProducts = allProducts.filter((product) => !usedProductIds.has(product.id));
  const pool = availableProducts.length ? availableProducts : allProducts;

  if (!pool.length) {
    return null;
  }

  const product = pool[Math.floor(Math.random() * pool.length)];
  const selectedEntry =
    product.pricesByChain[Math.floor(Math.random() * product.pricesByChain.length)];
  const slider = createSliderRange();

  return {
    product,
    selectedEntry,
    slider
  };
}

function renderRound(round) {
  cancelRevealSequence();
  state.currentRound = round;
  state.view = "guess";

  elements.chainTarget.textContent = round.selectedEntry.chainNameHe;
  elements.productName.textContent = round.product.canonicalNameHe;
  elements.productMeta.textContent = [round.product.brandHe, round.product.sizeHe]
    .filter(Boolean)
    .join(" · ");

  resetRevealSequenceUI();
  elements.priceList.replaceChildren();
  renderProductVisual(round.product);

  elements.guessWholeSlider.min = String(round.slider.wholeMin);
  elements.guessWholeSlider.max = String(round.slider.wholeMax);
  elements.guessWholeSlider.step = String(round.slider.wholeStep);
  elements.guessFractionSlider.min = String(round.slider.fractionMin);
  elements.guessFractionSlider.max = String(round.slider.fractionMax);
  elements.guessFractionSlider.step = String(round.slider.fractionStep);
  syncGuessControls(state.guessDraft.whole, state.guessDraft.fraction);
  updateSliderValue();
  resetSliderSoundState(getCurrentGuessValue());

  show(elements.productPanel);
  show(elements.guessForm);
  hide(elements.resultPanel);
  hide(elements.summaryPanel);
  elements.guessSubmit.disabled = false;

  renderHud();
}

function renderReveal(reveal) {
  cancelRevealSequence();
  state.view = "reveal";

  elements.resultDirection.className = `result-direction reveal-step result-direction--${reveal.feedback.tone}`;
  elements.resultDirection.textContent = reveal.feedback.directionHe;
  elements.roundScore.textContent = String(reveal.roundScore);
  elements.guessReadout.textContent = formatCurrency(reveal.guess);
  elements.differenceReadout.textContent = formatCurrency(reveal.feedback.absoluteDifference);

  elements.priceList.replaceChildren();

  for (const entry of reveal.revealEntries) {
    const item = document.createElement("li");
    item.className = "price-item";

    const chainName = document.createElement("span");
    chainName.className = "price-item__name";
    chainName.textContent = entry.chainNameHe;

    const value = document.createElement("span");
    value.className = "price-item__value";
    value.textContent = formatCurrency(entry.price);

    item.append(chainName, value);
    elements.priceList.append(item);
  }

  elements.nextButton.textContent =
    state.session.results.length === SESSION_ROUNDS ? "לתוצאה" : "הבא";

  resetRevealSequenceUI();
  hide(elements.guessForm);
  show(elements.resultPanel);
  renderHud();

  if (prefersReducedMotion.matches) {
    elements.actualReadoutSide.textContent = formatCurrency(reveal.actualPrice);
    playCountLandingSound();
    if (reveal.roundScore === 100) {
      queueRevealStep(playPerfectScoreSound, 130);
    }
    showRevealInfoStage();
    showRevealFinalStage();
    return;
  }

  animateActualPrice(reveal.actualPrice, reveal.roundScore);
}

function renderSummary() {
  cancelRevealSequence();
  state.view = "summary";
  state.currentRound = null;

  const totalScore = state.session.totalScore;
  const isNewLocalBest = updateLocalPersonalBest(totalScore);
  elements.finalScore.textContent = String(totalScore);
  elements.summaryCopy.textContent = `מתוך ${SESSION_ROUNDS * 100}`;
  renderSummaryBest(totalScore, isNewLocalBest);

  elements.summaryRounds.replaceChildren();
  for (const result of state.session.results) {
    const chip = document.createElement("div");
    chip.className = "summary-round";

    const number = document.createElement("span");
    number.className = "summary-round__number";
    number.textContent = String(result.roundNumber);

    const score = document.createElement("strong");
    score.className = "summary-round__score";
    score.textContent = String(result.roundScore);

    chip.append(number, score);
    elements.summaryRounds.append(chip);
  }

  hide(elements.productPanel);
  hide(elements.guessForm);
  hide(elements.resultPanel);
  show(elements.summaryPanel);
  renderLeaderboardControls();
  renderLeaderboardList();
  setLeaderboardFeedback("");
  void loadLeaderboardPreview();
  renderHud();
}

function resolveRound(guessValue) {
  const round = state.currentRound;
  if (!round) {
    return null;
  }

  const feedback = buildGuessFeedback(round.selectedEntry.price, guessValue);
  const roundScore = calculateRoundScore(round.selectedEntry.price, guessValue);
  const revealEntries = [...round.product.pricesByChain]
    .map((entry) => ({
      chainId: entry.chainId,
      chainNameHe: entry.chainNameHe,
      price: entry.price,
      isSelectedChain: entry.chainId === round.selectedEntry.chainId
    }))
    .sort((left, right) => left.price - right.price);

  return {
    guess: guessValue,
    actualPrice: round.selectedEntry.price,
    feedback,
    revealEntries,
    roundScore,
    productId: round.product.id,
    productNameHe: round.product.canonicalNameHe
  };
}

async function loadCatalog() {
  const catalogPaths = ["./data/catalog-popular-300.json", "./data/catalog.json"];

  for (const catalogPath of catalogPaths) {
    const response = await fetch(catalogPath, { cache: "no-store" });
    if (!response.ok) {
      continue;
    }

    const catalog = await response.json();
    if (!Array.isArray(catalog?.products) || !catalog.products.length) {
      continue;
    }

    state.catalog = catalog;
    return;
  }

  throw new Error("לא הצלחתי לטעון את הקטלוג.");
}

function startNewGame() {
  cancelRevealSequence();
  closeNameModal();
  state.session = {
    totalScore: 0,
    results: [],
    usedProductIds: new Set()
  };

  startNextRound();
}

function startNextRound() {
  cancelRevealSequence();
  if (!state.session) {
    return;
  }

  if (state.session.results.length >= SESSION_ROUNDS) {
    renderSummary();
    return;
  }

  const round = createRoundFromCatalog(state.catalog, state.session.usedProductIds);
  if (!round) {
    return;
  }

  state.session.usedProductIds.add(round.product.id);
  renderRound(round);
}

async function initializeApp() {
  elements.guessSubmit.disabled = true;
  loadLocalPlayerProfile();
  renderLeaderboardControls();
  renderLeaderboardList();

  try {
    await loadCatalog();
    renderCatalogStamp();
    void ensureSupabaseClient();
    startNewGame();
  } catch (error) {
    elements.catalogUpdated.textContent = error.message;
  } finally {
    elements.guessSubmit.disabled = false;
  }
}

elements.guessWholeSlider.addEventListener("input", handleSliderInput);
elements.guessFractionSlider.addEventListener("input", handleSliderInput);
elements.guessWholeSlider.addEventListener("pointerdown", () => resetSliderSoundState(null));
elements.guessFractionSlider.addEventListener("pointerdown", () => resetSliderSoundState(null));

elements.guessForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!state.currentRound) {
    return;
  }

  const guessValue = getCurrentGuessValue();
  const reveal = resolveRound(guessValue);
  if (!reveal) {
    return;
  }

  state.session.totalScore += reveal.roundScore;
  state.session.results.push({
    roundNumber: state.session.results.length + 1,
    roundScore: reveal.roundScore,
    productId: reveal.productId,
    productNameHe: reveal.productNameHe
  });

  renderReveal(reveal);
});

elements.nextButton.addEventListener("click", () => {
  playClickSound();

  if ((state.session?.results.length ?? 0) >= SESSION_ROUNDS) {
    renderSummary();
    return;
  }

  startNextRound();
});

elements.restartButton.addEventListener("click", () => {
  playClickSound();
  show(elements.productPanel);
  startNewGame();
});

elements.leaderboardSubmitButton.addEventListener("click", () => {
  playClickSound();

  if (!state.playerProfile.displayName) {
    openNameModal("submit");
    return;
  }

  void submitLeaderboardScore();
});

elements.leaderboardEditNameButton.addEventListener("click", () => {
  playClickSound();
  openNameModal("edit");
});

elements.nameCancelButton.addEventListener("click", () => {
  closeNameModal();
});

elements.nameModalBackdrop.addEventListener("click", () => {
  closeNameModal();
});

elements.nameForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const validation = validateDisplayName(elements.displayNameInput.value);
  if ("error" in validation) {
    elements.nameError.textContent = validation.error;
    return;
  }

  const pendingNameAction = state.pendingNameAction;
  persistDisplayName(validation.normalized);
  renderLeaderboardControls();
  closeNameModal();

  if (pendingNameAction === "submit") {
    void submitLeaderboardScore(validation.normalized);
    return;
  }

  setLeaderboardFeedback("השם המקומי עודכן. הוא יישלח בפעם הבאה שתעדכן תוצאה.");
});

renderHud();
initializeApp();
