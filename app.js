let DATA = [];
let METHODS_ONLY = [];
let subset = "dynamic";
let leaderboardSort = { key: "memory", direction: "desc" };

const fmt = (value) => value == null ? "N/A" : `${Number(value).toFixed(2)}%`;

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      i += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(cell);
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  row.push(cell);
  if (row.some((value) => value.length > 0)) rows.push(row);
  return rows;
}

function csvToLeaderboardData(text) {
  const [headers, ...rows] = parseCsv(text);
  const numberOrNull = (value) => value === "" ? null : Number(value);
  return rows.map((values) => {
    const record = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
    return {
      id: record.id,
      model: record.model,
      group: record.group,
      subset: record.subset,
      permanence: {
        visible: numberOrNull(record.permanence_visible),
        invisible: numberOrNull(record.permanence_invisible)
      },
      continuity: {
        visible: numberOrNull(record.continuity_visible),
        invisible: numberOrNull(record.continuity_invisible)
      },
      appearance: {
        visible: numberOrNull(record.appearance_visible),
        invisible: numberOrNull(record.appearance_invisible)
      },
      memory: numberOrNull(record.memory),
      visibleAverage: numberOrNull(record.visible_average),
      gap: numberOrNull(record.gap),
      visibleAvailable: record.visible_available === "true"
    };
  });
}

async function loadLeaderboardData() {
  const csvText = window.leaderboardScoresCsv;
  if (!csvText) throw new Error("Missing leaderboard_scores.js data.");
  DATA = csvToLeaderboardData(csvText);
  METHODS_ONLY = DATA.filter((row) => row.group !== "Reference");
}

function rowsForSubset() {
  const displaySubset = subset === "dynamic" ? "static" : "dynamic";
  const rows = METHODS_ONLY.filter((row) => row.subset === displaySubset);
  return rows.sort((a, b) => b.memory - a.memory);
}

function sortedLeaderboardRows() {
  const rows = [...rowsForSubset()];
  const { key, direction } = leaderboardSort;
  const dir = direction === "asc" ? 1 : -1;
  const metricValue = (row, metricName) => row[metricName]?.invisible ?? null;

  rows.sort((a, b) => {
    if (key === "model" || key === "group") {
      return dir * a[key].localeCompare(b[key]);
    }

    const av = key === "memory" ? a.memory : metricValue(a, key);
    const bv = key === "memory" ? b.memory : metricValue(b, key);
    if (av == null && bv == null) return a.model.localeCompare(b.model);
    if (av == null) return 1;
    if (bv == null) return -1;
    return dir * (av - bv) || a.model.localeCompare(b.model);
  });
  return rows;
}

function renderBars() {
  const rows = rowsForSubset().slice(0, 5);
  document.querySelector("#bars").innerHTML = rows.map((row) => `
    <div class="bar-row">
      <div class="bar-label">${row.model}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${row.memory}%"></div></div>
      <div class="bar-value">${row.memory.toFixed(1)}%</div>
    </div>
  `).join("");
}

function renderRows() {
  const rows = sortedLeaderboardRows();
  const memoryRanks = new Map(rowsForSubset().map((row, index) => [row.id, index + 1]));
  document.querySelector("#leaderRows").innerHTML = rows.map((row) => {
    const metric = (name) => `${fmt(row[name].invisible)} <span class="muted">(${row.visibleAvailable ? fmt(row[name].visible) : "N/A"})</span>`;
    return `
      <tr>
        <td class="rank">${memoryRanks.get(row.id) ?? ""}</td>
        <td class="model-cell">${row.model}</td>
        <td><span class="pill">${row.group}</span></td>
        <td>${metric("permanence")}</td>
        <td>${metric("continuity")}</td>
        <td>${metric("appearance")}</td>
      </tr>
    `;
  }).join("");
}

function renderLeaderboard() {
  renderBars();
  renderRows();
  updateLeaderboardSortHeaders();
}

function updateLeaderboardSortHeaders() {
  document.querySelectorAll("[data-leader-sort]").forEach((button) => {
    const active = button.dataset.leaderSort === leaderboardSort.key;
    button.classList.toggle("active", active);
    button.dataset.direction = active ? leaderboardSort.direction : "";
  });
}

