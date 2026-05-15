const MS_PER_DAY = 24 * 60 * 60 * 1000;
const AVG_DAYS_PER_MONTH = 30.4375;

const tiers = [
  { name: "Copper", min: 0, rate: 1 },
  { name: "Silver", min: 150, rate: 1.25 },
  { name: "Gold", min: 500, rate: 1.5 },
];

let entries = [];
const themeStorageKey = "keepclub-theme";

const els = {
  uploadPanel: document.querySelector(".upload-panel"),
  fileInput: document.querySelector("#fileInput"),
  fileName: document.querySelector("#fileName"),
  sampleButton: document.querySelector("#sampleButton"),
  downloadExampleButton: document.querySelector("#downloadExampleButton"),
  clearButton: document.querySelector("#clearButton"),
  themeToggle: document.querySelector("#themeToggle"),
  themeToggleIcon: document.querySelector("#themeToggle .theme-icon"),
  themeToggleLabel: document.querySelector("#themeToggle .theme-label"),
  fileStatus: document.querySelector("#fileStatus"),
  fileStatusText: document.querySelector("#fileStatusText"),
  countTowardsTierOnly: document.querySelector("#countTowardsTierOnly"),
  trackingBody: document.querySelector("#trackingBody"),
  tableCaption: document.querySelector("#tableCaption"),
  summaryTierCard: document.querySelector("#summaryTierCard"),
  summaryTier: document.querySelector("#summaryTier"),
  summaryProgressFill: document.querySelector("#summaryProgressFill"),
  summaryProgressLabel: document.querySelector("#summaryProgressLabel"),
  summaryWindowPoints: document.querySelector("#summaryWindowPoints"),
  summaryUnexpiredPoints: document.querySelector("#summaryUnexpiredPoints"),
  summaryNextDropout: document.querySelector("#summaryNextDropout"),
  summaryNextExpiration: document.querySelector("#summaryNextExpiration"),
  manualPoints: document.querySelector("#manualPoints"),
  useCalculatedButton: document.querySelector("#useCalculatedButton"),
  calcTier: document.querySelector("#calcTier"),
  calcMissing: document.querySelector("#calcMissing"),
  calcRate: document.querySelector("#calcRate"),
  calcSpending: document.querySelector("#calcSpending"),
  tierChips: document.querySelectorAll(".tier-chip"),
};

let exampleRowsPromise = null;
let exampleTextPromise = null;

function parseDelimited(text) {
  const delimiter = text.includes("\t") && text.split("\t").length > text.split(",").length ? "\t" : ",";
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && quoted && next === '"') {
      cell += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function normalizeHeader(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function rowsToEntries(rows) {
  if (!rows.length) return [];

  const header = rows[0].map(normalizeHeader);
  const find = (names) => header.findIndex((column) => names.includes(column));
  const dateIndex = find(["date"]);
  const challengeIndex = find(["challenge", "activity", "description"]);
  const pointsIndex = find(["points", "point"]);
  const approvedIndex = find(["approved", "status"]);

  if (dateIndex === -1 || challengeIndex === -1 || pointsIndex === -1 || approvedIndex === -1) {
    throw new Error("Expected columns: Date, Challenge, Points, Approved.");
  }

  return rows.slice(1).map((row) => ({
    date: parseDate(row[dateIndex]),
    challenge: row[challengeIndex] || "Untitled challenge",
    points: Number(String(row[pointsIndex] || "0").replace(/[^0-9.-]/g, "")) || 0,
    approved: row[approvedIndex] || "",
  })).filter((entry) => entry.date);
}

function parseDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return localDate(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));

  const dotted = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (dotted) return localDate(Number(dotted[3]), Number(dotted[2]) - 1, Number(dotted[1]));

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return localDate(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

function localDate(year, month, day) {
  return new Date(year, month, day);
}

function today() {
  const now = new Date();
  return localDate(now.getFullYear(), now.getMonth(), now.getDate());
}

function addMonths(date, months) {
  const result = new Date(date);
  const originalDay = result.getDate();
  result.setDate(1);
  result.setMonth(result.getMonth() + months);
  const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(originalDay, lastDay));
  return result;
}

function monthCeiling(from, to) {
  if (to < from) return null;
  const days = (to - from) / MS_PER_DAY;
  return Math.ceil((days / AVG_DAYS_PER_MONTH) * 4) / 4;
}

function isApproved(value) {
  return ["approved", "true", "yes", "y", "1"].includes(String(value || "").trim().toLowerCase());
}

function analyzeEntry(entry) {
  const current = today();
  const windowStart = addMonths(current, -12);
  const expiryDate = addMonths(entry.date, 36);
  const dropoutDate = addMonths(entry.date, 12);
  const approvedForCalculations = isApproved(entry.approved);
  const countsTowardTier = approvedForCalculations && entry.date >= windowStart && entry.date <= current;

  return {
    ...entry,
    approvedForCalculations,
    countsTowardTier,
    expiryDate,
    expiresInMonths: monthCeiling(current, expiryDate),
    dropoutDate,
    dropsOutInMonths: monthCeiling(current, dropoutDate),
  };
}

function getTier(points) {
  return tiers.reduce((best, tier) => (points >= tier.min ? tier : best), tiers[0]);
}

function getNextTier(points) {
  return tiers.find((tier) => tier.min > points) || null;
}

function getTierProgress(points) {
  const tier = getTier(points);
  const next = getNextTier(points);
  if (!next) {
    return {
      percent: 100,
      label: "Top tier reached",
      tier,
    };
  }

  return {
    percent: Math.min(100, Math.max(0, (points / next.min) * 100)),
    label: `${next.min - points} points to ${next.name}`,
    tier,
  };
}

function formatDate(date) {
  return date ? new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(date) : "-";
}

function formatMonths(value, expiredLabel) {
  if (value === null) return expiredLabel;
  if (value === 0) return "0";
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatMoney(value) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "EUR" }).format(value);
}

