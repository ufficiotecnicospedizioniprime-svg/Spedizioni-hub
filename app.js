const API_URL = "https://script.google.com/macros/s/AKfycbw_25M-XnOIO9xh8yQwIYJwZP60zkwDInirdC5Jj0UjX8giKMZQMUPMFIue5aJgnVYx/exec";
const API_TIMEOUT_MS = 370000;
const idsInput = document.getElementById("idsInput");
const searchBtn = document.getElementById("searchBtn");
const clearBtn = document.getElementById("clearBtn");
const copyBtn = document.getElementById("copyBtn");
const resultsBody = document.getElementById("resultsBody");
const statusBadge = document.getElementById("statusBadge");
const totalCount = document.getElementById("totalCount");
const foundCount = document.getElementById("foundCount");
const missingCount = document.getElementById("missingCount");

let lastResults = [];

searchBtn.addEventListener("click", handleSearch);
clearBtn.addEventListener("click", clearAll);
copyBtn.addEventListener("click", copyCsv);

function parseIds(value) {
  const seen = new Set();

  return value
    .split(/[\s,;]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => {
      if (seen.has(item)) return false;
      seen.add(item);
      return true;
    });
}

async function handleSearch() {
  const ids = parseIds(idsInput.value);

  if (ids.length === 0) {
    setStatus("Inserisci almeno un codice");
    renderEmpty("Inserisci almeno un codice spedizione.");
    return;
  }

  setLoading(true);
  setStatus("Ricerca in corso...");

  try {
    const data = await requestApi(ids);

    if (!data.ok) {
      throw new Error(data.errore || "Risposta API non valida.");
    }

    lastResults = Array.isArray(data.risultati) ? data.risultati : [];
    renderResults(lastResults);
    updateSummary(lastResults);
    setStatus("Ricerca completata");
    copyBtn.disabled = lastResults.length === 0;
  } catch (error) {
    lastResults = [];
    copyBtn.disabled = true;
    updateSummary([]);
    renderEmpty(error.message || "Errore durante la ricerca.");
    setStatus("Errore");
  } finally {
    setLoading(false);
  }
}

function requestApi(ids) {
  return new Promise((resolve, reject) => {
    const callbackName = "__hubCallback_" + Date.now() + "_" + Math.random().toString(36).slice(2);
    const script = document.createElement("script");
    const url = new URL(API_URL);

    url.searchParams.set("ids", ids.join(","));
    url.searchParams.set("prefix", callbackName);

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Tempo scaduto: Apps Script non ha risposto."));
    }, 30000);

    window[callbackName] = (data) => {
      cleanup();
      resolve(data);
    };

    script.onerror = () => {
      cleanup();
      reject(new Error("Chiamata ad Apps Script non riuscita."));
    };

    function cleanup() {
      clearTimeout(timer);
      delete window[callbackName];
      script.remove();
    }

    script.src = url.toString();
    document.body.appendChild(script);
  });
}

function renderResults(results) {
  if (results.length === 0) {
    renderEmpty("Nessun risultato ricevuto.");
    return;
  }

  resultsBody.innerHTML = results.map((item) => {
    const trovato = Boolean(item.trovato);
    const statoClass = trovato ? "tag tag-ok" : "tag tag-missing";
    const statoText = trovato ? "Trovato" : "Non trovato";

    return `
      <tr>
        <td>${escapeHtml(item.id || "")}</td>
        <td><span class="${statoClass}">${statoText}</span></td>
        <td>${escapeHtml(item.lato1 || "")}</td>
        <td>${escapeHtml(item.lato2 || "")}</td>
        <td>${escapeHtml(item.lato3 || "")}</td>
        <td>${escapeHtml(item.peso || "")}</td>
        <td>${escapeHtml(item.fileName || "")}</td>
        <td>${escapeHtml(formatHubDate(item.fileName))}</td>
      </tr>
    `;
  }).join("");
}

function renderEmpty(message) {
  resultsBody.innerHTML = `
    <tr>
      <td colspan="8" class="empty-state">${escapeHtml(message)}</td>
    </tr>
  `;
}

function updateSummary(results) {
  const total = results.length;
  const found = results.filter((item) => item.trovato).length;
  const missing = total - found;

  totalCount.textContent = String(total);
  foundCount.textContent = String(found);
  missingCount.textContent = String(missing);
}

function formatHubDate(fileName) {
  const match = String(fileName || "").match(/HUB_(\d{14})/);
  if (!match) return "";

  const raw = match[1];
  return `${raw.slice(6, 8)}/${raw.slice(4, 6)}/${raw.slice(0, 4)} ${raw.slice(8, 10)}:${raw.slice(10, 12)}:${raw.slice(12, 14)}`;
}

function copyCsv() {
  if (lastResults.length === 0) return;

  const header = ["Codice", "Stato", "Lato 1", "Lato 2", "Lato 3", "Peso", "File HUB", "Data file"];

  const rows = lastResults.map((item) => [
    item.id || "",
    item.trovato ? "Trovato" : "Non trovato",
    item.lato1 || "",
    item.lato2 || "",
    item.lato3 || "",
    item.peso || "",
    item.fileName || "",
    formatHubDate(item.fileName)
  ]);

  const csv = [header, ...rows]
    .map((row) => row.map(csvCell).join(";"))
    .join("\n");

  navigator.clipboard.writeText(csv)
    .then(() => setStatus("CSV copiato"))
    .catch(() => setStatus("Copia non riuscita"));
}

function csvCell(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function clearAll() {
  idsInput.value = "";
  lastResults = [];
  copyBtn.disabled = true;
  updateSummary([]);
  renderEmpty("Nessuna ricerca eseguita.");
  setStatus("Pronto");
}

function setLoading(isLoading) {
  searchBtn.disabled = isLoading;
  searchBtn.textContent = isLoading ? "Cerco..." : "Cerca";
}

function setStatus(message) {
  statusBadge.textContent = message;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
