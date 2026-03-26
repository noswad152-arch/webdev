window.WitnessAuthRedirectConfig = {
  authOrigin: "https://www.witnessv2.net",
  apiBase: "https://www.witnessv2.net"
};

function ensureWitnessAuthRedirect() {
  if (window.WitnessAuthRedirect) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-witness-auth-redirect="1"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Failed to load auth-redirect.js")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://www.witnessv2.net/static/auth-redirect.js";
    script.async = true;
    script.dataset.witnessAuthRedirect = "1";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load auth-redirect.js"));
    document.head.appendChild(script);
  });
}

async function checkWitnessAccess() {
    await ensureWitnessAuthRedirect();
    const token = localStorage.getItem("auth_token") || "";
    if (!token) {
      WitnessAuthRedirect.redirectToLogin(window.location.href);
      return false;
    }

    const res = await fetch("https://www.witnessv2.net/api/auth/me", {
      headers: { Authorization: "Bearer " + token }
    });
    const json = await res.json();

    if (!res.ok || !json.can_review_prayers) {
      WitnessAuthRedirect.redirectToLogin(window.location.href);
      return false;
    }

    const userEmail = json.email || "unknown";
    return { ok: true, user: json, userEmail };
  }

// WitnessV2 Squarespace Footer Harness
// - API harness (no button/UI locking)
// - Optional full-page access overlay for lesson pages
(function () {
  const WITNESS_DEBUG = true;
  const API_BASE = "https://www.witnessv2.net";
  const CTX_ENDPOINT = "/api/witness/course/context";
  const EVT_ENDPOINT = "/api/witness/course/event";
  const REF_ENDPOINT = "/api/witness/course/reflection";
  const PROG_ENDPOINT = "/api/witness/course/progress";
  const GATE_ENDPOINT = "/api/witness/course/gate";
  const PRAYER_REQUEST_ENDPOINT = "/api/witness/course/prayer/request";
  const PRAYER_GENERATE_ENDPOINT = "/api/witness/course/prayer/generate";
  const PRAYER_SUBMIT_ENDPOINT = "/api/witness/course/prayer/submit";
  const LT_STORAGE_KEY = "wv2_lt";
  const GATE_MILESTONE = "lesson_complete_page";
  const COMPLETE_EVENT_TYPE = "lesson_complete_page";
  const LOGIN_URL = API_BASE + "/login";
  const ACCESS_CHECK_TIMEOUT_MS = 12000;

  const nowIso = () => { try { return new Date().toISOString(); } catch (_) { return ""; } };

  function wv2Log() {
    if (!WITNESS_DEBUG) return;
    const args = Array.prototype.slice.call(arguments);
    try { console.log.apply(console, ["[wv2]"].concat(args)); } catch (_) {}
  }

  function errText(err) {
    try { return String((err && err.message) || err); } catch (_) { return "unknown error"; }
  }

  function buildLoginUrl() {
    const sourceValue = [
      window.location.host || "",
      window.location.pathname || "",
      window.location.search || ""
    ].join("");
    try {
      const target = new URL(LOGIN_URL);
      target.searchParams.set("source", sourceValue);
      return target.toString();
    } catch (_) {
      return LOGIN_URL + "?source=" + encodeURIComponent(sourceValue);
    }
  }

  function redirectToLogin() {
    window.location.href = buildLoginUrl();
  }

  function getLtAndStrip() {
    const url = new URL(window.location.href);
    let lt = url.searchParams.get("lt") || "";
    if (lt) {
      try { window.sessionStorage.setItem(LT_STORAGE_KEY, lt); } catch (_) {}
      url.searchParams.delete("lt");
      history.replaceState({}, document.title, url.toString());
      wv2Log("lt:from-query");
    } else {
      try {
        lt = String(window.sessionStorage.getItem(LT_STORAGE_KEY) || "").trim();
        if (lt) wv2Log("lt:restored-from-session");
      } catch (_) {}
    }
    return lt;
  }

  function parseCourseLessonFromPath(pathname) {
    const parts = String(pathname || "").split("/").filter(Boolean);
    if (parts.length >= 2) {
      const course_id = parts[0];
      const lesson_id = parts[1];
      if (course_id && lesson_id) return { course_id, lesson_id };
    }
    const i = parts.indexOf("dailywitness");
    if (i !== -1 && parts[i + 1] && parts[i + 2]) {
      return { course_id: parts[i + 1], lesson_id: parts[i + 2] };
    }
    return null;
  }

  async function callApi(lt, path, method, body) {
    if (!lt) throw new Error("Missing lt token.");
    const verb = String(method || "GET").toUpperCase();
    const isGet = verb === "GET";
    const headers = { Authorization: "Bearer " + lt };
    if (!isGet) headers["Content-Type"] = "application/json";
    wv2Log("api:start", verb, path);

    const resp = await fetch(API_BASE + path, {
      method: verb,
      headers,
      body: body ? JSON.stringify(body) : undefined
    });

    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      wv2Log("api:error", resp.status, path, json.error || json.detail || "request failed");
      throw new Error(String(resp.status) + " " + (json.error || json.detail || "request failed"));
    }
    wv2Log("api:ok", resp.status, path);
    return json;
  }

  async function playNarrationUrl(url) {
    if (!url) return false;
    try {
      const audio = new Audio(url);
      await audio.play();
      return true;
    } catch (_) {
      return false;
    }
  }

  function gatePath(params) {
    const q = new URLSearchParams();
    if (params && params.course_id) q.set("course_id", String(params.course_id));
    if (params && params.story_id) q.set("story_id", String(params.story_id));
    if (params && params.page) q.set("page", String(params.page));
    if (GATE_MILESTONE) q.set("milestone", GATE_MILESTONE);
    return GATE_ENDPOINT + "?" + q.toString();
  }

  async function initHarness() {
    wv2Log("init:start", location.pathname);

    const lt = getLtAndStrip();
    const ids = parseCourseLessonFromPath(location.pathname);
    wv2Log("init:parsed", { hasLt: !!lt, ids: ids || null });

    window.WitnessCourse = window.WitnessCourse || {};
    window.WitnessCourse._lt = lt;
    window.WitnessCourse._ids = ids;

    if (!lt || !ids) {
      wv2Log("init:exit-missing", { hasLt: !!lt, hasIds: !!ids });
      // Still define checker so overlay can use it.
      window.checkApiAccess = async function () { return false; };
      window.WitnessCourse.checkApiAccess = window.checkApiAccess;
      return;
    }

    let ctx = null;
    try {
      ctx = await callApi(lt, CTX_ENDPOINT, "GET");
      window.WitnessCourse._ctx = ctx;
    } catch (err) {
      wv2Log("context:error", errText(err));
    }

    try {
      await callApi(lt, EVT_ENDPOINT, "POST", {
        event_type: "lesson_viewed",
        course_id: ids.course_id,
        story_id: (ctx && ctx.story_id) || undefined,
        session_id: (ctx && ctx.session_id) || undefined,
        data: {
          lesson_id: ids.lesson_id,
          page: location.pathname,
          ts: nowIso(),
          source: "squarespace"
        }
      });
    } catch (err) {
      wv2Log("event:lesson_viewed:error", errText(err));
    }

    window.WitnessCourse.getContext = async function () {
      return await callApi(lt, CTX_ENDPOINT, "GET");
    };

    window.WitnessCourse.getGate = async function () {
      return await callApi(lt, gatePath({
        course_id: ids.course_id,
        story_id: (ctx && ctx.story_id) || undefined,
        page: location.pathname
      }), "GET");
    };

    // Access checker used by overlay.
    // Returns true when token+ids exist AND context+gate endpoints are reachable.
    // It does NOT require gate.unlocked; it only verifies API access/session validity.
    window.checkApiAccess = async function () {
      const state = {
        hasLt: !!lt,
        hasIds: !!ids,
        contextOk: false,
        gateOk: false,
        gateUnlocked: false,
        error: ""
      };

      if (!state.hasLt || !state.hasIds) {
        wv2Log("checkApiAccess:result", state, "ok", false);
        window.WitnessCourse._lastAccessCheck = state;
        return false;
      }

      try {
        const c = await window.WitnessCourse.getContext();
        state.contextOk = !!(c && c.ok);
      } catch (err) {
        state.error = "context: " + errText(err);
      }

      try {
        const g = await window.WitnessCourse.getGate();
        state.gateOk = !!g;
        state.gateUnlocked = !!(g && g.unlocked);
      } catch (err) {
        state.error = state.error
          ? (state.error + " | gate: " + errText(err))
          : ("gate: " + errText(err));
      }

      const ok = !!(state.contextOk && state.gateOk);
      window.WitnessCourse._lastAccessCheck = state;
      wv2Log("checkApiAccess:result", state, "ok", ok);
      return ok;
    };
    window.WitnessCourse.checkApiAccess = window.checkApiAccess;

    window.WitnessCourse.markLessonComplete = async function () {
      return await callApi(lt, EVT_ENDPOINT, "POST", {
        event_type: COMPLETE_EVENT_TYPE,
        course_id: ids.course_id,
        story_id: (ctx && ctx.story_id) || undefined,
        session_id: (ctx && ctx.session_id) || undefined,
        data: {
          lesson_id: ids.lesson_id,
          page: location.pathname,
          ts: nowIso(),
          source: "squarespace"
        }
      });
    };

    window.WitnessCourse.addReflection = async function (text) {
      const payloadText = String(text || "").trim();
      if (!payloadText) return { ok: false, error: "text required" };
      return await callApi(lt, REF_ENDPOINT, "POST", {
        text: payloadText,
        course_id: ids.course_id,
        story_id: (ctx && ctx.story_id) || undefined,
        session_id: (ctx && ctx.session_id) || undefined,
        created_at_local_str: new Date().toLocaleString(),
        time_zone: (Intl.DateTimeFormat().resolvedOptions().timeZone || "")
      });
    };

    window.WitnessCourse.requestPrayer = async function (text, category, urgency) {
      const bodyText = String(text || "").trim();
      if (!bodyText) return { ok: false, error: "request_text required" };
      return await callApi(lt, PRAYER_REQUEST_ENDPOINT, "POST", {
        request_text: bodyText,
        category: category || undefined,
        urgency: urgency || undefined,
        course_id: ids.course_id,
        story_id: (ctx && ctx.story_id) || undefined,
        session_id: (ctx && ctx.session_id) || undefined
      });
    };

    window.WitnessCourse.generatePrayer = async function (prompt) {
      const promptText = String(prompt || "").trim();
      if (!promptText) return { ok: false, error: "prompt required" };
      return await callApi(lt, PRAYER_GENERATE_ENDPOINT, "POST", {
        prompt: promptText,
        course_id: ids.course_id,
        story_id: (ctx && ctx.story_id) || undefined,
        session_id: (ctx && ctx.session_id) || undefined
      });
    };

    window.WitnessCourse.submitPrayer = async function (title, prayerText) {
      const cleanTitle = String(title || "").trim();
      const cleanText = String(prayerText || "").trim();
      if (!cleanTitle || !cleanText) {
        return { ok: false, error: "title and prayer_text required" };
      }
      return await callApi(lt, PRAYER_SUBMIT_ENDPOINT, "POST", {
        title: cleanTitle,
        prayer_text: cleanText,
        course_id: ids.course_id,
        story_id: (ctx && ctx.story_id) || undefined,
        session_id: (ctx && ctx.session_id) || undefined
      });
    };

    window.WitnessCourse.advanceTo = async function (nextNodeId, markCompleted, data, eventType) {
      const progressData = data && typeof data === "object" ? data : {};
      await callApi(lt, PROG_ENDPOINT, "POST", {
        course_id: ids.course_id,
        story_id: (ctx && ctx.story_id) || undefined,
        session_id: (ctx && ctx.session_id) || undefined,
        next_node_id: String(nextNodeId || "").trim() || undefined,
        mark_completed: markCompleted !== false,
        data: Object.assign({
          lesson_id: ids.lesson_id,
          page: location.pathname,
          ts: nowIso(),
          source: "squarespace"
        }, progressData)
      });
      return await callApi(lt, EVT_ENDPOINT, "POST", {
        event_type: String(eventType || "module_complete").trim() || "module_complete",
        course_id: ids.course_id,
        story_id: (ctx && ctx.story_id) || undefined,
        session_id: (ctx && ctx.session_id) || undefined,
        data: Object.assign({
          lesson_id: ids.lesson_id,
          page: location.pathname,
          ts: nowIso(),
          source: "squarespace"
        }, progressData)
      });
    };

    window.WitnessCourse.completeAndAdvance = async function () {
      return await window.WitnessCourse.advanceTo("__END__", true, null, "module_complete");
    };

    window.WitnessCourse.narrate = async function (text, prompt, voice) {
      const payloadText = String(text || "").trim();
      if (!payloadText) return { ok: false, error: "text required" };
      const qs = new URLSearchParams({
        text: payloadText,
        instructions: String(prompt || "").trim(),
        voice: String(voice || "alloy").trim().toLowerCase() || "alloy",
        response_format: "mp3"
      });
      const played = await playNarrationUrl(API_BASE + "/api/ai/tts?" + qs.toString());
      return { ok: played };
    };

    wv2Log("init:ready");
  }

  async function runOverlay() {
    if (!document.body) return;

    // Bypass for creator/admin editing contexts.
    const isEditing =
      document.body.classList.contains("sqs-edit-mode-active") ||
      window.location.search.includes("config=") ||
      (window.self !== window.top);
    if (isEditing) {
      wv2Log("overlay:bypass-editing");
      return;
    }

    if (!window.location.pathname.includes("/lesson-")) return;

    const overlay = document.createElement("div");
    overlay.id = "course-lock-overlay";
    overlay.innerHTML = "Verifying Course Access...";
    overlay.style.cssText = "position:fixed; inset:0; background:white; z-index:99999; display:flex; align-items:center; justify-content:center; font-family:sans-serif;";

    document.body.appendChild(overlay);
    document.body.style.overflow = "hidden";

    try {
      if (window.WitnessCourseReady) await window.WitnessCourseReady;
      const checker = (typeof window.checkApiAccess === "function")
        ? window.checkApiAccess
        : (window.WitnessCourse && window.WitnessCourse.checkApiAccess);

      if (typeof checker !== "function") {
        overlay.innerHTML = "Access checker unavailable. Redirecting...";
        redirectToLogin();
        return;
      }

      const hasAccess = await Promise.race([
        checker(),
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error("access check timeout")), ACCESS_CHECK_TIMEOUT_MS);
        })
      ]);
      if (hasAccess) {
        overlay.remove();
        document.body.style.overflow = "";
      } else {
        overlay.innerHTML = "Access Denied. Redirecting...";
        redirectToLogin();
      }
    } catch (err) {
      wv2Log("overlay:error", errText(err));
      overlay.innerHTML = "Access check failed. Redirecting...";
      redirectToLogin();
    }
  }

  if (document.readyState === "loading") {
    window.WitnessCourseReady = new Promise((resolve) => {
      document.addEventListener("DOMContentLoaded", async () => {
        await initHarness();
        resolve();
        await runOverlay();
      });
    });
  } else {
    window.WitnessCourseReady = (async () => {
      await initHarness();
      await runOverlay();
    })();
  }
})();