function getPreferredTheme() {
  const storedTheme = localStorage.getItem(themeStorageKey);
  if (storedTheme === "light" || storedTheme === "dark") return storedTheme;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  if (els.themeToggleIcon) {
    els.themeToggleIcon.textContent = theme === "dark"
      ? String.fromCodePoint(9728)
      : String.fromCodePoint(9789);
  }
  if (els.themeToggleLabel) {
    els.themeToggleLabel.textContent = theme === "dark" ? "Light mode" : "Dark mode";
  }
  els.themeToggle.setAttribute("aria-pressed", String(theme === "dark"));
  localStorage.setItem(themeStorageKey, theme);
}

function render() {
  const analyzed = entries.map(analyzeEntry).sort((a, b) => b.date - a.date);
  const shown = els.countTowardsTierOnly.checked ? analyzed.filter((entry) => entry.countsTowardTier) : analyzed;
  const windowPoints = analyzed
    .filter((entry) => entry.countsTowardTier)
    .reduce((total, entry) => total + entry.points, 0);
  const unexpiredPoints = analyzed
    .filter((entry) => entry.approvedForCalculations && entry.expiresInMonths !== null)
    .reduce((total, entry) => total + entry.points, 0);
  const nextDropout = analyzed
    .filter((entry) => entry.countsTowardTier && entry.dropsOutInMonths !== null)
    .sort((a, b) => a.dropoutDate - b.dropoutDate)[0];
  const nextExpiration = analyzed
    .filter((entry) => entry.countsTowardTier && entry.expiresInMonths !== null)
    .sort((a, b) => a.expiryDate - b.expiryDate)[0];

  const progress = getTierProgress(windowPoints);

  els.summaryTier.textContent = progress.tier.name;
  els.summaryTierCard.dataset.tier = progress.tier.name.toLowerCase();
  els.summaryProgressFill.style.width = `${progress.percent}%`;
  els.summaryProgressLabel.textContent = progress.label;
  els.summaryWindowPoints.textContent = String(windowPoints);
  els.summaryUnexpiredPoints.textContent = String(unexpiredPoints);
  els.summaryNextDropout.textContent = nextDropout ? formatDate(nextDropout.dropoutDate) : "-";
  els.summaryNextExpiration.textContent = nextExpiration ? formatDate(nextExpiration.expiryDate) : "-";
  els.tableCaption.textContent = entries.length
    ? `${shown.length} shown, ${entries.length} loaded. Calculations use today's date.`
    : "Load an export to calculate each point entry.";

  if (!shown.length) {
    els.trackingBody.innerHTML = '<tr><td colspan="9" class="empty-state">No matching rows.</td></tr>';
  } else {
    els.trackingBody.innerHTML = shown.map((entry) => {
      const statusClass = entry.approvedForCalculations ? "good" : "bad";
      const countClass = entry.countsTowardTier ? "good" : "warn";
      return `
        <tr>
          <td>${formatDate(entry.date)}</td>
          <td class="challenge">${escapeHtml(entry.challenge)}</td>
          <td><span class="badge ${statusClass}">${escapeHtml(entry.approved || "Unknown")}</span></td>
          <td class="numeric">${entry.points}</td>
          <td><span class="badge ${countClass}">${entry.countsTowardTier ? "Yes" : "No"}</span></td>
          <td class="numeric">${formatMonths(entry.dropsOutInMonths, "Already dropped out")}</td>
          <td>${entry.dropsOutInMonths === null ? "Already dropped out" : formatDate(entry.dropoutDate)}</td>
          <td class="numeric">${formatMonths(entry.expiresInMonths, "Expired")}</td>
          <td>${formatDate(entry.expiryDate)}</td>
        </tr>
      `;
    }).join("");
  }

  if (entries.length) {
    els.manualPoints.value = String(windowPoints);
  }
  renderCalculator();
}

function renderCalculator() {
  const points = Math.max(0, Number(els.manualPoints.value) || 0);
  const tier = getTier(points);
  const next = getNextTier(points);
  const missing = next ? Math.max(0, next.min - points) : 0;
  const spending = tier.rate ? missing / tier.rate : 0;

  els.calcTier.textContent = tier.name;
  els.calcMissing.textContent = next ? String(missing) : "Top tier reached";
  els.calcRate.textContent = tier.rate.toLocaleString(undefined, { maximumFractionDigits: 2 });
  els.calcSpending.textContent = next ? formatMoney(spending) : formatMoney(0);
  els.tierChips.forEach((chip) => {
    chip.classList.toggle("is-active", chip.dataset.tier === tier.name.toLowerCase());
  });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[char]));
}

