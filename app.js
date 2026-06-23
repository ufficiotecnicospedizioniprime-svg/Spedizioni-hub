const API_URL = "https://script.google.com/macros/s/AKfycbw_25M-XnOIO9xh8yQwIYJwZP60zkwDInirdC5Jj0UjX8giKMZQMUPMFIue5aJgnVYx/exec";
const API_TIMEOUT_MS = 370000;
const idsInput = document.getElementById("idsInput");
const searchBtn = document.getElementById("searchBtn");
const clearBtn = document.getElementById("clearBtn");
const copyBtn = document.getElementById("copyBtn");
const dateFrom = document.getElementById("dateFrom");
const dateTo = document.getElementById("dateTo");
const resultsBody = document.getElementById("resultsBody");
const statusBadge = document.getElementById("statusBadge");
const totalCount = document.getElementById("totalCount");
const foundCount = document.getElementById("foundCount");
const missingCount = document.getElementById("missingCount");
const reportTools = document.getElementById("reportTools");
const reportPreview = document.getElementById("reportPreview");
const printBtn = document.getElementById("printBtn");

let lastResults = [];

searchBtn.addEventListener("click", handleSearch);
clearBtn.addEventListener("click", clearAll);
copyBtn.addEventListener("click", copyCsv);
printBtn.addEventListener("click", () => window.print());

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
  const filters = getDateFilters();

  if (ids.length === 0) {
    setStatus("Inserisci almeno un codice");
    renderEmpty("Inserisci almeno un codice spedizione.");
    return;
  }

  if (filters.error) {
    setStatus("Periodo non valido");
    renderEmpty(filters.error);
    hideReport();
    return;
  }

  setLoading(true);
  setStatus("Ricerca in corso...");

  try {
    const data = await requestApi(ids, filters);

    if (!data.ok) {
      throw new Error(data.errore || "Risposta API non valida.");
    }

    lastResults = Array.isArray(data.risultati) ? data.risultati : [];
    renderResults(lastResults);
    renderReport(lastResults);
    updateSummary(lastResults);
    setStatus("Ricerca completata");
    copyBtn.disabled = lastResults.length === 0;
  } catch (error) {
    lastResults = [];
    copyBtn.disabled = true;
    updateSummary([]);
    renderEmpty(error.message || "Errore durante la ricerca.");
    hideReport();
    setStatus("Errore");
  } finally {
    setLoading(false);
  }
}

function requestApi(ids, filters) {
  return new Promise((resolve, reject) => {
    const callbackName = "__hubCallback_" + Date.now() + "_" + Math.random().toString(36).slice(2);
    const script = document.createElement("script");
    const url = new URL(API_URL);

    url.searchParams.set("ids", ids.join(","));
    url.searchParams.set("prefix", callbackName);

    if (filters.from) {
      url.searchParams.set("dal", filters.from);
    }

    if (filters.to) {
      url.searchParams.set("al", filters.to);
    }

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Tempo scaduto: Apps Script ha superato il limite di circa 6 minuti."));
    }, API_TIMEOUT_MS);

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
  dateFrom.value = "";
  dateTo.value = "";
  lastResults = [];
  copyBtn.disabled = true;
  updateSummary([]);
  renderEmpty("Nessuna ricerca eseguita.");
  hideReport();
  setStatus("Pronto");
}

function setLoading(isLoading) {
  searchBtn.disabled = isLoading;
  searchBtn.textContent = isLoading ? "Cerco..." : "Cerca";
}

function setStatus(message) {
  statusBadge.textContent = message;
}

function getDateFilters() {
  const from = dateFrom.value || "";
  const to = dateTo.value || "";

  if (from && to && from > to) {
    return {
      from,
      to,
      error: "La data Dal non puo' essere successiva alla data Al."
    };
  }

  return { from, to, error: "" };
}

