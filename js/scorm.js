// ── SCORM 1.2 reporting ───────────────────────────────────
// Reports completion and time-on-task to a SCORM 1.2 LMS (e.g. D2L/Brightspace)
// when the viewer is launched as a SCO. The LMS API is found by walking up the
// frame chain; if none is present (opened standalone, GitHub Pages, a plain file)
// every call becomes a harmless no-op, so the app behaves identically outside an
// LMS. See imsmanifest.xml for the package definition.

// A model must have been opened and this many active seconds elapsed before the
// SCO is marked "completed". Tune to taste.
const COMPLETE_AFTER_SECONDS = 60;

let api          = null;
let initialized  = false;
let terminated   = false;
let completed    = false;
let modelOpened  = false;

// Active time only — the clock pauses while the tab is hidden, so idle time with
// the tab in the background doesn't inflate "Time Spent".
let activeMs    = 0;
let activeSince = null;

// Walk a window's parent chain looking for the SCORM 1.2 API object. Reading a
// cross-origin parent's property throws; treat that as "not reachable".
function findAPI(win) {
  let tries = 0;
  while (win && tries < 12) {
    try { if (win.API) return win.API; }
    catch { return null; } // cross-origin ancestor — can't reach the API
    if (win.parent && win.parent !== win) { win = win.parent; tries++; }
    else break;
  }
  return null;
}

function locateAPI() {
  // Search this window's ancestors, then the opener's (LMS may use a popup).
  let found = findAPI(window);
  if (!found && window.opener) { try { found = findAPI(window.opener); } catch {} }
  return found;
}

const get    = k    => { try { return api.LMSGetValue(k); } catch { return ''; } };
const set    = (k, v) => { try { return api.LMSSetValue(k, String(v)); } catch { return 'false'; } };
const commit = ()   => { try { api.LMSCommit(''); } catch {} };

// SCORM 1.2 CMITimespan, HHHH:MM:SS.
function toTimespan(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const pad = n => String(n).padStart(2, '0');
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
}

function resumeTimer() { if (activeSince == null && !document.hidden) activeSince = Date.now(); }
function pauseTimer()  { if (activeSince != null) { activeMs += Date.now() - activeSince; activeSince = null; } }
function elapsedMs()   { return activeMs + (activeSince != null ? Date.now() - activeSince : 0); }

function maybeComplete() {
  if (completed || !initialized) return;
  if (modelOpened && elapsedMs() >= COMPLETE_AFTER_SECONDS * 1000) {
    set('cmi.core.lesson_status', 'completed');
    commit();
    completed = true;
  }
}

// End the session once: flush the active time into session_time, then finish so
// the LMS folds it into total_time. Guarded so pagehide+beforeunload run it once.
function terminate() {
  if (!initialized || terminated) return;
  terminated = true;
  pauseTimer();
  set('cmi.core.session_time', toTimespan(elapsedMs()));
  commit();
  try { api.LMSFinish(''); } catch {}
}

function init() {
  api = locateAPI();
  if (!api) return; // not in an LMS — stay dormant
  try { if (api.LMSInitialize('') !== 'true') return; }
  catch { return; }
  initialized = true;

  // Move a fresh attempt from "not attempted" to "incomplete" so the report
  // shows an actual status; respect an existing completed/passed status.
  const status = get('cmi.core.lesson_status');
  if (!status || status === 'not attempted') set('cmi.core.lesson_status', 'incomplete');
  else if (status === 'completed' || status === 'passed') completed = true;

  resumeTimer();
  commit();

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { pauseTimer(); commit(); } else resumeTimer();
  });
  setInterval(maybeComplete, 5000);
  window.addEventListener('pagehide', terminate);
  window.addEventListener('beforeunload', terminate);
}

// Called by the app when a model is loaded, so "opened a model" can count
// toward completion.
export function scormModelOpened() {
  modelOpened = true;
  maybeComplete();
}

init();
