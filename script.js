/* ============================
   MAP CONFIG
============================ */
let config = { minZoom: 2, maxZoom: 18 };
const map = L.map("map", config).setView([5, 20], 1);


L.tileLayer(
  "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
  {
    attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
    subdomains: "abcd",
    maxZoom: 20
  }
).addTo(map);


/* ============================
   ICONS
============================ */
const iconMap = {
  cathedral: "icons/cathedral-svgrepo-com.svg",
  mosque: "icons/mosque-svgrepo-com.svg",
  pyramid: "icons/pyramid-svgrepo-com.svg",
  stupa: "icons/stupa-svgrepo-com.svg",
  synagogue: "icons/synagogue-svgrepo-com.svg",
  gopura: "icons/hindu-temple-svgrepo-com.svg",
  temple: "icons/hindu-temple-stupa-svgrepo-com.svg",
  statue: "icons/great-buddha-of-nara-1-svgrepo-com.svg",
  pagoda: "icons/pagoda-svgrepo-com.svg"
};


function getIconKey(type) {
  const t = (type || "").toLowerCase();
  if (t.includes("cathedral")) return "cathedral";
  if (t.includes("synagogue")) return "synagogue";
  if (t.includes("mosque")) return "mosque";
  if (t.includes("gopura")) return "gopura";
  if (t.includes("temple")) return "temple";
  if (t.includes("stupa")) return "stupa";
  if (t.includes("pagoda")) return "pagoda";
  if (t.includes("statue")) return "statue";
  if (t.includes("pyramid")) return "pyramid";
  return "cathedral";
}

/* ============================
   MARKER DODGE
============================ */
function dodgePosition(lat, lng, index, zoom) {
  if (zoom >= 5) return [lat, lng];
  const offset = 0.1;
  return [
    lat + ((index % 3) - 1) * offset,
    lng + ((Math.floor(index / 3) % 3) - 1) * offset
  ];
}

/* ============================
   CHECKBOX FILTER HELPERS
============================ */
function buildCheckboxes(containerId, values, namePrefix) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = "";

  const sorted = Array.from(values).sort((a, b) => (a || "").localeCompare(b || ""));
  sorted.forEach((val, i) => {
    const id = `${namePrefix}_${i}`;
    const label = document.createElement("label");
    label.setAttribute("for", id);

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.id = id;
    cb.name = namePrefix;
    cb.value = val;
    cb.checked = true;

    cb.addEventListener("change", handleFilterChange);

    label.appendChild(cb);
    label.appendChild(document.createTextNode(val || "(blank)"));
    container.appendChild(label);
  });
}

function getCheckedValues(namePrefix) {
  return Array.from(document.querySelectorAll(`input[name="${namePrefix}"]:checked`))
    .map(cb => cb.value);
}

function syncSelectAll(prefix) {
  const boxes = document.querySelectorAll(`input[name="${prefix}Chk"]`);
  const all = document.getElementById(`${prefix}SelectAll`);
  const arr = Array.from(boxes);

  if (!arr.length || !all) return;

  const allChecked = arr.every(cb => cb.checked);
  const someChecked = arr.some(cb => cb.checked);

  all.checked = allChecked;
  all.indeterminate = !allChecked && someChecked;
}

function wireSelectAll(prefix) {
  const selectAll = document.getElementById(`${prefix}SelectAll`);
  if (!selectAll) return;

  selectAll.addEventListener("change", () => {
    const boxes = document.querySelectorAll(`input[name="${prefix}Chk"]`);
    boxes.forEach(cb => cb.checked = selectAll.checked);
    handleFilterChange();
  });
}

function handleFilterChange() {
  // keep select-all states correct
  syncSelectAll("religion");
  syncSelectAll("continent");

  const y = getCurrentYear();
  updateMap(y);

  // Refresh Year tab if active; always re-prime Building tab
  const activeTabBtn = document.querySelector('#leftTabs .tab-btn.active');
  const active = activeTabBtn ? activeTabBtn.dataset.tab : null;
  if (active === 'year') renderYearTab(y);
  primeBuildingTabForYear(y);
}

