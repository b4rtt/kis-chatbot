(() => {
  if (typeof window === "undefined") return;
  const FLAG = "__ESPORTS_CHAT_WIDGET__";
  if (window[FLAG]) return;
  window[FLAG] = true;

  const init = () => {
    const findScript = () => {
      if (document.currentScript) return document.currentScript;
      const scripts = Array.from(document.querySelectorAll("script"));
      for (let i = scripts.length - 1; i >= 0; i -= 1) {
        const el = scripts[i];
        if (el.src && el.src.includes("/embed/widget")) return el;
      }
      return null;
    };

    const scriptEl = findScript();
    if (!scriptEl) {
      console.warn("[eSports Bot] Widget script element not found.");
      return;
    }

    const dataset = scriptEl.dataset || {};
    const position =
      (dataset.position || "right").toLowerCase() === "left" ? "left" : "right";
    const width = dataset.width || "360px";
    const height = dataset.height || "520px";
    const offset = dataset.offset || "20px";
    const offsetX = dataset.offsetX || offset;
    const offsetY = dataset.offsetY || offset;
    const label = dataset.label || "Začni chat";
    const icon = dataset.icon || "💬";
    const accent = dataset.color || "#ff6200";
    const buttonText = dataset.buttonText || "#050608";
    const zIndex = dataset.zIndex || "2147483000";
    const iframeId = dataset.iframeId || "esports-chat-widget-frame";
    const radius = dataset.radius || "24px";
    const shadow =
      dataset.shadow ||
      "0 30px 60px rgba(5, 6, 8, 0.55), 0 10px 25px rgba(0, 0, 0, 0.25)";

    const resolvePanelUrl = () => {
      try {
        const base = dataset.panelUrl
          ? new URL(dataset.panelUrl, window.location.href)
          : new URL("./panel", scriptEl.src || window.location.href);
        const params = new URLSearchParams(base.search);
        if (dataset.color && !params.has("accent")) params.set("accent", dataset.color);
        if (dataset.title && !params.has("title")) params.set("title", dataset.title);
        if (dataset.subtitle && !params.has("subtitle"))
          params.set("subtitle", dataset.subtitle);
        base.search = params.toString();
        return base.toString();
      } catch (error) {
        console.warn("[eSports Bot] Falling back to default panel URL.", error);
        return "/embed/panel";
      }
    };

    const iframeSrc = resolvePanelUrl();

    const container = document.createElement("div");
    container.id = dataset.containerId || "esports-chat-widget";
    container.style.position = "fixed";
    container.style.bottom = offsetY;
    container.style[position] = offsetX;
    container.style.zIndex = zIndex;
    container.style.display = "flex";
    container.style.flexDirection = "column";
    container.style.alignItems = position === "left" ? "flex-start" : "flex-end";
    container.style.gap = "12px";
    container.style.fontFamily =
      "'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

    const panelWrapper = document.createElement("div");
    panelWrapper.style.width = width;
    panelWrapper.style.maxWidth = `min(100vw - 32px, ${width})`;
    panelWrapper.style.height = height;
    panelWrapper.style.maxHeight = `min(90vh, ${height})`;
    panelWrapper.style.borderRadius = radius;
    panelWrapper.style.boxShadow = shadow;
    panelWrapper.style.overflow = "hidden";
    panelWrapper.style.background = "#050608";
    panelWrapper.style.transformOrigin =
      position === "left" ? "bottom left" : "bottom right";
    panelWrapper.style.transform = "scale(0.96)";
    panelWrapper.style.opacity = "0";
    panelWrapper.style.pointerEvents = "none";
    panelWrapper.style.transition =
      "opacity 180ms ease, transform 180ms ease, filter 180ms ease";
    panelWrapper.style.border = "1px solid rgba(255, 255, 255, 0.08)";
    panelWrapper.style.visibility = "hidden";

    const iframe = document.createElement("iframe");
    iframe.src = iframeSrc;
    iframe.id = iframeId;
    iframe.title = dataset.iframeTitle || "Chatbot";
    iframe.setAttribute("role", "document");
    iframe.style.width = "100%";
    iframe.style.height = "100%";
    iframe.style.border = "0";
    iframe.style.background = "transparent";

    panelWrapper.appendChild(iframe);

    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("aria-haspopup", "dialog");
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-controls", iframeId);
    button.style.border = "none";
    button.style.cursor = "pointer";
    button.style.borderRadius = "999px";
    button.style.padding = "14px 18px";
    button.style.fontWeight = "600";
    button.style.fontSize = "0.95rem";
    button.style.display = "inline-flex";
    button.style.alignItems = "center";
    button.style.gap = "10px";
    button.style.background = accent;
    button.style.color = buttonText;
    button.style.boxShadow = "0 18px 30px rgba(5, 6, 8, 0.35)";
    button.style.transition = "transform 120ms ease, box-shadow 120ms ease";
    button.style.minHeight = "52px";

    const iconEl = document.createElement("span");
    iconEl.textContent = icon;
    iconEl.style.fontSize = "1.2rem";
    const labelEl = document.createElement("span");
    labelEl.textContent = label;

    button.appendChild(iconEl);
    button.appendChild(labelEl);

    let isOpen = false;
    const setOpen = (value) => {
      if (isOpen === value) return;
      isOpen = value;
      panelWrapper.style.opacity = value ? "1" : "0";
      panelWrapper.style.pointerEvents = value ? "auto" : "none";
      panelWrapper.style.transform = value ? "scale(1)" : "scale(0.96)";
      panelWrapper.style.visibility = value ? "visible" : "hidden";
      button.setAttribute("aria-expanded", String(value));
      button.style.transform = value ? "translateY(2px)" : "translateY(0)";
      button.style.boxShadow = value
        ? "0 14px 26px rgba(5, 6, 8, 0.4)"
        : "0 18px 30px rgba(5, 6, 8, 0.35)";
    };

    button.addEventListener("click", () => {
      setOpen(!isOpen);
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && isOpen) {
        setOpen(false);
      }
    });

    const api = {
      open: () => setOpen(true),
      close: () => setOpen(false),
      toggle: () => setOpen(!isOpen),
    };

    window.addEventListener("message", (event) => {
      if (!event.data || typeof event.data !== "object") return;
      switch (event.data.type) {
        case "esports-chat-close":
          api.close();
          button.focus();
          break;
        case "esports-chat-open":
          api.open();
          break;
        case "esports-chat-toggle":
          api.toggle();
          break;
        default:
          break;
      }
    });

    window.esportsChatWidget = api;

    container.appendChild(panelWrapper);
    container.appendChild(button);
    document.body.appendChild(container);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