function renderReport(results) {
  const foundItems = results.filter((item) => item.trovato);

  if (foundItems.length === 0) {
    hideReport();
    return;
  }

  const rows = foundItems.map((item, index) => {
    const pesoReale = parseItalianNumber(item.peso);
    const pesoVolume = calcPesoVolume(item);
    const data = formatHubDate(item.fileName) || "Non disponibile";

    return {
      collo: index + 1,
      sticker: item.id || "",
      data,
      filiale: item.filiale || "Non disponibile",
      stato: item.stato || "OK",
      pesoReale,
      dimensioni: formatDimensioni(item),
      pesoVolume,
      fileName: item.fileName || ""
    };
  });

  const first = rows[0];
  const stickerTitle = rows.length === 1 ? first.sticker : `${rows.length} spedizioni`;
  const pesoRealeTotale = rows.reduce((sum, row) => sum + row.pesoReale, 0);
  const pesoVolumeTotale = rows.reduce((sum, row) => sum + row.pesoVolume, 0);
  const pesoTassabile = Math.max(pesoRealeTotale, pesoVolumeTotale);
  const fonti = [...new Set(rows.map((row) => row.fileName).filter(Boolean))].join(", ");
  const filiali = [...new Set(rows.map((row) => row.filiale).filter(Boolean))].join(", ");

  reportPreview.innerHTML = `
    <article class="pdf-page">
      <header class="pdf-header">
        <div class="pdf-partner">Partner Poste Italiane</div>
        <div>Rilevazioni RPDB</div>
      </header>

      <h2>Rilevazioni sulla spedizione ${escapeHtml(stickerTitle)}</h2>

      <p>Gentile cliente,</p>

      <p>
        di seguito riportiamo le rilevazioni disponibili sulla spedizione
        <strong>${escapeHtml(stickerTitle)}</strong>, effettuate dalle filiali e registrate
        nei flussi operativi Poste Delivery. Spedizioni Prime, in qualita' di Partner Poste
        Italiane, riepiloga i dati tecnici emersi dalle movimentazioni disponibili.
      </p>

      <section class="pdf-info">
        <div><strong>Servizio:</strong> POSTEDELIVERY BUSINESS EXPRESS</div>
        <div><strong>Data partenza:</strong> Non disponibile; <strong>Data consegna rilevata:</strong> ${escapeHtml(first.data)}</div>
        <div><strong>Filiali rilevate:</strong> ${escapeHtml(filiali || "Non disponibile")}</div>
        <br>
        <div><strong>Fonte ultima rilevazione:</strong></div>
        <div>${escapeHtml(fonti || "Non disponibile")}</div>
      </section>

      <table class="pdf-table">
        <thead>
          <tr>
            <th>Collo</th>
            <th>Sticker</th>
            <th>Data</th>
            <th>Filiale</th>
            <th>Stato</th>
            <th>Peso reale kg</th>
            <th>Dimensioni rilevate</th>
            <th>Peso volume kg</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((row) => `
            <tr>
              <td>${row.collo}</td>
              <td>${escapeHtml(row.sticker)}</td>
              <td>${escapeHtml(row.data)}</td>
              <td>${escapeHtml(row.filiale)}</td>
              <td>${escapeHtml(row.stato)}</td>
              <td>${formatKg(row.pesoReale, 2)}</td>
              <td>${escapeHtml(row.dimensioni)}</td>
              <td>${formatKg(row.pesoVolume, 3)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>

      <section class="pdf-totals">
        <div class="pdf-total-box">
          <span>Peso reale totale</span>
          <strong>${formatKg(pesoRealeTotale, 2)} kg</strong>
        </div>
        <div class="pdf-total-box">
          <span>Peso volume totale</span>
          <strong>${formatKg(pesoVolumeTotale, 3)} kg</strong>
        </div>
        <div class="pdf-total-box">
          <span>Peso tassabile stimato</span>
          <strong>${formatKg(pesoTassabile, 2)} kg</strong>
        </div>
      </section>

      <p class="pdf-note">
        Il peso volume e' calcolato con formula altezza x larghezza x profondita' / 5000.
        Per spedizioni multicollo il confronto viene effettuato sui totali dei singoli colli.
        Documento riepilogativo non fiscale, prodotto da Spedizioni Prime - Partner Poste
        Italiane sulla base delle rilevazioni RPDB disponibili.
      </p>
    </article>
  `;

  reportTools.hidden = false;
  reportPreview.hidden = false;
}

function hideReport() {
  reportTools.hidden = true;
  reportPreview.hidden = true;
  reportPreview.innerHTML = "";
}

function calcPesoVolume(item) {
  const lato1 = parseItalianNumber(item.lato1);
  const lato2 = parseItalianNumber(item.lato2);
  const lato3 = parseItalianNumber(item.lato3);

  if (!lato1 || !lato2 || !lato3) return 0;

  return (lato1 * lato2 * lato3) / 5000;
}

function formatDimensioni(item) {
  const lati = [item.lato1, item.lato2, item.lato3]
    .map(parseItalianNumber)
    .map((value) => formatNumber(value, 1));

  return `${lati[0]} x ${lati[1]} x ${lati[2]} cm`;
}

function parseItalianNumber(value) {
  const normalized = String(value || "")
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^\d.-]/g, "");

  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
}

function formatKg(value, decimals) {
  return formatNumber(value, decimals);
}

function formatNumber(value, decimals) {
  return Number(value || 0)
    .toFixed(decimals)
    .replace(".", ",");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