(function () {
  function fmt(seconds) {
    return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
  }

  function initCardPlayers(root) {
    const scope = root || document;
    scope.querySelectorAll('.card-player').forEach(player => {
      if (player.dataset.playerInit === '1') return;
      player.dataset.playerInit = '1';

      const source = (player.dataset.src || '').trim();
      const playBtn = player.querySelector('.play');
      const stopBtn = player.querySelector('.stop');
      const fill = player.querySelector('.card-player-progress-fill');
      const time = player.querySelector('.card-player-time');

      if (!source || !playBtn || !stopBtn || !fill || !time) {
        return;
      }

      const audio = new Audio(source);

      audio.addEventListener('timeupdate', () => {
        const pct = (audio.currentTime / (audio.duration || 1)) * 100;
        fill.style.width = `${pct}%`;
        time.textContent = `${fmt(audio.currentTime)} / ${fmt(audio.duration || 0)}`;
      });

      audio.addEventListener('ended', () => {
        playBtn.textContent = '▶';
        fill.style.width = '0%';
      });

      playBtn.addEventListener('click', async () => {
        if (audio.paused) {
          try {
            await audio.play();
            playBtn.textContent = '⏸';
          } catch (_) {
            playBtn.textContent = '▶';
          }
        } else {
          audio.pause();
          playBtn.textContent = '▶';
        }
      });

      stopBtn.addEventListener('click', () => {
        audio.pause();
        audio.currentTime = 0;
        playBtn.textContent = '▶';
        fill.style.width = '0%';
      });
    });
  }

  function runInit() {
    initCardPlayers(document);
  }

  window.WitnessInitCardPlayers = runInit;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runInit, { once: true });
  } else {
    runInit();
  }

  window.addEventListener('load', runInit);
  window.addEventListener('pageshow', runInit);
  window.addEventListener('popstate', runInit);

  const observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof Element)) continue;
        if (node.matches?.('.card-player')) {
          initCardPlayers(node.parentElement || document);
          continue;
        }
        if (node.querySelector?.('.card-player')) {
          initCardPlayers(node);
        }
      }
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();