function loadRows(rows, label) {
  entries = rowsToEntries(rows);
  els.fileStatusText.textContent = `${label}: ${entries.length} valid rows loaded.`;
  els.fileName.textContent = label;
  els.uploadPanel.dataset.state = "loaded";
  els.downloadExampleButton.hidden = label !== "Example TSV";
  render();
}

async function loadExampleRows() {
  if (!exampleRowsPromise) {
    exampleRowsPromise = loadExampleText().then((text) => parseDelimited(text));
  }

  return exampleRowsPromise;
}

async function loadExampleText() {
  if (!exampleTextPromise) {
    exampleTextPromise = fetch("data/example.tsv")
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Unable to load example TSV: ${response.status}`);
        }
        return response.text();
      });
  }

  return exampleTextPromise;
}

els.fileInput.addEventListener("change", async (event) => {
  const [file] = event.target.files;
  if (!file) return;

  try {
    const text = await file.text();
    loadRows(parseDelimited(text), file.name);
  } catch (error) {
    entries = [];
    els.fileStatusText.textContent = error.message;
    els.fileName.textContent = file.name;
    els.uploadPanel.dataset.state = "error";
    els.downloadExampleButton.hidden = true;
    render();
  }
});

els.sampleButton.addEventListener("click", () => {
  loadExampleRows()
    .then((rows) => loadRows(rows, "Example TSV"))
    .catch((error) => {
      entries = [];
      els.fileStatusText.textContent = error.message;
      els.fileName.textContent = "Example TSV";
      els.uploadPanel.dataset.state = "error";
      els.downloadExampleButton.hidden = true;
      render();
    });
});

els.downloadExampleButton.addEventListener("click", () => {
  loadExampleText()
    .then((text) => {
      const blob = new Blob([text], { type: "text/tab-separated-values;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "example.tsv";
      link.rel = "noopener";
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    })
    .catch((error) => {
      els.fileStatusText.textContent = error.message;
      els.uploadPanel.dataset.state = "error";
      els.downloadExampleButton.hidden = true;
    });
});

els.clearButton.addEventListener("click", () => {
  entries = [];
  els.fileInput.value = "";
  els.fileName.textContent = "No file selected";
  els.uploadPanel.dataset.state = "empty";
  els.fileStatusText.textContent = "No export loaded.";
  els.downloadExampleButton.hidden = true;
  render();
});

els.countTowardsTierOnly.addEventListener("change", render);

els.manualPoints.addEventListener("input", renderCalculator);

els.useCalculatedButton.addEventListener("click", () => {
  const points = entries
    .map(analyzeEntry)
    .filter((entry) => entry.countsTowardTier)
    .reduce((total, entry) => total + entry.points, 0);
  els.manualPoints.value = String(points);
  renderCalculator();
});

els.themeToggle.addEventListener("click", () => {
  const currentTheme = document.documentElement.dataset.theme || getPreferredTheme();
  applyTheme(currentTheme === "dark" ? "light" : "dark");
});

function clearRowHighlights() {
  document.querySelectorAll("#trackingBody tr.marked").forEach((row) => {
    row.classList.remove("marked");
  });
}

function markRowsByDate(dateValues) {
  const dates = new Set((Array.isArray(dateValues) ? dateValues : [dateValues])
    .map((value) => String(value || "").trim())
    .filter((value) => value && value !== "-"));

  if (!dates.size) {
    clearRowHighlights();
    return;
  }

  clearRowHighlights();
  const rows = document.querySelectorAll("#trackingBody tr");
  rows.forEach((row) => {
    const cells = row.querySelectorAll("td");
    const entryDate = cells[0]?.textContent.trim();
    const dropoutDate = cells[6]?.textContent.trim();
    const expiryDate = cells[8]?.textContent.trim();
    if (dates.has(entryDate) || dates.has(dropoutDate) || dates.has(expiryDate)) {
      row.classList.add("marked");
    }
  });
}

document.querySelectorAll(".metric-btn").forEach((button) => {
  button.addEventListener("click", () => {
    const isActive = button.classList.toggle("active");
    button.setAttribute("aria-pressed", String(isActive));
    const dateValues = [...button.querySelectorAll("strong")]
      .map((dateElement) => dateElement.textContent.trim());
    
    // Deactivate all other metric-btn buttons
    document.querySelectorAll(".metric-btn.active").forEach((otherButton) => {
      if (otherButton !== button) {
        otherButton.classList.remove("active");
        otherButton.setAttribute("aria-pressed", "false");
      }
    });
    
    if (isActive) {
      markRowsByDate(dateValues);
    } else {
      clearRowHighlights();
    }
  });
});

applyTheme(getPreferredTheme());

els.uploadPanel.dataset.state = "empty";

render();