document.querySelectorAll("[data-subset]").forEach((button) => {
  button.addEventListener("click", () => {
    subset = button.dataset.subset;
    document.querySelectorAll("[data-subset]").forEach((item) => item.classList.toggle("active", item === button));
    document.querySelector(".controls").dataset.active = subset;
    renderLeaderboard();
  });
});

document.querySelectorAll("[data-leader-sort]").forEach((button) => {
  button.addEventListener("click", () => {
    const key = button.dataset.leaderSort;
    if (leaderboardSort.key === key) {
      leaderboardSort.direction = leaderboardSort.direction === "desc" ? "asc" : "desc";
    } else {
      leaderboardSort = {
        key,
        direction: key === "model" || key === "group" ? "asc" : "desc"
      };
    }
    updateLeaderboardSortHeaders();
    renderRows();
  });
});

const metricDetails = {
  permanence: {
    name: "Object permanence",
    value: "91.57%",
    text: "Mask exists and the VLM confirms the target object is still present."
  },
  continuity: {
    name: "Motion continuity",
    value: "66.43%",
    text: "Predicted and reference mask centers stay aligned after scale normalization."
  },
  appearance: {
    name: "Appearance preservation",
    value: "74.21%",
    text: "Masked DINO features remain similar between prediction and reference crops."
  }
};

document.querySelectorAll("[data-metric]").forEach((button) => {
  button.addEventListener("click", () => {
    const metric = button.dataset.metric;
    const detail = metricDetails[metric];
    document.querySelectorAll("[data-metric]").forEach((item) => item.classList.toggle("active", item === button));
    document.querySelector(".metric-stage").dataset.metric = metric;
    document.querySelector("#metricName").textContent = detail.name;
    document.querySelector("#metricValue").textContent = detail.value;
    document.querySelector("#metricText").textContent = detail.text;
  });
});

const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) entry.target.classList.add("visible");
  });
}, { threshold: 0.14 });

document.querySelectorAll(".reveal").forEach((element) => observer.observe(element));

const vizState = {
  manifest: null,
  subsetIndex: 0,
  caseIndex: 0,
  sortMetric: "object_permanence",
  showGtMask: false,
  showPredMask: false,
  cardEls: []
};

const vizMetricLabels = {
  object_permanence: "Object Permanence",
  motion_continuity: "Motion Continuity",
  appearance_preservation: "Appearance Preservation"
};

const vizFmt = (value) => value == null ? "N/A" : `${Number(value).toFixed(1)}%`;

function vizFrameAt(frames, frame) {
  if (!frames || !frames.length) return "";
  return frames[frame % frames.length];
}

function vizSortedMethods(caseData) {
  return [...caseData.methods].sort((a, b) => {
    const av = a.scores?.[vizState.sortMetric];
    const bv = b.scores?.[vizState.sortMetric];
    if (av == null && bv == null) return a.method.localeCompare(b.method);
    if (av == null) return 1;
    if (bv == null) return -1;
    return bv - av || a.method.localeCompare(b.method);
  });
}

function vizMethodName(methodData) {
  return methodData.displayName || vizState.manifest?.methodDisplayNames?.[methodData.method] || methodData.method;
}

function vizScoreGrid(methodData) {
  return Object.entries(vizMetricLabels).map(([key, label]) => `
    <div class="viz-score" data-viz-score="${key}">
      <span>${label}</span>
      <strong>${vizFmt(methodData.scores?.[key])}</strong>
      <em></em>
    </div>
  `).join("");
}

function vizScoreSourceLabel(methodData) {
  return vizMetricLabels[vizState.sortMetric] || methodData.perFrameSources?.[vizState.sortMetric] || vizState.sortMetric;
}

function vizActiveScoreLabel(methodData) {
  return `${vizMetricLabels[vizState.sortMetric]} = ${vizFmt(methodData.scores?.[vizState.sortMetric])}`;
}

function vizPreview(label, key) {
  return `
    <div class="viz-preview" data-viz-panel="${key}">
      <div class="viz-preview-media">
        <img class="viz-frame-image" alt="${label}" />
        <img class="viz-mask-image" alt="" aria-hidden="true" hidden />
      </div>
      <span><b>${label}</b><em></em></span>
    </div>
  `;
}

