(function() {
  const JSON_URL = "https://www.witnessv2.net/static/daily.json";
  const STORAGE_KEY = "dw_daily_index";
  const DATE_KEY = "dw_daily_date";

  async function loadJSON() {
    try {
      const response = await fetch(JSON_URL);
      const items = await response.json();

      const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
      const storedDate = localStorage.getItem(DATE_KEY);
      let index;

      if (storedDate === today) {
        // Use the stored index
        index = parseInt(localStorage.getItem(STORAGE_KEY), 10);
      } else {
        // Pick a new random index
        index = Math.floor(Math.random() * items.length);
        localStorage.setItem(STORAGE_KEY, index);
        localStorage.setItem(DATE_KEY, today);
      }

      const item = items[index];
      renderCard(item);

    } catch (err) {
      console.error("Daily Witness JSON error:", err);
    }
  }

  function renderCard(item) {
    const container = document.getElementById("daily-witness");
    if (!container) return;

    container.innerHTML = `
      <div class="daily-witness-card">
        <h3 class="dw-heading">${item.mantra}</h3>

        <p class="dw-scripture">
          <strong>${item.ref}</strong><br>
          ${item.verse}
        </p>

        <div class="daily-witness-carry">${item.mantra}</div>

        <p class="daily-witness-prayer">${item.prayer}</p>

        <div class="daily-witness-sigil">✶</div>
      </div>
    `;

    injectStyles();
  }

  function injectStyles() {
    if (document.getElementById("daily-witness-style")) return;

    const style = document.createElement("style");
    style.id = "daily-witness-style";
    style.textContent = `
      :root {
        --bg: #0c1117;
        --panel: rgba(255, 255, 255, 0.03);
        --muted: #9aa7b8;
        --accent: #e7b86f;
        --border: rgba(231, 184, 111, 0.45);
        --font-body: Georgia, "Times New Roman", serif;
        --font-heading: "Cinzel", Georgia, serif;
        --font-ui: system-ui, -apple-system, "Segoe UI", sans-serif;
        --glow: radial-gradient(600px 400px at 20% 0%, rgba(231,184,111,0.12), transparent 70%);
      }

      .daily-witness-card {
        background: var(--panel);
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 16px 18px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.35);
        background-image: var(--glow);
        max-width: 360px;
        margin: 0 auto;
      }

      .dw-heading {
        font-family: var(--font-heading);
        font-size: 1.05rem;
        letter-spacing: 0.5px;
        margin: 0 0 8px;
        color: var(--accent);
      }

      .dw-scripture {
        font-family: var(--font-body);
        font-size: 0.95rem;
        color: var(--muted);
        margin: 0 0 10px;
      }

      .daily-witness-carry {
        border-left: 2px solid var(--accent);
        padding-left: 10px;
        font-style: italic;
        color: var(--accent);
        margin: 12px 0;
        font-family: var(--font-body);
      }

      .daily-witness-prayer {
        font-family: var(--font-body);
        font-size: 0.9rem;
        color: var(--muted);
        margin-top: 10px;
        opacity: 0.9;
      }

      .daily-witness-sigil {
        text-align: center;
        margin-top: 14px;
        font-family: var(--font-heading);
        font-size: 0.8rem;
        color: var(--border);
        opacity: 0.7;
      }
    `;

    document.head.appendChild(style);
  }

  loadJSON();
})();
