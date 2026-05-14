const MS_PER_DAY = 24 * 60 * 60 * 1000;
const AVG_DAYS_PER_MONTH = 30.4375;

const tiers = [
  { name: "Copper", min: 0, rate: 1 },
  { name: "Silver", min: 150, rate: 1.25 },
  { name: "Gold", min: 500, rate: 1.5 },
];

let entries = [];

const els = {
  fileInput: document.querySelector("#fileInput"),
  sampleButton: document.querySelector("#sampleButton"),
  clearButton: document.querySelector("#clearButton"),
  fileStatus: document.querySelector("#fileStatus"),
  approvedOnly: document.querySelector("#approvedOnly"),
  trackingBody: document.querySelector("#trackingBody"),
  tableCaption: document.querySelector("#tableCaption"),
  summaryTier: document.querySelector("#summaryTier"),
  summaryWindowPoints: document.querySelector("#summaryWindowPoints"),
  summaryUnexpiredPoints: document.querySelector("#summaryUnexpiredPoints"),
  summaryNextDropout: document.querySelector("#summaryNextDropout"),
  manualPoints: document.querySelector("#manualPoints"),
  useCalculatedButton: document.querySelector("#useCalculatedButton"),
  calcTier: document.querySelector("#calcTier"),
  calcMissing: document.querySelector("#calcMissing"),
  calcRate: document.querySelector("#calcRate"),
  calcSpending: document.querySelector("#calcSpending"),
};

let exampleRowsPromise = null;

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

function render() {
  const analyzed = entries.map(analyzeEntry).sort((a, b) => b.date - a.date);
  const shown = els.approvedOnly.checked ? analyzed.filter((entry) => entry.approvedForCalculations) : analyzed;
  const windowPoints = analyzed
    .filter((entry) => entry.countsTowardTier)
    .reduce((total, entry) => total + entry.points, 0);
  const unexpiredPoints = analyzed
    .filter((entry) => entry.approvedForCalculations && entry.expiresInMonths !== null)
    .reduce((total, entry) => total + entry.points, 0);
  const nextDropout = analyzed
    .filter((entry) => entry.countsTowardTier && entry.dropsOutInMonths !== null)
    .sort((a, b) => a.dropoutDate - b.dropoutDate)[0];

  els.summaryTier.textContent = getTier(windowPoints).name;
  els.summaryWindowPoints.textContent = String(windowPoints);
  els.summaryUnexpiredPoints.textContent = String(unexpiredPoints);
  els.summaryNextDropout.textContent = nextDropout ? formatDate(nextDropout.dropoutDate) : "-";
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
          <td class="numeric">${formatMonths(entry.expiresInMonths, "Expired")}</td>
          <td>${formatDate(entry.expiryDate)}</td>
          <td class="numeric">${formatMonths(entry.dropsOutInMonths, "Already dropped out")}</td>
          <td>${entry.dropsOutInMonths === null ? "Already dropped out" : formatDate(entry.dropoutDate)}</td>
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
  els.fileStatus.textContent = `${label}: ${entries.length} valid rows loaded.`;
  render();
}

async function loadExampleRows() {
  if (!exampleRowsPromise) {
    exampleRowsPromise = fetch("data/example.tsv")
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Unable to load example TSV: ${response.status}`);
        }
        return response.text();
      })
      .then((text) => parseDelimited(text));
  }

  return exampleRowsPromise;
}

els.fileInput.addEventListener("change", async (event) => {
  const [file] = event.target.files;
  if (!file) return;

  try {
    const text = await file.text();
    loadRows(parseDelimited(text), file.name);
  } catch (error) {
    entries = [];
    els.fileStatus.textContent = error.message;
    render();
  }
});

els.sampleButton.addEventListener("click", () => {
  loadExampleRows()
    .then((rows) => loadRows(rows, "Example TSV"))
    .catch((error) => {
      entries = [];
      els.fileStatus.textContent = error.message;
      render();
    });
});

els.clearButton.addEventListener("click", () => {
  entries = [];
  els.fileInput.value = "";
  els.fileStatus.textContent = "No export loaded.";
  render();
});

els.approvedOnly.addEventListener("change", render);

els.manualPoints.addEventListener("input", renderCalculator);

els.useCalculatedButton.addEventListener("click", () => {
  const points = entries
    .map(analyzeEntry)
    .filter((entry) => entry.countsTowardTier)
    .reduce((total, entry) => total + entry.points, 0);
  els.manualPoints.value = String(points);
  renderCalculator();
});

render();