function renderVizBrowser() {
  const methodsEl = document.querySelector("#vizMethods");
  if (!vizState.manifest || !methodsEl) return;

  const subsetData = vizCurrentSubset();
  const caseData = subsetData.cases[vizState.caseIndex];
  const methods = vizSortedMethods(caseData);
  clearVizCardTimers();
  methodsEl.innerHTML = methods.map((methodData, index) => `
    <article class="viz-method-card" data-method="${methodData.method}">
      <div class="viz-method-head">
        <div class="viz-method-name">${index + 1}. ${vizMethodName(methodData)}</div>
        <div class="viz-card-actions">
          <div class="viz-rank-score">${vizActiveScoreLabel(methodData)}</div>
          <button class="viz-toggle viz-card-play" type="button">Play</button>
        </div>
      </div>
      <div class="viz-preview-grid">
        ${vizPreview("Input", "input")}
        ${vizPreview("Reference", "ground_truth")}
        ${vizPreview("Prediction", "prediction")}
      </div>
      <div class="viz-frame-strip">
        <div class="viz-bar-labels" aria-hidden="true">
          <div class="viz-visibility-legend">
            <span><i class="visible"></i>Fully visible</span>
            <span><i class="invisible"></i>Fully invisible</span>
          </div>
          <div class="viz-score-scale">
            <span>Max score · 100%</span>
            <span>Min score · 0%</span>
          </div>
        </div>
        <canvas class="viz-frame-bars" width="920" height="142"></canvas>
        <span class="viz-frame-readout">Frame 1/${vizTotalFrames(methodData)}</span>
      </div>
      <div class="viz-score-grid">${vizScoreGrid(methodData)}</div>
    </article>
  `).join("");

  vizState.cardEls = Array.from(methodsEl.querySelectorAll(".viz-method-card")).map((cardEl, index) => ({
    el: cardEl,
    data: methods[index],
    frame: 0,
    playing: false,
    timer: null
  }));
  vizState.cardEls.forEach((card) => {
    card.el.querySelector(".viz-card-play")?.addEventListener("click", () => setVizCardPlaying(card, !card.playing));
    const bars = card.el.querySelector(".viz-frame-bars");
    let scrubbing = false;
    const scrub = (event) => {
      card.frame = vizFrameFromClientX(bars, event.clientX, vizTotalFrames(card.data));
      setVizCardPlaying(card, false);
      renderVizFrame(card);
    };
    bars?.addEventListener("click", scrub);
    bars?.addEventListener("mousedown", (event) => {
      scrubbing = true;
      scrub(event);
    });
    window.addEventListener("mousemove", (event) => {
      if (!scrubbing) return;
      scrub(event);
    });
    window.addEventListener("mouseup", () => {
      scrubbing = false;
    });
  });
  methodsEl.scrollTop = 0;
  renderVizFrame();
}

function vizSubsets() {
  return vizState.manifest?.subsets || [{ id: "dynamic", label: "Dynamic", cases: vizState.manifest?.cases || [] }];
}

function vizCurrentSubset() {
  return vizSubsets()[vizState.subsetIndex] || vizSubsets()[0];
}

function populateVizCaseSelect() {
  const caseSelect = document.querySelector("#vizCaseSelect");
  const subsetData = vizCurrentSubset();
  if (!caseSelect || !subsetData) return;
  caseSelect.innerHTML = subsetData.cases.map((caseData, index) => `
    <option value="${index}">Case ${index + 1}: ${caseData.uid}</option>
  `).join("");
  caseSelect.value = String(vizState.caseIndex);
}

function vizTotalFrames(methodData) {
  return Math.max(
    methodData.media?.input?.length || 0,
    methodData.media?.ground_truth?.length || 0,
    methodData.media?.prediction?.length || 0,
    methodData.frameCount || 0,
    methodData.perFrameScores?.object_permanence?.length || 0,
    1
  );
}

function vizFrameScore(methodData, key, frame) {
  const values = methodData.perFrameScores?.[key] || [];
  if (!values.length) return null;
  return values[frame % values.length];
}

function vizFrameFromClientX(canvas, clientX, total) {
  if (!canvas || total <= 1) return 0;
  const rect = canvas.getBoundingClientRect();
  const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
  return Math.max(0, Math.min(total - 1, Math.floor((x / rect.width) * total)));
}

