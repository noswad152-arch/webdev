/**
 * Witness V2 Authentication Redirect Utility
 * 
 * Provides shared utilities for handling redirects to login with source URL preservation.
 * This ensures users are returned to their original destination after login.
 * 
 * Usage:
 *   - In pages that require authentication, call: WitnessAuthRedirect.requireLogin()
 *   - For custom redirects: WitnessAuthRedirect.redirectToLogin(sourceUrl)
 *   - To handle externally-referred pages: WitnessAuthRedirect.handleExternalRedirect()
 */

(function() {
  const WitnessAuthRedirect = window.WitnessAuthRedirect || {};

  function _config() {
    return window.WitnessAuthRedirectConfig || {};
  }

  function _safeUrl(raw, base) {
    try {
      return new URL(String(raw || ""), base || window.location.href);
    } catch (_) {
      return null;
    }
  }

  function _scriptOrigin() {
    const current = (document && document.currentScript && document.currentScript.src) || "";
    const parsed = _safeUrl(current, window.location.href);
    return (parsed && parsed.origin) || window.location.origin;
  }

  function _scriptTagOrigin() {
    try {
      const scripts = Array.from(document.getElementsByTagName("script") || []);
      for (let i = scripts.length - 1; i >= 0; i -= 1) {
        const src = String((scripts[i] && scripts[i].src) || "").trim();
        if (!src) continue;
        if (!/auth-redirect(\.min)?\.js(?:\?.*)?$/i.test(src)) continue;
        const parsed = _safeUrl(src, window.location.href);
        if (parsed && parsed.origin) return parsed.origin;
      }
    } catch (_) {}
    return "";
  }

  function _authOrigin() {
    const config = _config();
    const configured = String(config.authOrigin || "").trim();
    if (configured) {
      const parsed = _safeUrl(configured, window.location.href);
      if (parsed) return parsed.origin;
    }

    const discoveredScriptOrigin = _scriptOrigin();
    if (discoveredScriptOrigin && discoveredScriptOrigin !== window.location.origin) {
      return discoveredScriptOrigin;
    }

    const tagOrigin = _scriptTagOrigin();
    if (tagOrigin && tagOrigin !== window.location.origin) {
      return tagOrigin;
    }

    const globalDefault = String(window.WITNESS_AUTH_ORIGIN || "").trim();
    if (globalDefault) {
      const parsed = _safeUrl(globalDefault, window.location.href);
      if (parsed) return parsed.origin;
    }

    // Safe hard default for partner-hosted pages.
    return "https://www.witnessv2.net";
  }

  function _loginUrl() {
    const config = _config();
    const explicit = String(config.loginUrl || "").trim();
    if (explicit) {
      const parsed = _safeUrl(explicit, _authOrigin());
      if (parsed) return parsed.toString();
    }
    return new URL("/login", _authOrigin()).toString();
  }

  function _apiBase() {
    const config = _config();
    const explicit = String(config.apiBase || "").trim();
    if (explicit) {
      const parsed = _safeUrl(explicit, _authOrigin());
      if (parsed) return parsed.origin;
    }
    return _authOrigin();
  }

  function _consumeAuthFromUrl() {
    try {
      const url = new URL(window.location.href);
      const authToken = String(url.searchParams.get("auth_token") || url.searchParams.get("token") || "").trim();
      const refreshToken = String(url.searchParams.get("refresh_token") || "").trim();
      const userEmail = String(url.searchParams.get("user_email") || url.searchParams.get("email") || "").trim();
      const firstLoginToday = String(url.searchParams.get("first_login_today") || "").trim().toLowerCase();

      if (!authToken && !refreshToken && !userEmail && !firstLoginToday) {
        return false;
      }

      if (authToken) localStorage.setItem("auth_token", authToken);
      if (refreshToken) localStorage.setItem("refresh_token", refreshToken);
      if (userEmail) localStorage.setItem("user_email", userEmail);
      if (firstLoginToday === "true" || firstLoginToday === "1") {
        localStorage.setItem("first_login_today", "true");
      }

      url.searchParams.delete("auth_token");
      url.searchParams.delete("token");
      url.searchParams.delete("refresh_token");
      url.searchParams.delete("user_email");
      url.searchParams.delete("email");
      url.searchParams.delete("first_login_today");
      try {
        window.history.replaceState({}, document.title, url.toString());
      } catch (_) {}
      return true;
    } catch (_) {
      return false;
    }
  }

  /**
   * Builds a login URL with source parameter encoding the current location
   * @param {string} sourceUrl - Optional source URL to redirect back to after login (defaults to current location)
   * @returns {string} - Full login URL with source parameter
   */
  WitnessAuthRedirect.buildLoginUrl = function(sourceUrl) {
    try {
      const source = sourceUrl || [
        (window.location.host || ""),
        (window.location.pathname || ""),
        (window.location.search || "")
      ].join("");

      const url = new URL(_loginUrl());
      url.searchParams.set("source", source);
      return url.toString();
    } catch (err) {
      console.warn("[auth-redirect] Error building login URL", err);
      return _loginUrl() + "?source=" + encodeURIComponent(sourceUrl || window.location.href);
    }
  };

  /**
   * Redirects to login page with source parameter
   * @param {string} sourceUrl - Optional source URL to return to after login
   */
  WitnessAuthRedirect.redirectToLogin = function(sourceUrl) {
    window.location.href = WitnessAuthRedirect.buildLoginUrl(sourceUrl);
  };

  /**
   * Checks if user has valid auth token in localStorage
   * @returns {boolean}
   */
  WitnessAuthRedirect.hasToken = function() {
    _consumeAuthFromUrl();
    return !!(localStorage.getItem("auth_token") || "").trim();
  };

  /**
   * Validates token by calling /api/auth/me endpoint
   * @returns {Promise<boolean>}
   */
  WitnessAuthRedirect.validateToken = async function() {
    const token = (localStorage.getItem("auth_token") || "").trim();
    if (!token) return false;
    
    try {
      const authMeUrl = new URL("/api/auth/me", _apiBase()).toString();
      const resp = await fetch(authMeUrl, {
        headers: { Authorization: "Bearer " + token }
      });
      return resp.ok;
    } catch (err) {
      console.warn("[auth-redirect] Token validation failed", err);
      return false;
    }
  };

  /**
   * Main function for pages that require authentication
   * Redirects to login if token is missing or invalid
   * @param {string} redirectUrl - Optional custom redirect destination
   * @returns {Promise<boolean>} - true if user is authenticated, false if redirected
   */
  WitnessAuthRedirect.requireLogin = async function(redirectUrl) {
    if (!WitnessAuthRedirect.hasToken()) {
      WitnessAuthRedirect.redirectToLogin(redirectUrl);
      return false;
    }
    
    if (!await WitnessAuthRedirect.validateToken()) {
      WitnessAuthRedirect.redirectToLogin(redirectUrl);
      return false;
    }
    
    return true;
  };

  /**
   * Handles first-time redirects from external sites
   * Stores the referring source for later retrieval
   * @returns {string} - The source URL that was stored, or empty string
   */
  WitnessAuthRedirect.handleExternalRedirect = function() {
    try {
      const url = new URL(window.location.href);
      const source = url.searchParams.get("source") || "";
      if (source) {
        sessionStorage.setItem("auth_redirect_source", source);
      }
      return source;
    } catch (err) {
      console.warn("[auth-redirect] Error handling external redirect", err);
      return "";
    }
  };

  /**
   * Retrieves and clears the stored external redirect source
   * @returns {string} - The stored redirect source, or empty string
   */
  WitnessAuthRedirect.getStoredRedirectSource = function() {
    try {
      const source = sessionStorage.getItem("auth_redirect_source") || "";
      if (source) {
        sessionStorage.removeItem("auth_redirect_source");
      }
      return source;
    } catch (err) {
      return "";
    }
  };

  /**
   * Logs authentication redirect activity for debugging
   * @param {string} message - Log message
   * @param {*} extra - Additional context data
   */
  WitnessAuthRedirect.log = function(message, extra) {
    const prefix = "[WitnessAuthRedirect]";
    if (extra !== undefined) {
      console.log(prefix, message, extra);
    } else {
      console.log(prefix, message);
    }
  };

  WitnessAuthRedirect.getAuthOrigin = function() {
    return _authOrigin();
  };

  WitnessAuthRedirect.getApiBase = function() {
    return _apiBase();
  };

  WitnessAuthRedirect.getLoginUrl = function() {
    return _loginUrl();
  };

  WitnessAuthRedirect.getResolvedConfig = function() {
    return {
      config: _config(),
      authOrigin: _authOrigin(),
      apiBase: _apiBase(),
      loginUrl: _loginUrl(),
      pageOrigin: window.location.origin,
      currentScript: (document && document.currentScript && document.currentScript.src) || "",
    };
  };

  WitnessAuthRedirect.consumeAuthFromUrl = function() {
    return _consumeAuthFromUrl();
  };

  // Export to window
  _consumeAuthFromUrl();
  window.WitnessAuthRedirect = WitnessAuthRedirect;
  if (window.console) {
    WitnessAuthRedirect.log("Initialized");
  }
})();