/* ============================
   GLOBALS
============================ */
let allRows = [];
let activeMarkers = [];

const slider = document.getElementById("yearSlider");
const label = document.getElementById("yearLabel");

/* ============================
   FILTER PANEL TOGGLE (right)
============================ */
const filterPanel = document.getElementById("filterPanel");
const filterToggleBtn = document.getElementById("filterToggle");
const filterCloseBtn = document.getElementById("closeFilters");

function openFilters() {
  if (!filterPanel || !filterToggleBtn) return;
  filterPanel.classList.add("open");
  filterPanel.setAttribute("aria-hidden", "false");
  filterToggleBtn.setAttribute("aria-expanded", "true");
}

function closeFilters() {
  if (!filterPanel || !filterToggleBtn) return;
  filterPanel.classList.remove("open");
  filterPanel.setAttribute("aria-hidden", "true");
  filterToggleBtn.setAttribute("aria-expanded", "false");
}

// Toggle / Close bindings
if (filterToggleBtn) {
  filterToggleBtn.addEventListener("click", () => {
    if (filterPanel && filterPanel.classList.contains("open")) {
      closeFilters();
    } else {
      openFilters();
    }
  });
}
if (filterCloseBtn) filterCloseBtn.addEventListener("click", closeFilters);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeFilters(); });
document.addEventListener("click", (e) => {
  const clickInside = (filterPanel && filterPanel.contains(e.target)) || (filterToggleBtn && filterToggleBtn.contains(e.target));
  if (!clickInside && filterPanel && filterPanel.classList.contains("open")) closeFilters();
});

/* ============================
   LEFT PANEL TABS + RENDERERS
============================ */
function setActiveTab(tab) {
  const btns = document.querySelectorAll('#leftTabs .tab-btn');
  btns.forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tab));

  const sections = document.querySelectorAll('#leftContent .tab-section');
  sections.forEach(sec => {
    const suffix = sec.id.split('-')[1]; // info/year/building
    sec.hidden = (suffix !== tab);
  });
}

function renderInfoTab() {
  setActiveTab('info');
}

function getCurrentYear() {
  return nearestYear(parseFloat(slider.value));
}

// Filtered rows (standing and matching filters) for a given year
function getRowsForYearFiltered(year) {
  const selectedReligions = new Set(getCheckedValues("religionChk"));
  const selectedContinents = new Set(getCheckedValues("continentChk"));

  return allRows.filter(r => {
    if (parseInt(r.year) !== year) return false;

    // Respect filters (if none checked => nothing passes)
    if (!selectedReligions.has(r.religion_group)) return false;
    if (!selectedContinents.has(r.continent)) return false;

    const h = parseFloat(r.height_at_year);
    if (isNaN(h) || h <= 0) return false;

    return true;
  });
}

function renderYearTab(year) {
  setActiveTab('year');

  const yearTarget = document.getElementById('yearTabYear');
  const container = document.getElementById('yearList');
  if (yearTarget) yearTarget.textContent = year;
  if (!container) return;

  container.innerHTML = '';

  const rows = getRowsForYearFiltered(year)
    .map(r => ({ row: r, h: parseFloat(r.height_at_year) }))
    .filter(x => !isNaN(x.h))
    .sort((a, b) => b.h - a.h);

  if (rows.length === 0) {
    container.innerHTML = '<div style="opacity:.8">No buildings match the filters for this year.</div>';
    return;
  }

  rows.forEach((x, idx) => {
    const el = document.createElement('div');
    el.className = 'rank-row';
    el.innerHTML = `
      <div class="rank">${idx + 1}</div>
      <div class="name">${x.row.name || '—'}</div>
      <div class="h">Height at year (m): ${x.h.toFixed(0)}</div>

    `;
    el.addEventListener("click", () => { 
      focusOnBuilding(x.row, year); 
    });
    container.appendChild(el);
  });
}