function drawVizBars(card) {
  const canvas = card.el.querySelector(".viz-frame-bars");
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const cssWidth = Math.max(1, Math.round(rect.width || canvas.clientWidth || 920));
  const cssHeight = 170;
  const pixelWidth = Math.round(cssWidth * dpr);
  const pixelHeight = Math.round(cssHeight * dpr);
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
    canvas.style.height = `${cssHeight}px`;
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const width = cssWidth;
  const height = cssHeight;
  const values = card.data.perFrameScores?.[vizState.sortMetric] || [];
  const visibleMask = card.data.visibleMask || [];
  const invisibleMask = card.data.invisibleMask || [];
  const total = vizTotalFrames(card.data);
  const visibilityHeight = 34;
  const gap = 8;
  const chartTop = visibilityHeight + gap;
  const chartHeight = height - chartTop;
  const barWidth = width / total;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "rgba(6, 8, 13, 0.72)";
  ctx.fillRect(0, 0, width, height);

  for (let idx = 0; idx < total; idx += 1) {
    const x = idx * barWidth;
    if (visibleMask[idx] === true) ctx.fillStyle = "rgba(115, 246, 164, 0.9)";
    else if (invisibleMask[idx] === true) ctx.fillStyle = "rgba(244, 193, 87, 0.9)";
    else ctx.fillStyle = "rgba(96, 112, 141, 0.35)";
    ctx.fillRect(x, 0, Math.max(1, barWidth - 1), visibilityHeight);
  }

  ctx.strokeStyle = "rgba(148, 163, 184, 0.34)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, visibilityHeight + 0.5);
  ctx.lineTo(width, visibilityHeight + 0.5);
  ctx.moveTo(0, chartTop + 0.5);
  ctx.lineTo(width, chartTop + 0.5);
  ctx.moveTo(0, height - 0.5);
  ctx.lineTo(width, height - 0.5);
  ctx.stroke();

  const min = 0;
  const max = 100;
  const span = Math.max(max - min, 1e-6);

  for (let idx = 0; idx < total; idx += 1) {
    const x = idx * barWidth;
    const value = values[idx];
    if (value === null || value === undefined || Number.isNaN(value)) {
      ctx.fillStyle = "rgba(96, 112, 141, 0.18)";
      ctx.fillRect(x, chartTop, Math.max(1, barWidth - 1), chartHeight);
      continue;
    }
    const clamped = Math.max(min, Math.min(max, value));
    const t = (clamped - min) / span;
    const barHeight = value <= 0 ? 0 : Math.max(2, t * chartHeight);
    ctx.fillStyle = `hsl(${180 - t * 150}, 72%, 42%)`;
    ctx.fillRect(x, chartTop + chartHeight - barHeight, Math.max(1, barWidth - 1), barHeight);
  }

  const activeX = (card.frame % total) * barWidth;
  ctx.strokeStyle = "#f4c157";
  ctx.lineWidth = 3;
  ctx.strokeRect(activeX, 0, Math.max(2, barWidth), height);
}

function renderVizFrame(targetCard = null) {
  const cards = targetCard ? [targetCard] : vizState.cardEls;
  cards.forEach((card) => {
    const { el, data } = card;
    const panels = {
      input: { frames: data.media.input, masks: null, showMask: false },
      ground_truth: { frames: data.media.ground_truth, masks: data.media.ground_truth_mask, showMask: vizState.showGtMask },
      prediction: { frames: data.media.prediction, masks: data.media.prediction_mask, showMask: vizState.showPredMask }
    };

    Object.entries(panels).forEach(([key, panelData]) => {
      const panel = el.querySelector(`[data-viz-panel="${key}"]`);
      if (!panel) return;
      const frameImg = panel.querySelector(".viz-frame-image");
      const maskImg = panel.querySelector(".viz-mask-image");
      const meta = panel.querySelector("em");
      const frame = vizFrameAt(panelData.frames, card.frame);
      const mask = panelData.showMask ? vizFrameAt(panelData.masks, card.frame) : "";
      const frameSrc = frame ? `assets/visualization/${frame}` : "";
      const maskSrc = mask ? `assets/visualization/${mask}` : "";
      if (frameImg && frameSrc) frameImg.src = frameSrc;
      if (maskImg) {
        if (maskSrc) {
          maskImg.src = maskSrc;
          maskImg.hidden = false;
        } else {
          maskImg.removeAttribute("src");
          maskImg.hidden = true;
        }
      }
      const total = panelData.frames?.length || 0;
      meta.textContent = total ? `${(card.frame % total) + 1}/${total}${mask ? " + mask" : ""}` : "N/A";
    });
    const total = vizTotalFrames(data);
    const readout = el.querySelector(".viz-frame-readout");
    if (readout) {
      const frameScore = vizFrameScore(data, vizState.sortMetric, card.frame);
      readout.textContent = `Frame ${(card.frame % total) + 1}/${total} · ${vizScoreSourceLabel(data)}: ${vizFmt(frameScore)}`;
    }
    Object.keys(vizMetricLabels).forEach((key) => {
      const scoreEl = el.querySelector(`[data-viz-score="${key}"] em`);
      if (scoreEl) scoreEl.textContent = `Frame ${vizFmt(vizFrameScore(data, key, card.frame))}`;
    });
    drawVizBars(card);
  });
}

