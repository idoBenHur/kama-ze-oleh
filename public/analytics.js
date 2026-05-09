(function attachAnalytics(globalScope) {
  const state = {
    measurementId: "",
    initialized: false,
    disabled: false,
    pageViewSent: false,
    loadPromise: null
  };

  function sanitizeParams(params = {}) {
    const sanitized = {};

    Object.entries(params).forEach(([key, value]) => {
      if (typeof value === "number" && Number.isFinite(value)) {
        sanitized[key] = value;
        return;
      }

      if (typeof value === "string" && value.length) {
        sanitized[key] = value;
        return;
      }

      if (typeof value === "boolean") {
        sanitized[key] = value ? "true" : "false";
      }
    });

    return sanitized;
  }

  function ensureGtagStub() {
    globalScope.dataLayer = globalScope.dataLayer || [];

    if (typeof globalScope.gtag !== "function") {
      globalScope.gtag = function gtag() {
        globalScope.dataLayer.push(arguments);
      };
    }
  }

  function loadScript(measurementId) {
    if (state.loadPromise) {
      return state.loadPromise;
    }

    state.loadPromise = new Promise((resolve) => {
      const existingScript = document.querySelector("script[data-kzo-ga='true']");
      if (existingScript) {
        resolve(true);
        return;
      }

      const script = document.createElement("script");
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
      script.setAttribute("data-kzo-ga", "true");
      script.onload = () => resolve(true);
      script.onerror = () => {
        state.disabled = true;
        resolve(false);
      };

      document.head.append(script);
    });

    return state.loadPromise;
  }

  function trackEvent(eventName, params = {}) {
    if (state.disabled || !state.measurementId || typeof globalScope.gtag !== "function") {
      return;
    }

    try {
      globalScope.gtag("event", eventName, sanitizeParams(params));
    } catch {}
  }

  function trackInitialPageView() {
    if (state.pageViewSent || state.disabled || !state.measurementId) {
      return;
    }

    state.pageViewSent = true;
    trackEvent("page_view", {
      page_title: document.title,
      page_location: globalScope.location.href,
      page_path: globalScope.location.pathname
    });
  }

  function init(config = {}) {
    const measurementId =
      typeof config.gaMeasurementId === "string" ? config.gaMeasurementId.trim() : "";

    if (!measurementId) {
      return Promise.resolve(false);
    }

    if (state.initialized && state.measurementId === measurementId) {
      trackInitialPageView();
      return state.loadPromise ?? Promise.resolve(true);
    }

    state.measurementId = measurementId;
    state.initialized = true;
    state.disabled = false;

    ensureGtagStub();

    try {
      globalScope.gtag("js", new Date());
      globalScope.gtag("config", measurementId, {
        send_page_view: false
      });
      trackInitialPageView();
    } catch {
      state.disabled = true;
      return Promise.resolve(false);
    }

    return loadScript(measurementId);
  }

  globalScope.KZOAnalytics = Object.freeze({
    init,
    trackEvent
  });
})(window);