function computeTallestRow(year) {
  const rows = getRowsForYearFiltered(year);
  if (!rows.length) return null;
  return rows.reduce((best, r) => {
    const h = parseFloat(r.height_at_year);
    const bh = parseFloat(best.height_at_year);
    return h > bh ? r : best;
  });
}

function populateBuildingFields(row, year) {
  const safe = v => (v && v !== 'NA') ? v : '—';

  const setText = (id, v) => {
    const el = document.getElementById(id);
    if (el) el.textContent = v;
  };

  // Standard fields
  setText('bldgTitle', safe(row.name));
  setText('bldgRelOrigin', safe(row.religion_origin));
  setText('bldgRelCurrent', safe(row.religion_current));
  setText('bldgRelGroup', safe(row.religion_group));
  setText('bldgType', safe(row.type));
  setText('bldgCountry', safe(row.country));
  setText('bldgContinent', safe(row.continent));
  setText('bldgStart', safe(row.construction_start));
  setText('bldgEnd', safe(row.construction_end));
  setText('bldgDestroyed', safe(row.destruction_year));
  setText('bldgHeightM', safe(row.height_m));
  setText('bldgMaxHeight', safe(row.max_height));
  setText('bldgHeightAtYear',
    (row.height_at_year && row.height_at_year !== 'NA') ? Number(row.height_at_year).toFixed(0) : '—'
  );
  setText('bldgYear', year);

/* -------------------------
   WIKIPEDIA (source1)
   Thumbnail loader
------------------------- */
const wikiDiv = document.getElementById('bldgWiki');

if (wikiDiv) {
  if (row.source1 && row.source1 !== 'NA') {
    const wikiUrl = row.source1;

    // Extract and decode page title
    const pageTitle = decodeURIComponent(wikiUrl.split("/").pop());

    // Summary endpoint (browser-safe)
    const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${pageTitle}`;

    fetch(summaryUrl)
      .then(r => r.json())
      .then(data => {
        let img = null;

        // Summary endpoint thumbnail
        if (data.thumbnail && data.thumbnail.source) {
          img = data.thumbnail.source;
        }

        // Render
        wikiDiv.innerHTML = `
          ${img ? `<img id="wikiThumb" src="${img}">` : ""}
          <a id="wikiLink" href="${wikiUrl}" target="_blank">${row.name} — Wikipedia</a>
        `;
      })
      .catch(() => {
        // Fallback: link only
        wikiDiv.innerHTML = `
          <a id="wikiLink" href="${wikiUrl}" target="_blank">${row.name} — Wikipedia</a>
        `;
      });

  } else {
    wikiDiv.innerHTML = "";
  }
}



  /* -------------------------
     OTHER SOURCES (source2, source3)
  ------------------------- */
  const otherDiv = document.getElementById('bldgOtherSources');
  if (otherDiv) {
    const links = [];

    if (row.source2 && row.source2 !== 'NA') links.push(`<a href="${row.source2}" target="_blank">Source 2</a>`);
    if (row.source3 && row.source3 !== 'NA') links.push(`<a href="${row.source3}" target="_blank">Source 3</a>`);

    if (links.length > 0) {
      otherDiv.innerHTML = `<span class="kv-key">Other Sources:</span> ${links.join(", ")}`;
    } else {
      otherDiv.innerHTML = "";
    }
  }
}


function renderBuildingTab(row, year) {
  setActiveTab('building');
  populateBuildingFields(row, year);
  const leftContent = document.getElementById("leftContent"); if (leftContent) leftContent.scrollTop = 0;
}

function primeBuildingTabForYear(year) {
  const row = computeTallestRow(year);
  if (row) {
    populateBuildingFields(row, year);
  } else {
    // clear placeholders
    const ids = [
      'bldgTitle','bldgRelOrigin','bldgRelCurrent','bldgType','bldgCountry','bldgContinent',
      'bldgStart','bldgEnd','bldgDestroyed','bldgHeightM','bldgMaxHeight','bldgHeightAtYear','bldgYear'
    ];
    ids.forEach(id => { const el = document.getElementById(id); if (el) el.textContent = '—'; });
    const t = document.getElementById('bldgTitle'); if (t) t.textContent = 'No building available';
  }
}

function renderBuildingTallestForYear(year) {
  const row = computeTallestRow(year);
  setActiveTab('building');
  if (row) {
    populateBuildingFields(row, year);
  } else {
    primeBuildingTabForYear(year);
  }
}

// ============================
// CENTER MAP ON BUILDING
// ============================
function focusOnBuilding(row, year) {
  // Find the marker for this building
  const marker = activeMarkers.find(m => {
    const p = m.getPopup();
    return p && p.getContent().includes(row.name);
  });

  if (!marker) return;

  const target = marker.getLatLng();

  // Step 1: smooth pan to the marker
  map.panTo(target, {
    animate: true,
    duration: 0.8,   // smoother, slower pan
    easeLinearity: 0.25  // softer easing curve
  });

  // Step 2: after pan finishes, zoom in smoothly
  map.once('moveend', () => {
    map.flyTo(target, 6, {
      animate: true,
      duration: 0.9,   // smooth zoom
      easeLinearity: 0.2
    });

    // Step 3: open popup after zoom settles
    setTimeout(() => marker.openPopup(), 200);
  });

  // Switch left panel to Building tab
  renderBuildingTab(row, year);
}




// Tab buttons wiring
(function wireLeftTabs(){
  const btns = document.querySelectorAll('#leftTabs .tab-btn');
  btns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      const year = getCurrentYear();

      if (tab === 'info') {
        renderInfoTab();
      } else if (tab === 'year') {
        renderYearTab(year);
      } else if (tab === 'building') {
        // User manually opens Building => tallest for current year
        renderBuildingTallestForYear(year);
      }
    });
  });
})();

/* ============================
   TICKS
============================ */
function drawTicks() {
  const tickContainer = document.getElementById("yearTicks");
  if (!tickContainer) return;
  tickContainer.innerHTML = "";

  let lastPos = -999;
  const seen = new Set();

  allRows
    .filter(r =>
      r.slider_pos &&
      r.slider_pos !== "NA" &&
      !isNaN(parseFloat(r.slider_pos)) &&
      r.tick_label &&
      r.tick_label !== "NA"
    )
    .forEach(r => {
      if (seen.has(r.tick_label)) return;
      seen.add(r.tick_label);

      const pos = parseFloat(r.slider_pos);
      const px = pos * 100;

      const labelDiv = document.createElement("div");
      labelDiv.className = "tickLabel";
      labelDiv.style.left = px + "%";
      labelDiv.textContent = r.tick_label;

      if (px - lastPos < 6) {
  labelDiv.style.bottom = "28px";   // small upward nudge
}


      const markDiv = document.createElement("div");
      markDiv.className = "tickMark";
      markDiv.style.left = px + "%";

      lastPos = px;

      tickContainer.appendChild(labelDiv);
      tickContainer.appendChild(markDiv);
    });
}

/* ============================
   NEAREST YEAR
============================ */
function nearestYear(pos) {
  let best = null;
  let bestDiff = Infinity;

  allRows.forEach(r => {
    if (!r.slider_pos || r.slider_pos === "NA") return;

    const sp = parseFloat(r.slider_pos);
    if (isNaN(sp)) return;

    const diff = Math.abs(sp - pos);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = parseInt(r.year);
    }
  });

  return best;
}

function triggerShimmer(marker, type) {
  const iconEl = marker.getElement();
  if (!iconEl) return;

  const shimmer = document.createElement("div");
  shimmer.className = "marker-shimmer shimmer-" + type;

  iconEl.appendChild(shimmer);

  // Remove after animation completes
  setTimeout(() => shimmer.remove(), 2000);
}


/* ============================
   UPDATE MAP
============================ */
function updateMap(year) {
  // clear existing
  activeMarkers.forEach(m => map.removeLayer(m));
  activeMarkers = [];

  // rows filtered by year + filters + standing
  const rows = getRowsForYearFiltered(year);

  rows.forEach((row, i) => {
    const lat = parseFloat(row.latitude);
    const lng = parseFloat(row.longitude);
    const rawHeight = parseFloat(row.height_at_year);
const height = isFinite(rawHeight) ? rawHeight : 0;

    if (isNaN(lat) || isNaN(lng) || isNaN(height) || height <= 0) return;

    const iconKey = getIconKey(row.type);
    const iconUrl = iconMap[iconKey];
    const size = Math.max(20, 5 + height * 0.25);

    const [latD, lngD] = dodgePosition(lat, lng, i, map.getZoom());


const html = `
  <div class="marker-wrapper" style="position: relative; width: ${size}px; height: ${size}px;">
    <img src="${iconUrl}" style="width: 100%; height: 100%;">
    ${row.destruction_flag === "Yes" ? `<div class="fire-icon"></div>` : ""}
  </div>
`;



    const divIcon = L.divIcon({
      html: html,
      className: "",
      iconSize: [size, size]
    });

    const marker = L.marker([latD, lngD], { icon: divIcon })
      .addTo(map)
      .bindPopup(`<b>${row.name}</b><br>Height: ${height.toFixed(0)} m<br>Year: ${year}`);

    //shimmer triggers
   if (row.construction_start && parseInt(row.construction_start) + 1 === year) {
  triggerShimmer(marker, "blue");
}

if (row.construction_end && parseInt(row.construction_end) === year) {
  triggerShimmer(marker, "gold");
}

if (row.destruction_year && parseInt(row.destruction_year) === year) {
  triggerShimmer(marker, "red");
}

    
    // On marker click => Building tab with this row
    marker.on('click', () => {
      renderBuildingTab(row, year);
    });

    activeMarkers.push(marker);
  });
}

/* ============================
   LOAD DATA
============================ */
fetch("https://raw.githubusercontent.com/JoeLakeyy/HolyHeights/main/data/Prevalence_religion_V5.csv")



  .then(r => r.text())
  .then(text => {
    allRows = Papa.parse(text, { header: true }).data;

    // Draw timeline ticks
    drawTicks();

    // Build filter checkbox groups
    const religions = new Set();
    const continents = new Set();

    allRows.forEach(r => {
      if (r.religion_group && r.religion_group !== "NA") religions.add(r.religion_group);
      if (r.continent && r.continent !== "NA") continents.add(r.continent);
    });

    buildCheckboxes("filterReligionGroup", religions, "religionChk");
    buildCheckboxes("filterContinentGroup", continents, "continentChk");

    wireSelectAll("religion");
    wireSelectAll("continent");
    syncSelectAll("religion");
    syncSelectAll("continent");

    // Most recent VALID row for slider init
    const validRows = allRows.filter(r =>
      r.slider_pos &&
      r.slider_pos !== "NA" &&
      !isNaN(parseFloat(r.slider_pos))
    );

    // Fallback if none
    if (validRows.length === 0) return;

    const mostRecent = validRows.reduce((a, b) =>
      parseInt(a.year) > parseInt(b.year) ? a : b
    );

    // Initialize slider + map
    if (slider) slider.value = parseFloat(mostRecent.slider_pos);
    if (label) label.textContent = "Year: " + mostRecent.year;

    const initYear = parseInt(mostRecent.year);
    updateMap(initYear);

    // Default active tab: Information
    renderInfoTab();

    // Prime Building tab content for tallest in default year
    primeBuildingTabForYear(initYear);

    // Slider listener => auto-switch to Year + refresh
    if (slider) {
      slider.addEventListener("input", () => {
        const pos = parseFloat(slider.value);
        const year = nearestYear(pos);
        if (label) label.textContent = "Year: " + year;

        // Switch to Year tab + render ranking
        renderYearTab(year);

        // Redraw map
        updateMap(year);

        // Keep Building tab ready with tallest for this year
        primeBuildingTabForYear(year);
      });
    }
  // ============================
// YEAR NAVIGATION BUTTONS
// ============================
const prevBtn = document.getElementById("prevYearBtn");
const nextBtn = document.getElementById("nextYearBtn");

// Build sorted list of all valid years (those with slider_pos)
const allYears = Array.from(
  new Set(
    allRows
      .filter(r => r.slider_pos && r.slider_pos !== "NA")
      .map(r => parseInt(r.year))
  )
).sort((a, b) => a - b);



// Jump to a specific year
function goToYear(targetYear) {
  const row = allRows.find(r => parseInt(r.year) === targetYear);
  if (!row) return;

  const pos = parseFloat(row.slider_pos);
  slider.value = pos;

  if (label) label.textContent = "Year: " + targetYear;

  renderYearTab(targetYear);
  updateMap(targetYear);
  primeBuildingTabForYear(targetYear);
}

// Previous year button
if (prevBtn) {
  prevBtn.addEventListener("click", () => {
    const current = getCurrentYear();
    const idx = allYears.indexOf(current);
    if (idx > 0) goToYear(allYears[idx - 1]);
  });
}

// Next year button
if (nextBtn) {
  nextBtn.addEventListener("click", () => {
    const current = getCurrentYear();
    const idx = allYears.indexOf(current);
    if (idx < allYears.length - 1) goToYear(allYears[idx + 1]);
  });
}


// ============================
// PLAYBACK ENGINE
// ============================

// Load event timeline
let timelineEvents = [];

fetch("https://raw.githubusercontent.com/JoeLakeyy/HolyHeights/main/data/year_religion.csv")


  .then(r => r.text())
  .then(text => {
    timelineEvents = Papa.parse(text, { header: true }).data
      .filter(r => r.year && r.year !== "NA")
      .map(r => ({
        year: parseInt(r.year),
        type: r.event_type
      }))
      .sort((a, b) => a.year - b.year);
  });

// Timing rules
function getDelayForEvent(evt) {
  const y = evt.year;

  // Normalize year into 0–1 range (roughly)
  const t = Math.pow((y + 3000) / 5000, 2.5);

  // Base delay curve (ancient fast → modern slow)
  // Ancient ~60ms, modern ~600ms
  const base = 20 + t * 540;

  // Event type weighting
  if (evt.type === "cons_start") return base * 2;
  if (evt.type === "cons_end")   return base * 2.5;
  if (evt.type === "destruction")return base * 3;

  return base;
}


// Playback state
let playIndex = 0;
let playTimer = null;
let isPlaying = false;
let currentSpeedMultiplier = 1;

// Helpers
const firstYear = allYears[0];
const lastYear = allYears[allYears.length - 1];

function jumpToYear(year) {
  const row = allRows.find(r => parseInt(r.year) === year);
  if (!row) return;

  slider.value = parseFloat(row.slider_pos);
  label.textContent = "Year: " + year;

  renderYearTab(year);
  updateMap(year);
  primeBuildingTabForYear(year);
}

function findSliderPosForYear(year) {
  const row = allRows.find(r => parseInt(r.year) === year);
  return row ? parseFloat(row.slider_pos) : slider.value;
}

// Playback loop
function playNextEvent() {
  if (!isPlaying) return;

  if (playIndex >= timelineEvents.length) {
    isPlaying = false;
    playPauseBtn.textContent = "▶";
    return;
  }

  const evt = timelineEvents[playIndex];
  const year = evt.year;

  if (year >= lastYear) {
    isPlaying = false;
    playPauseBtn.textContent = "▶";
    jumpToYear(lastYear);
    return;
  }

  jumpToYear(year);

  // Compute delay fresh every time
  const delay = getDelayForEvent(evt) / currentSpeedMultiplier;

  playIndex++;
  playTimer = setTimeout(playNextEvent, delay);
}


// Start playback
function startPlayback() {
  if (isPlaying) return;

  const current = getCurrentYear();

  if (current >= lastYear) {
    playIndex = 0;
  } else {
    playIndex = timelineEvents.findIndex(e => e.year >= current);
    if (playIndex === -1) playIndex = 0;
  }

  isPlaying = true;
  playPauseBtn.textContent = "⏸";
  playNextEvent();
}

// Pause playback
function pausePlayback() {
  isPlaying = false;
  clearTimeout(playTimer);
  playPauseBtn.textContent = "▶";
}

// Stop playback (reset)
function stopPlayback() {
  isPlaying = false;
  clearTimeout(playTimer);
  playIndex = 0;
  playPauseBtn.textContent = "▶";
}

// Wire buttons
const backToStartBtn = document.getElementById("backToStartBtn");
const playPauseBtn = document.getElementById("playPauseBtn");
const speedToggleBtn = document.getElementById("speedToggleBtn");

backToStartBtn.addEventListener("click", () => {
  stopPlayback();
  jumpToYear(firstYear);
});

playPauseBtn.addEventListener("click", () => {
  if (!isPlaying) startPlayback();
  else pausePlayback();
});

// Speed toggle: 1× → 2× → 4× → 8× → back to 1×
const speedModes = [1, 2, 4, 8];
let speedIndex = 0;

speedToggleBtn.textContent = "1×";

speedToggleBtn.addEventListener("click", () => {
  speedIndex = (speedIndex + 1) % speedModes.length;
  currentSpeedMultiplier = speedModes[speedIndex];
  speedToggleBtn.textContent = speedModes[speedIndex] + "×";
});

// Stop playback on manual interaction
slider.addEventListener("input", pausePlayback);
prevYearBtn.addEventListener("click", pausePlayback);
nextBtn.addEventListener("click", pausePlayback);

  })
  .catch(err => {
    console.error("Failed to load CSV:", err);
  });

window.addEventListener("load", () => {
  const leafletAttr = document.querySelector(".leaflet-control-attribution");
  if (!leafletAttr) return;

  // Create custom bar
  const bar = document.createElement("div");
  bar.id = "customAttribution";
  bar.innerHTML = leafletAttr.innerHTML;

  // Add to page
  document.body.appendChild(bar);

  // Toggle expand/collapse
  bar.addEventListener("click", () => {
    bar.classList.toggle("expanded");
  });
});

// Desktop resizing
const resizer = document.getElementById("leftPanelResizer");
let isResizing = false;

resizer.addEventListener("mousedown", () => { 
  isResizing = true; 
});

document.addEventListener("mouseup", () => { 
  isResizing = false; 
});

document.addEventListener("mousemove", (e) => {
  if (!isResizing) return;

  const newWidth = Math.min(Math.max(e.clientX, 200), 500);
  document.documentElement.style.setProperty("--left-panel-width", newWidth + "px");
});


// --- Mobile touch support for left panel resizer ---
resizer.addEventListener("touchstart", (e) => {
  isResizing = true;
  e.preventDefault(); // prevents scrolling while dragging
});

document.addEventListener("touchend", () => {
  isResizing = false;
});

document.addEventListener("touchmove", (e) => {
  if (!isResizing) return;

  const touch = e.touches[0];
  const newWidth = Math.min(Math.max(touch.clientX, 200), 500);
  document.documentElement.style.setProperty("--left-panel-width", newWidth + "px");
});


document.getElementById("legendHeader").addEventListener("click", () => {
  document.getElementById("mapLegend").classList.toggle("collapsed");
});