function setVizCardPlaying(card, playing) {
  card.playing = playing;
  const button = card.el.querySelector(".viz-card-play");
  if (button) {
    button.textContent = playing ? "Pause" : "Play";
    button.classList.toggle("active", playing);
  }
  if (card.timer) window.clearInterval(card.timer);
  card.timer = null;
  if (playing) {
    card.timer = window.setInterval(() => {
      card.frame = (card.frame + 1) % vizTotalFrames(card.data);
      renderVizFrame(card);
    }, 140);
  }
}

function clearVizCardTimers() {
  vizState.cardEls.forEach((card) => {
    if (card.timer) window.clearInterval(card.timer);
  });
  vizState.cardEls = [];
}

async function initVisualizationBrowser() {
  const subsetSelect = document.querySelector("#vizSubsetSelect");
  const caseSelect = document.querySelector("#vizCaseSelect");
  const sortSelect = document.querySelector("#vizSortSelect");
  const methodsEl = document.querySelector("#vizMethods");
  if (!subsetSelect || !caseSelect || !sortSelect || !methodsEl) return;

  if (window.visualizationManifest) {
    vizState.manifest = window.visualizationManifest;
  } else {
    methodsEl.innerHTML = '<p class="data-note">Failed to load visualization examples.</p>';
    return;
  }

  subsetSelect.innerHTML = vizSubsets().map((subsetData, index) => `
    <option value="${index}">${subsetData.label}</option>
  `).join("");
  subsetSelect.value = String(vizState.subsetIndex);
  populateVizCaseSelect();
  sortSelect.innerHTML = vizState.manifest.sortOptions.map((option) => `
    <option value="${option.id}">${option.label}</option>
  `).join("");
  sortSelect.value = vizState.sortMetric;

  subsetSelect.addEventListener("change", () => {
    vizState.subsetIndex = Number(subsetSelect.value);
    vizState.caseIndex = 0;
    populateVizCaseSelect();
    renderVizBrowser();
  });
  caseSelect.addEventListener("change", () => {
    vizState.caseIndex = Number(caseSelect.value);
    renderVizBrowser();
  });
  sortSelect.addEventListener("change", () => {
    vizState.sortMetric = sortSelect.value;
    renderVizBrowser();
  });
  document.querySelector("#vizGtMaskToggle")?.addEventListener("click", (event) => {
    vizState.showGtMask = !vizState.showGtMask;
    event.currentTarget.textContent = vizState.showGtMask ? "GT Mask On" : "GT Mask Off";
    event.currentTarget.classList.toggle("active", vizState.showGtMask);
    renderVizFrame();
  });
  document.querySelector("#vizPredMaskToggle")?.addEventListener("click", (event) => {
    vizState.showPredMask = !vizState.showPredMask;
    event.currentTarget.textContent = vizState.showPredMask ? "Pred Mask On" : "Pred Mask Off";
    event.currentTarget.classList.toggle("active", vizState.showPredMask);
    renderVizFrame();
  });

  renderVizBrowser();
}

initVisualizationBrowser();

loadLeaderboardData()
  .then(renderLeaderboard)
  .catch((error) => {
    console.error(error);
    document.querySelector("#bars").innerHTML = '<p class="data-note">Failed to load leaderboard scores.</p>';
  });
