const STORAGE_KEY = "seabirdmapper-records-v1"; // UPDATED: Unique key for Seabird data

const state = {
  map: null,
  activeMarker: null,
  locationMarker: null,
  orthophotoLayer: null,
  studySitesLayer: null,
  recordsLayer: null, 
  records: [],
  editingRecords: null, 
};

const statusText = document.getElementById("statusText");
const recordCount = document.getElementById("recordCount");
const recordsBody = document.getElementById("recordsBody");
const locateBtn = document.getElementById("locateBtn");
const exportBtn = document.getElementById("exportBtn");
const clearAllBtn = document.getElementById("clearAllBtn");
const helpBtn = document.getElementById("helpBtn");
const manualModal = document.getElementById("manual-modal");
const closeManualBtn = document.getElementById("closeManualBtn");
const activeMarkerIcon = L.divIcon({
  className: "bird-marker",
  html: `
    <svg viewBox="0 0 40 56" aria-hidden="true">
      <path d="M20 2C10.06 2 2 10.06 2 20c0 13.45 15.63 30.46 17.44 32.39a.75.75 0 0 0 1.12 0C22.37 50.46 38 33.45 38 20 38 10.06 29.94 2 20 2Z" fill="#ccb312"/>
      <path d="M20 7.5c-6.9 0-12.5 5.6-12.5 12.5 0 9.15 9.15 20.96 12.5 24.95 3.35-3.99 12.5-15.8 12.5-24.95 0-6.9-5.6-12.5-12.5-12.5Z" fill="#ccb312"/>
      <circle cx="20" cy="20" r="8.5" fill="#fff7ef"/>
      <circle cx="20" cy="20" r="4.2" fill="#305f4b"/>
    </svg>
  `,
  iconSize: [28, 40],
  iconAnchor: [14, 40],
  popupAnchor: [0, -34],
});

const savedMarkerIcon = L.divIcon({
  className: "saved-marker",
  html: `
    <svg viewBox="0 0 40 56" aria-hidden="true">
      <path d="M20 2C10.06 2 2 10.06 2 20c0 13.45 15.63 30.46 17.44 32.39a.75.75 0 0 0 1.12 0C22.37 50.46 38 33.45 38 20 38 10.06 29.94 2 20 2Z" fill="#b93829"/>
      <path d="M20 7.5c-6.9 0-12.5 5.6-12.5 12.5 0 9.15 9.15 20.96 12.5 24.95 3.35-3.99 12.5-15.8 12.5-24.95 0-6.9-5.6-12.5-12.5-12.5Z" fill="#b93829"/>
      <circle cx="20" cy="20" r="8.5" fill="#fff7ef"/>
      <circle cx="20" cy="20" r="4.2" fill="#305f4b"/>
    </svg>
  `,
  // We match the exact sizing and anchoring of the Active Pin
  iconSize: [28, 40],
  iconAnchor: [14, 40],
  popupAnchor: [0, -34],
});

const locationMarkerIcon = L.divIcon({
  className: "location-marker",
  html: `
    <svg viewBox="0 0 26 26" aria-hidden="true">
      <circle cx="13" cy="13" r="11" fill="rgba(33, 68, 52, 0.18)"/>
      <circle cx="13" cy="13" r="6.5" fill="#FFC107" stroke="#fffdf7" stroke-width="2"/>
    </svg>
  `,
  iconSize: [26, 26],
  iconAnchor: [13, 13],
});

initialize();

function initialize() {
  loadRecords();
  initializeMap();
  renderTable();
  renderMapMarkers(); 
  bindGlobalActions();
}

function initializeMap() {
  state.map = L.map("map", {
    zoomControl: false, 
    maxZoom: 21,
  }).setView([22.359591, 114.347229], 10);

  // Load online ArcGIS tiles
  L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    {
      attribution: "&copy; Esri, Maxar, Earthstar Geographics",
      maxZoom: 21,
      // UX FIX: An invisible, transparent 1x1 pixel image.
      // If you lose internet in the field, broken tiles become invisible rather than showing ugly error icons!
      errorTileUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
    }
  ).addTo(state.map);

  loadOrthophotos();
  loadStudySitesLayer();

  state.map.on("click", (event) => {
    if (state.activeMarker) return; 
    openEditorAt(event.latlng);
  });
}

function renderMapMarkers() {
  if (state.recordsLayer) {
    state.map.removeLayer(state.recordsLayer);
  }
  
  state.recordsLayer = L.featureGroup().addTo(state.map);

  const uniqueLocations = {};
  state.records.forEach(record => {
    const key = `${record.lat},${record.lng}`;
    if (!uniqueLocations[key]) uniqueLocations[key] = [];
    uniqueLocations[key].push(record);
  });

  Object.values(uniqueLocations).forEach(locationRecords => {
    const first = locationRecords[0];
    const latlng = L.latLng(first.lat, first.lng);
    
    const marker = L.marker(latlng, { icon: savedMarkerIcon }).addTo(state.recordsLayer);
    
    marker.on('click', () => {
      openEditorAt(latlng, locationRecords);
    });
  });
}

function loadOrthophotos() {
  const images = normalizeOrthophotoImages(window.ORTHOPHOTO_IMAGES);
  if (images.length === 0) return;
  createOrthophotoPane();
  const overlays = images.map((image) => createOrthophotoOverlay(image)).filter(Boolean);
  if (overlays.length === 0) return;
  state.orthophotoLayer = L.layerGroup(overlays).addTo(state.map);
}

function normalizeOrthophotoImages(images) {
  return Array.isArray(images) ? images : images ? [images] : [];
}

function createOrthophotoPane() {
  if (state.map.getPane("orthophotoPane")) return;
  const pane = state.map.createPane("orthophotoPane");
  pane.style.zIndex = 300;
  pane.style.pointerEvents = "none";
}

function createOrthophotoOverlay(image) {
  const west = Number(image.west);
  const south = Number(image.south);
  const east = Number(image.east);
  const north = Number(image.north);

  if (![west, south, east, north].every(Number.isFinite)) return null;
  const bounds = L.latLngBounds([south, west], [north, east]);

  return L.imageOverlay(image.path, bounds, {
    pane: "orthophotoPane",
    interactive: false,
    opacity: 1,
  });
}

function loadStudySitesLayer() {
  // 1. Gather all possible KML variables into a list
  const kmlFiles = [
    window.STUDY_SITES_KML, //Fishpond
    //window.STUDY_SITES_KML_2, // For multiple kml
    //window.STUDY_SITES_KML_3 // For multiple kml
  ];

  // 2. Create a master invisible layer on the map to hold ALL the files
  state.studySitesLayer = L.featureGroup().addTo(state.map);
  let loadedCount = 0;

  // 3. Loop through each KML file in our list
  kmlFiles.forEach((kmlText) => {
    // Only try to draw it if the variable actually has KML text inside it
    if (typeof kmlText === "string" && kmlText.trim()) {
      try {
        const layer = createStudySitesLayer(kmlText);
        if (layer) {
          // Add this specific KML file's shapes to the master layer
          layer.addTo(state.studySitesLayer);
          loadedCount++;
        }
      } catch (error) {
        console.error("Failed to parse one of the KML files:", error);
      }
    }
  });

  // 4. Update the UI text if at least one file loaded successfully
  if (loadedCount > 0) {
    statusText.textContent = "Study sites loaded. Click map to add records.";
  } else {
    // We don't show an error if they are just empty, only if they failed to load entirely.
    if (kmlFiles.some(kml => typeof kml === "string" && kml.trim())) {
        statusText.textContent = "Failed to load study sites.";
    }
  }
}

function createStudySitesLayer(kmlText) {
  const parser = new DOMParser();
  const xml = parser.parseFromString(kmlText, "application/xml");
  const parseError = xml.querySelector("parsererror");
  if (parseError) throw new Error("Invalid KML document.");

  const placemarks = getElementsByLocalName(xml, "Placemark");
  const layers = placemarks.map((placemark) => createPlacemarkLayer(placemark)).filter(Boolean);
  return layers.length > 0 ? L.featureGroup(layers) : null;
}

function createPlacemarkLayer(placemark) {
  const name = getFirstDescendantText(placemark, "name") || "Unnamed site";
  const styleUrl = getFirstDescendantText(placemark, "styleUrl");
  const popupHtml = buildStudySitePopup(name);

  // 1. Check for Points (Pins)
  const point = getFirstDescendantByLocalName(placemark, "Point");
  if (point) {
    const coordinateText = getFirstDescendantText(point, "coordinates");
    const latlng = parseSingleCoordinate(coordinateText);
    if (!latlng) return null;
    return L.circleMarker(latlng, { radius: 5, color: "#214434", weight: 2, fillColor: "#e8f3c8", fillOpacity: 0.95 }).bindPopup(popupHtml);
  }

  // 2. Check for Polygons (Plots)
  const polygon = getFirstDescendantByLocalName(placemark, "Polygon");
  if (polygon) {
    const rings = getElementsByLocalName(polygon, "outerBoundaryIs")
      .map((boundary) => parseCoordinateRing(getFirstDescendantText(boundary, "coordinates")))
      .filter((ring) => ring.length >= 3);
    if (rings.length === 0) return null;
    
    const polyLayer = L.polygon(rings, getStudySitePolygonStyle(styleUrl, name))
      .bindTooltip(name, { 
        permanent: true,       
        direction: "center",   
        className: "polygon-label" 
      });

    polyLayer.on('click', (e) => {
      if (state.activeMarker) return; 
      openEditorAt(e.latlng, null, name); 
    });

    return polyLayer;
  }

  // 3. NEW: Check for LineStrings (Transects/Paths)
  const lineString = getFirstDescendantByLocalName(placemark, "LineString");
  if (lineString) {
    const coordinateText = getFirstDescendantText(lineString, "coordinates");
    const latlngs = parseCoordinateRing(coordinateText); // Uses your existing coordinate parser
    
    if (latlngs.length >= 2) {
      const lineLayer = L.polyline(latlngs, {
        color: "#FF8C00",   // Bright Orange to stand out from the Cyan
        weight: 5,          // Thick enough to easily tap with a finger
        dashArray: "10, 8", // Creates a dashed "walking trail" look
        opacity: 0.9
      }).bindTooltip(name, { 
        sticky: true,       // Makes the name hover next to your finger when you touch it
        className: "polygon-label" 
      });

      // Let surveyors tap the line to auto-fill the transect name!
      lineLayer.on('click', (e) => {
        if (state.activeMarker) return; 
        openEditorAt(e.latlng, null, name); 
      });

      return lineLayer;
    }
  }

  return null;
}

function buildStudySitePopup(name, groupName, description) {
  const parts = [`<strong>${escapeHtml(name)}</strong>`];
  if (groupName) parts.push(`<div>${escapeHtml(groupName)}</div>`);
  if (description) parts.push(`<div>${escapeHtml(description)}</div>`);
  return parts.join("");
}

function getElementsByLocalName(root, localName) {
  return Array.from(root.getElementsByTagNameNS("*", localName));
}

function getFirstDescendantByLocalName(root, localName) {
  return getElementsByLocalName(root, localName)[0] ?? null;
}

function getDirectChildText(root, localName) {
  const child = Array.from(root.children).find((element) => element.localName === localName);
  return child?.textContent?.trim() ?? "";
}

function getFirstDescendantText(root, localName) {
  return getFirstDescendantByLocalName(root, localName)?.textContent?.trim() ?? "";
}

function parseSingleCoordinate(coordinatesText) {
  const [lng, lat] = splitCoordinateValues(coordinatesText);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return L.latLng(lat, lng);
}

function parseCoordinateRing(coordinatesText) {
  return coordinatesText.trim().split(/\s+/).map((coordinateText) => {
    const [lng, lat] = splitCoordinateValues(coordinateText);
    return Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] : null;
  }).filter(Boolean);
}

function splitCoordinateValues(coordinateText) {
  return coordinateText.split(",").slice(0, 2).map((value) => Number(value.trim()));
}

function bindGlobalActions() {
  // Open and Close the Manual
  helpBtn.addEventListener("click", () => manualModal.classList.remove("hidden"));
  closeManualBtn.addEventListener("click", () => manualModal.classList.add("hidden"));

  locateBtn.addEventListener("click", locateUser);
  exportBtn.addEventListener("click", exportXlsx);
  clearAllBtn.addEventListener("click", clearAllRecords);

  // Listen for clicks inside the data table
  recordsBody.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;

    // ==========================================
    // BUG FIX: Block table edits if a map popup is open
    // ==========================================
    if (state.activeMarker) {
      alert("Please Save or Cancel your open map popup before editing the table!");
      return; // Stops the code here so the table buttons do nothing
    }

    const { action, id } = button.dataset;
    const record = state.records.find((item) => item.id === id);
    if (!record) return;

    if (action === "edit") {
      editRecord(record);
      return;
    }

    if (action === "delete") {
      deleteRecord(record.id);
      return;
    }

    if (action === "increase-count") {
      updateRecordCount(record.id, 1);
      return;
    }

    if (action === "decrease-count") {
      updateRecordCount(record.id, -1);
      return;
    }
  });
}

function updateRecordCount(id, delta) {
  const index = state.records.findIndex(r => r.id === id);
  if (index === -1) return;

  const newQuantity = Number(state.records[index].quantity) + delta;
  
  // UPDATED: Now allows 0. Only prompts for deletion if it drops below 0 (-1)
  if (newQuantity < 0) {
    const confirmed = window.confirm("Count is dropping below 0. Do you want to delete this species record?");
    if (confirmed) deleteRecord(id);
  } else {
    state.records[index].quantity = newQuantity;
    persistRecords();
    renderTable();
    renderMapMarkers(); 
  }
}

function locateUser() {
  if (!navigator.geolocation) {
    statusText.textContent = "Geolocation not supported.";
    return;
  }
  locateBtn.disabled = true;
  statusText.textContent = "Locating...";

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const latlng = L.latLng(position.coords.latitude, position.coords.longitude);
      updateLocationMarker(latlng);
      state.map.setView(latlng, Math.max(state.map.getZoom(), 16));
      locateBtn.disabled = false;
      statusText.textContent = "Location found.";
    },
    (error) => {
      locateBtn.disabled = false;
      statusText.textContent = "Location failed.";
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
}

function updateLocationMarker(latlng) {
  if (state.locationMarker) {
    state.locationMarker.setLatLng(latlng);
    return;
  }
  state.locationMarker = L.marker(latlng, { icon: locationMarkerIcon }).addTo(state.map);
}

function loadRecords() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    state.records = raw ? JSON.parse(raw) : [];
  } catch (error) {
    state.records = [];
  }
}

function persistRecords() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.records));
}

function clearPersistedRecords() {
  localStorage.removeItem(STORAGE_KEY);
}

function openEditorAt(latlng, recordsToEdit = null, defaultPlotNo = "") {
  clearActiveMarker();

  state.editingRecords = recordsToEdit;
  state.activeMarker = L.marker(latlng, { icon: activeMarkerIcon }).addTo(state.map);
  state.map.panTo(latlng);
  statusText.textContent = recordsToEdit ? "Editing checklist..." : "Adding new record...";

  state.activeMarker.on("popupopen", () => bindPopupForm());
  
  state.activeMarker.on("popupclose", () => {
    if (state.activeMarker) {
      statusText.textContent = "Marker not created";
      state.editingRecords = null;
      clearActiveMarker(); 
    }
  });

  // Pass the defaultPlotNo down to the HTML builder
  state.activeMarker.bindPopup(buildPopupHtml(recordsToEdit, latlng, defaultPlotNo), {
    closeButton: true,
    autoClose: false,
    closeOnClick: false,
    minWidth: 290,  
  });

  state.activeMarker.openPopup();
}

function getDefaultRecord(latlng, defaultPlotNo = "") {
  const now = new Date();
  return {
    date: getLocalDateString(now),
    time: now.toTimeString().slice(0, 5),
    lat: roundCoordinate(latlng.lat),
    lng: roundCoordinate(latlng.lng),
    plotNo: defaultPlotNo,   
    plotRemarks: "",
    temperature: "",   
    weather: "",       
    windDirection: "", 
    windForce: "",
    disturbances: [],  // NEW: An array to hold infinite disturbances
    remarks: "",  
    species: "",
    quantity: "",
  };
}

function buildPopupHtml(recordsToEdit, latlng, defaultPlotNo = "") {
  const isEditing = recordsToEdit && recordsToEdit.length > 0;
  const title = isEditing ? "Location Checklist" : "New Record";
  
  const baseRecord = isEditing ? recordsToEdit[0] : getDefaultRecord(latlng, defaultPlotNo);

  let rowsHtml = '';

  const buildSpeciesRow = (id, num, sp, qty, nNum, nMin, nMax, jNum, rem, isHidden) => `
    <div class="species-entry" data-id="${escapeAttribute(id)}" style="border-bottom: 1px solid #eee; padding-bottom: 5px; margin-bottom: 5px;">
      <div class="species-main-row" style="display: flex; gap: 5px; width: 100%; align-items: center;">
        <span class="row-number" style="font-weight: bold; font-size: 14px; color: #7f3f98; min-width: 15px;">${num}.</span>
        <input class="speciesInput" list="hk-birds" style="flex: 4; width: 100%; box-sizing: border-box;" type="text" value="${escapeAttribute(sp)}" maxlength="100" placeholder="Species" required>
        <input class="quantityInput" style="flex: 1.5; width: 100%; box-sizing: border-box;" type="number" value="${escapeAttribute(qty)}" min="0" step="1" placeholder="Qty" required>
        <button type="button" class="toggle-details-btn" style="padding: 0 8px; background: #e8f3c8; color: #214434; border: 1px solid #d6c8a6; font-size: 12px; height: 32px; border-radius: 4px;">➕</button>
        <button type="button" class="remove-btn danger" style="padding: 0 10px; display: ${isHidden ? 'none' : 'inline-block'};">X</button>
      </div>
      
      <div class="species-details-row" style="display: none; margin-top: 5px; background: rgba(0,0,0,0.02); padding: 6px; border-radius: 4px; border: 1px dashed #ccc;">
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 5px; margin-bottom: 5px;">
          <input class="nestNumInput" type="number" min="0" value="${escapeAttribute(nNum)}" placeholder="Nests" style="text-align: center; padding: 2px;">
          <input class="nestMinInput" type="number" step="0.1" value="${escapeAttribute(nMin)}" placeholder="Min(m)" style="text-align: center; padding: 2px;">
          <input class="nestMaxInput" type="number" step="0.1" value="${escapeAttribute(nMax)}" placeholder="Max(m)" style="text-align: center; padding: 2px;">
          <input class="juvNumInput" type="number" min="0" value="${escapeAttribute(jNum)}" placeholder="Juv" style="text-align: center; padding: 2px;">
        </div>
        <input class="remarksInput" style="width: 100%; box-sizing: border-box;" type="text" value="${escapeAttribute(rem)}" placeholder="Other Remarks">
      </div>
    </div>
  `;

  if (isEditing) {
    recordsToEdit.forEach((r, i) => {
      rowsHtml += buildSpeciesRow(r.id, i + 1, r.species, String(r.quantity), r.nestNum, r.nestMin, r.nestMax, r.juvNum, r.remarks, false);
    });
  } else {
    const defaultSpecies = ["Bridled Tern", "Roseate Tern", "Black-naped Tern"];
    defaultSpecies.forEach((sp, i) => {
      rowsHtml += buildSpeciesRow("", i + 1, sp, "", "", "", "", "", "", false);
    });
  }

  return `
    <div class="popup-form" style="width: 100%;">
      <strong>${title}</strong>
      
      <div style="max-height: 300px; overflow-y: auto; overflow-x: hidden; padding-right: 5px; margin-top: 10px; margin-bottom: 5px;">
        <div class="popup-grid" style="margin-bottom: 5px; width: 100%;">
          <input id="dateInput" type="date" style="width: 100%; box-sizing: border-box;" value="${escapeAttribute(baseRecord.date)}" required>
          <input id="timeInput" type="time" style="width: 100%; box-sizing: border-box;" value="${escapeAttribute(baseRecord.time)}" required>
        </div>
        
        <div style="margin-bottom: 5px; width: 100%; display: flex; gap: 5px;">
          <input id="plotInput" type="text" style="flex: 1; box-sizing: border-box;" value="${escapeAttribute(baseRecord.plotNo)}" placeholder="Plot ID">
          <input id="plotRemarksInput" type="text" style="flex: 2; box-sizing: border-box;" value="${escapeAttribute(baseRecord.plotRemarks)}" placeholder="Plot Notes">
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1.5fr 1fr 1fr; gap: 5px; margin-bottom: 5px; width: 100%;">
          <input id="tempInput" type="number" step="0.1" style="width: 100%; box-sizing: border-box; text-align: center; padding-left: 2px; padding-right: 2px;" value="${escapeAttribute(baseRecord.temperature)}" placeholder="Temp">
          <input id="weatherInput" type="text" style="width: 100%; box-sizing: border-box; text-align: center; padding-left: 2px; padding-right: 2px;" value="${escapeAttribute(baseRecord.weather)}" placeholder="Weather">
          <input id="windDirInput" type="text" style="width: 100%; box-sizing: border-box; text-align: center; padding-left: 2px; padding-right: 2px;" value="${escapeAttribute(baseRecord.windDirection)}" placeholder="W-Dir">
          <input id="windForceInput" type="text" style="width: 100%; box-sizing: border-box; text-align: center; padding-left: 2px; padding-right: 2px;" value="${escapeAttribute(baseRecord.windForce)}" placeholder="W-Force">
        </div>

        <div style="margin-bottom: 10px; width: 100%; border-top: 1px dashed #ccc; padding-top: 5px;">
          <div id="disturbanceList" style="width: 100%;"></div>
          <button type="button" id="addDisturbanceBtn" style="width: 100%; border: 1px dashed #d94f3d; background: transparent; color: #d94f3d; padding: 4px; font-size: 12px;">+ Add Disturbance</button>
        </div>
        <div style="width: 100%; border-top: 1px dashed #ccc; margin-bottom: 10px;"></div>
        
        <div id="speciesList" style="width: 100%;">
          ${rowsHtml}
        </div>
        
        <button type="button" id="addSpeciesBtn" style="margin-bottom: 10px; width: 100%; border: 1px dashed #7f3f98; background: transparent; color: #7f3f98; box-sizing: border-box;">+ Add Species</button>
      </div>

      <div class="error-text" id="formError"></div>
      
      <div class="popup-actions" style="width: 100%; display: flex; flex-wrap: wrap; gap: 5px;">
        <button id="saveBtn" type="button" style="flex: 1;" disabled>Save</button>
        <button id="cancelBtn" type="button" class="danger" style="flex: 1;">Cancel</button>
        ${isEditing ? `<button id="deleteChecklistBtn" type="button" class="danger" style="flex-basis: 100%; margin-top: 5px;">Delete Entire Location</button>` : ''}
      </div>
    </div>
  `;
}

function bindPopupForm() {
  const popupRoot = state.activeMarker?.getPopup()?.getElement();
  if (!popupRoot) return;

  const dateInput = popupRoot.querySelector("#dateInput");
  const timeInput = popupRoot.querySelector("#timeInput");
  const plotInput = popupRoot.querySelector("#plotInput");
  const plotRemarksInput = popupRoot.querySelector("#plotRemarksInput"); 
  const tempInput = popupRoot.querySelector("#tempInput");
  const weatherInput = popupRoot.querySelector("#weatherInput");
  const windDirInput = popupRoot.querySelector("#windDirInput");
  const windForceInput = popupRoot.querySelector("#windForceInput");

  const speciesList = popupRoot.querySelector("#speciesList");
  const addSpeciesBtn = popupRoot.querySelector("#addSpeciesBtn");
  const saveBtn = popupRoot.querySelector("#saveBtn");
  const cancelBtn = popupRoot.querySelector("#cancelBtn");
  const formError = popupRoot.querySelector("#formError");
  const deleteChecklistBtn = popupRoot.querySelector("#deleteChecklistBtn");

  const disturbanceList = popupRoot.querySelector("#disturbanceList");
  const addDisturbanceBtn = popupRoot.querySelector("#addDisturbanceBtn");

  const addDisturbanceUI = (dist = {}) => {
    const row = document.createElement("div");
    row.className = "dist-row";
    row.style.cssText = "background: #fdfdfd; border: 1px solid #d6c8a6; border-radius: 6px; padding: 6px; margin-bottom: 6px; position: relative;";

    // UPDATED: Added list="hk-birds" to the Raptor Species input (class="r-sp") below!
    row.innerHTML = `
      <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
        <select class="dist-type" style="flex: 1; padding: 4px; border-radius: 4px; border: 1px solid #ccc; font-size: 12px; background: #fffdf8;">
          <option value="" ${!dist.type ? 'selected' : ''}>-- Select Type --</option>
          <option value="Raptor" ${dist.type === 'Raptor' ? 'selected' : ''}>🦅 Raptor</option>
          <option value="Visitor" ${dist.type === 'Visitor' ? 'selected' : ''}>🚶 Visitor</option>
          <option value="Boat" ${dist.type === 'Boat' ? 'selected' : ''}>🚤 Boat</option>
        </select>
        <button type="button" class="remove-dist danger" style="padding: 2px 8px; margin-left: 5px; font-size: 12px; height: 26px;">X</button>
      </div>
      <div class="fields raptor-fields" style="display: ${dist.type === 'Raptor' ? 'grid' : 'none'}; grid-template-columns: 1fr 1fr; gap: 5px;">
        <input class="r-sp" type="text" list="hk-birds" placeholder="Raptor Species" value="${escapeAttribute(dist.rSpecies)}">
        <input class="r-num" type="number" placeholder="Number" value="${escapeAttribute(dist.rNum)}">
        <input class="r-beh" type="text" placeholder="Behavior" value="${escapeAttribute(dist.rBeh)}" style="grid-column: span 2;">
      </div>
      <div class="fields visitor-fields" style="display: ${dist.type === 'Visitor' ? 'grid' : 'none'}; grid-template-columns: 1fr 1fr; gap: 5px;">
        <input class="v-num" type="number" placeholder="People" value="${escapeAttribute(dist.vNum)}">
        <input class="v-act" type="text" placeholder="Activity" value="${escapeAttribute(dist.vAct)}">
        <input class="v-rem" type="text" placeholder="Edu/Remarks" value="${escapeAttribute(dist.vRem)}" style="grid-column: span 2;">
      </div>
      <div class="fields boat-fields" style="display: ${dist.type === 'Boat' ? 'grid' : 'none'}; grid-template-columns: 1fr 1fr; gap: 5px;">
        <input class="b-type" type="text" placeholder="Boat Type" value="${escapeAttribute(dist.bType)}">
        <input class="b-reg" type="text" placeholder="Reg No." value="${escapeAttribute(dist.bReg)}">
        <input class="b-pass" type="number" placeholder="Passengers" value="${escapeAttribute(dist.bPass)}">
        <input class="b-act" type="text" placeholder="Activity (on-going)" value="${escapeAttribute(dist.bAct)}">
        <input class="b-rem" type="text" placeholder="Remarks" value="${escapeAttribute(dist.bRem)}" style="grid-column: span 2;">
      </div>
    `;

    const select = row.querySelector(".dist-type");
    const rFields = row.querySelector(".raptor-fields");
    const vFields = row.querySelector(".visitor-fields");
    const bFields = row.querySelector(".boat-fields");

    select.addEventListener("change", (e) => {
        const val = e.target.value;
        rFields.style.display = val === "Raptor" ? "grid" : "none";
        vFields.style.display = val === "Visitor" ? "grid" : "none";
        bFields.style.display = val === "Boat" ? "grid" : "none";
    });

    row.querySelector(".remove-dist").addEventListener("click", () => row.remove());
    disturbanceList.appendChild(row);
    disturbanceList.parentNode.scrollTop = disturbanceList.parentNode.scrollHeight;
  };

  const baseRecordEdit = state.editingRecords ? state.editingRecords[0] : null;
  if (baseRecordEdit && baseRecordEdit.disturbances && Array.isArray(baseRecordEdit.disturbances)) {
      baseRecordEdit.disturbances.forEach(d => addDisturbanceUI(d));
  }

  if (addDisturbanceBtn) {
      addDisturbanceBtn.addEventListener("click", () => addDisturbanceUI());
  }

  const validate = () => {
    const rows = popupRoot.querySelectorAll(".species-entry");
    let allValid = true;
    
    if (!dateInput.value || !timeInput.value) allValid = false;
    if (rows.length === 0) allValid = false; 

    rows.forEach((row, index) => {
      const numSpan = row.querySelector(".row-number");
      if (numSpan) numSpan.textContent = `${index + 1}.`;

      const species = row.querySelector(".speciesInput").value.trim();
      const quantity = row.querySelector(".quantityInput").value.trim();
      const quantityValid = /^\d+$/.test(quantity) && Number(quantity) >= 0;
      if (species.length === 0 || !quantityValid) allValid = false;
    });

    saveBtn.disabled = !allValid;
    formError.textContent = allValid ? "" : (rows.length === 0 ? "You must add at least one species." : "Please fill in species and count (>= 0).");

    const removeBtns = popupRoot.querySelectorAll(".remove-btn");
    removeBtns.forEach(btn => {
      btn.style.display = rows.length > 1 ? "inline-block" : "none";
    });
  };

  const setupSpeciesRowActions = (entryDiv) => {
    const speciesInput = entryDiv.querySelector(".speciesInput");
    const quantityInput = entryDiv.querySelector(".quantityInput");
    const toggleBtn = entryDiv.querySelector(".toggle-details-btn");
    const detailsDiv = entryDiv.querySelector(".species-details-row");
    const removeBtn = entryDiv.querySelector(".remove-btn");

    speciesInput.addEventListener("change", () => {
      if (speciesInput.value.trim() !== "") {
        quantityInput.focus();
        quantityInput.select(); 
      }
    });

    speciesInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault(); 
        quantityInput.focus();
        quantityInput.select();
      }
    });

    toggleBtn.addEventListener("click", () => {
      const isHidden = detailsDiv.style.display === "none";
      detailsDiv.style.display = isHidden ? "block" : "none";
      toggleBtn.textContent = isHidden ? "➖" : "➕";
    });

    if (removeBtn) {
      removeBtn.addEventListener("click", () => {
        entryDiv.remove();
        validate();
      });
    }
  };

  popupRoot.querySelectorAll(".species-entry").forEach((row) => {
    setupSpeciesRowActions(row);
  });

  if (addSpeciesBtn) {
    addSpeciesBtn.addEventListener("click", () => {
      const entryDiv = document.createElement("div");
      entryDiv.className = "species-entry";
      entryDiv.setAttribute("data-id", ""); 
      entryDiv.style.cssText = "border-bottom: 1px solid #eee; padding-bottom: 5px; margin-bottom: 5px;";
      
      entryDiv.innerHTML = `
        <div class="species-main-row" style="display: flex; gap: 5px; width: 100%; align-items: center;">
          <span class="row-number" style="font-weight: bold; font-size: 14px; color: #7f3f98; min-width: 15px;"></span>
          <input class="speciesInput" list="hk-birds" style="flex: 4; width: 100%; box-sizing: border-box;" type="text" maxlength="100" placeholder="Species" required>
          <input class="quantityInput" style="flex: 1.5; width: 100%; box-sizing: border-box;" type="number" min="0" step="1" placeholder="Qty" required>
          <button type="button" class="toggle-details-btn" style="padding: 0 8px; background: #e8f3c8; color: #214434; border: 1px solid #d6c8a6; font-size: 12px; height: 32px; border-radius: 4px;">➕</button>
          <button type="button" class="remove-btn danger" style="padding: 0 10px;">X</button>
        </div>
        <div class="species-details-row" style="display: none; margin-top: 5px; background: rgba(0,0,0,0.02); padding: 6px; border-radius: 4px; border: 1px dashed #ccc;">
          <div style="display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 5px; margin-bottom: 5px;">
            <input class="nestNumInput" type="number" min="0" placeholder="Nests" style="text-align: center; padding: 2px;">
            <input class="nestMinInput" type="number" step="0.1" placeholder="Min(m)" style="text-align: center; padding: 2px;">
            <input class="nestMaxInput" type="number" step="0.1" placeholder="Max(m)" style="text-align: center; padding: 2px;">
            <input class="juvNumInput" type="number" min="0" placeholder="Juv" style="text-align: center; padding: 2px;">
          </div>
          <input class="remarksInput" style="width: 100%; box-sizing: border-box;" type="text" placeholder="Other Remarks">
        </div>
      `;

      entryDiv.querySelectorAll("input").forEach((input) => {
        input.addEventListener("input", validate);
        input.addEventListener("change", validate);
      });

      setupSpeciesRowActions(entryDiv);
      speciesList.appendChild(entryDiv);
      validate();
      
      const scrollBox = speciesList.parentElement;
      scrollBox.scrollTop = scrollBox.scrollHeight;
      setTimeout(() => { entryDiv.querySelector(".speciesInput").focus(); }, 50);
    });
  }

  popupRoot.querySelectorAll("input").forEach((input) => {
    input.addEventListener("input", validate);
    input.addEventListener("change", validate);
  });

  if (deleteChecklistBtn) {
    deleteChecklistBtn.addEventListener("click", () => {
      if (confirm("Are you sure you want to delete this location and ALL its records? This cannot be undone.")) {
        const oldIds = state.editingRecords.map(r => r.id).filter(id => id);
        state.records = state.records.filter((item) => !oldIds.includes(item.id));
        persistRecords();
        renderTable();
        renderMapMarkers(); 
        clearActiveMarker(); 
        state.editingRecords = null;
        statusText.textContent = "Location deleted.";
      }
    });
  }

  saveBtn.addEventListener("click", () => {
    if (saveBtn.disabled) {
      validate();
      return;
    }

    const latlng = state.activeMarker.getLatLng();
    const rows = popupRoot.querySelectorAll(".species-entry");

    if (state.editingRecords) {
      const oldIds = state.editingRecords.map(r => r.id).filter(id => id);
      state.records = state.records.filter((item) => !oldIds.includes(item.id));
    }

    const sharedPlotNo = plotInput.value.trim();
    const sharedPlotRemarks = plotRemarksInput ? plotRemarksInput.value.trim() : "";
    const sharedTemp = tempInput ? tempInput.value.trim() : "";
    const sharedWeather = weatherInput ? weatherInput.value.trim() : "";
    const sharedWindDir = windDirInput ? windDirInput.value.trim() : "";
    const sharedWindForce = windForceInput ? windForceInput.value.trim() : "";

    const distRows = popupRoot.querySelectorAll(".dist-row");
    const disturbancesArray = [];
    distRows.forEach(row => {
        const type = row.querySelector(".dist-type").value;
        if (!type) return; 

        const distObj = { type: type };
        if (type === "Raptor") {
            distObj.rSpecies = row.querySelector(".r-sp").value.trim();
            distObj.rNum = row.querySelector(".r-num").value.trim();
            distObj.rBeh = row.querySelector(".r-beh").value.trim();
        } else if (type === "Visitor") {
            distObj.vNum = row.querySelector(".v-num").value.trim();
            distObj.vAct = row.querySelector(".v-act").value.trim();
            distObj.vRem = row.querySelector(".v-rem").value.trim();
        } else if (type === "Boat") {
            distObj.bType = row.querySelector(".b-type").value.trim();
            distObj.bReg = row.querySelector(".b-reg").value.trim();
            distObj.bPass = row.querySelector(".b-pass").value.trim();
            distObj.bAct = row.querySelector(".b-act").value.trim();
            distObj.bRem = row.querySelector(".b-rem").value.trim();
        }
        disturbancesArray.push(distObj);
    });

    const mergedRecords = [];

    rows.forEach((row) => {
      const speciesName = row.querySelector(".speciesInput").value.trim();
      const quantity = Number(row.querySelector(".quantityInput").value.trim());
      const nestNum = row.querySelector(".nestNumInput").value.trim();
      const nestMin = row.querySelector(".nestMinInput").value.trim();
      const nestMax = row.querySelector(".nestMaxInput").value.trim();
      const juvNum = row.querySelector(".juvNumInput").value.trim();
      const remarks = row.querySelector(".remarksInput").value.trim();
      const existingId = row.getAttribute("data-id");

      const existingRecord = mergedRecords.find(r => r.species.toLowerCase() === speciesName.toLowerCase());

      if (existingRecord) {
        existingRecord.quantity += quantity;
        
        if (nestNum) existingRecord.nestNum = (Number(existingRecord.nestNum) || 0) + Number(nestNum);
        if (juvNum) existingRecord.juvNum = (Number(existingRecord.juvNum) || 0) + Number(juvNum);
        
        if (nestMin) existingRecord.nestMin = existingRecord.nestMin ? existingRecord.nestMin + " | " + nestMin : nestMin;
        if (nestMax) existingRecord.nestMax = existingRecord.nestMax ? existingRecord.nestMax + " | " + nestMax : nestMax;
        if (remarks) {
          if (!existingRecord.remarks) existingRecord.remarks = remarks;
          else if (!existingRecord.remarks.includes(remarks)) existingRecord.remarks += ` | ${remarks}`; 
        }
      } else {
        mergedRecords.push({ 
          id: existingId, 
          species: speciesName, 
          quantity: quantity, 
          nestNum: nestNum, 
          nestMin: nestMin, 
          nestMax: nestMax, 
          juvNum: juvNum, 
          remarks: remarks 
        });
      }
    });

    mergedRecords.forEach((record) => {
      state.records.unshift({
        id: record.id ? record.id : createId(), 
        date: dateInput.value,
        time: timeInput.value,
        lat: roundCoordinate(latlng.lat),
        lng: roundCoordinate(latlng.lng),
        plotNo: sharedPlotNo,      
        plotRemarks: sharedPlotRemarks, 
        temperature: sharedTemp,     
        weather: sharedWeather,      
        windDirection: sharedWindDir,
        windForce: sharedWindForce,
        disturbances: disturbancesArray, 
        species: record.species,
        quantity: record.quantity,
        nestNum: record.nestNum,     
        nestMin: record.nestMin,     
        nestMax: record.nestMax,     
        juvNum: record.juvNum,       
        remarks: record.remarks,  
        updatedAt: new Date().toISOString(),
      });
    });

    persistRecords();
    renderTable();
    renderMapMarkers(); 
    clearActiveMarker();
    state.editingRecords = null;
    statusText.textContent = "Saved.";
  });

  cancelBtn.addEventListener("click", () => {
    state.editingRecords = null;
    clearActiveMarker();
    statusText.textContent = "Edit cancelled.";
  });

  validate();
}

function renderTable() {
  recordCount.textContent = `${state.records.length} records`;
  exportBtn.disabled = state.records.length === 0;
  clearAllBtn.disabled = state.records.length === 0;

  if (state.records.length === 0) {
    recordsBody.innerHTML = `
      <tr class="empty-row">
        <td colspan="8">No records yet. Click on the map to add a record.</td>
      </tr>
    `;
    return;
  }

  let previousKey = null;

  recordsBody.innerHTML = state.records
    .map((record) => {
      const currentKey = `${record.date}-${record.plotNo}`;
      const isNewGroup = currentKey !== previousKey;
      previousKey = currentKey;

      const rowClass = isNewGroup ? "group-start" : "group-continue";
      const displayDate = isNewGroup ? escapeHtml(record.date) : '<span style="color: #ccc;">〃</span>';
      
      let displayPlot = '<span style="color: #ccc;">〃</span>';
      if (isNewGroup) {
        const safePlotNo = escapeHtml(record.plotNo || "No Plot");
        const safePlotRemarks = escapeHtml(record.plotRemarks || "");
        
        displayPlot = `<strong>${safePlotNo}</strong>`;
        
        if (safePlotRemarks) {
          displayPlot += `<div style="font-size: 11px; color: #666; font-weight: normal; margin-top: 2px; line-height: 1.2;">${safePlotRemarks}</div>`;
        }
        
        const t = escapeHtml(record.temperature || "-");
        const wd = escapeHtml(record.windDirection || "-");
        const wf = escapeHtml(record.windForce || "-");
        const wx = escapeHtml(record.weather || "-");
        
        displayPlot += `<div style="font-size: 10px; color: #305f4b; margin-top: 3px; font-weight: normal;">
          🌡️ ${t}°C | 💨 ${wd} ${wf} | ☁️ ${wx}
        </div>`;

        if (record.disturbances && record.disturbances.length > 0) {
          const types = [...new Set(record.disturbances.map(d => d.type))].join(", ");
          displayPlot += `<div style="font-size: 11px; color: #d94f3d; font-weight: bold; margin-top: 3px;">⚠️ Disturbance: ${escapeHtml(types)}</div>`;
        }
      }

      // NEW: Compile breeding details neatly for the Table View
      let speciesDetails = [];
      if (record.nestNum) speciesDetails.push(`Nests: ${record.nestNum}`);
      if (record.nestMin || record.nestMax) speciesDetails.push(`Ht: ${record.nestMin || '?'}m - ${record.nestMax || '?'}m`);
      if (record.juvNum) speciesDetails.push(`Juv: ${record.juvNum}`);
      if (record.remarks) speciesDetails.push(record.remarks);
      const displayRemarks = escapeHtml(speciesDetails.join(" | "));

      return `
        <tr class="${rowClass}">
          <td>${displayPlot}</td> 
          <td><strong>${escapeHtml(record.species)}</strong></td>
          
          <td>
            <div style="display: inline-flex; align-items: center; border: 1px solid #ccc; border-radius: 4px; overflow: hidden; background: #fff;">
              <button type="button" data-action="decrease-count" data-id="${record.id}" style="background: #f0f0f0; border: none; padding: 2px 6px; cursor: pointer; color: #333; margin: 0;">-</button>
              <span style="padding: 0 6px; min-width: 15px; text-align: center;">${escapeHtml(String(record.quantity))}</span>
              <button type="button" data-action="increase-count" data-id="${record.id}" style="background: #f0f0f0; border: none; padding: 2px 6px; cursor: pointer; color: #333; margin: 0;">+</button>
            </div>
          </td>
          
          <td>${displayDate}</td>
          <td>${escapeHtml(record.time)}</td>
          <td style="font-size: 11px;">${escapeHtml(`${record.lat}, ${record.lng}`)}</td>
          <td><span style="font-size: 11px;">${displayRemarks}</span></td>
          <td>
            <div class="row-actions" style="display: flex; flex-wrap: wrap; gap: 5px;">
              <button type="button" data-action="edit" data-id="${record.id}">Edit</button>
              <button type="button" class="danger" data-action="delete" data-id="${record.id}">Delete</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

function editRecord(record) {
  if (state.activeMarker) {
    alert("Please save or cancel your current record first.");
    return;
  }
  
  const latlng = L.latLng(record.lat, record.lng);
  state.map.setView(latlng, Math.max(state.map.getZoom(), 14));
  
  const recordsAtLocation = state.records.filter(r => r.lat === record.lat && r.lng === record.lng);
  openEditorAt(latlng, recordsAtLocation);
}

function deleteRecord(id) {
  const confirmed = window.confirm("Are you sure you want to delete this record?");
  if (!confirmed) {
    return;
  }

  state.records = state.records.filter((record) => record.id !== id);
  persistRecords();
  renderTable();
  renderMapMarkers(); 
  
  statusText.textContent = "1 record deleted.";
}

function clearAllRecords() {
  if (state.records.length === 0) {
    return;
  }

  const confirmed = window.confirm("Clear all records? This cannot be undone.");
  if (!confirmed) {
    return;
  }

  state.records = [];
  state.editingRecords = null;
  clearPersistedRecords();
  renderTable();
  renderMapMarkers(); 
  clearActiveMarker();
  statusText.textContent = "All records cleared.";
}

function exportXlsx() {
  if (state.records.length === 0) return;

  const getDistData = (arr, type, field) => {
    if (!arr || !Array.isArray(arr)) return "";
    const filtered = arr.filter(d => d.type === type);
    if (filtered.length === 0) return "";
    return filtered.map(d => d[field] || "-").join(" | ");
  };

  const rows = state.records.map((record) => {
    const dists = record.disturbances || [];
    return {
      Date: record.date,
      "Area": record.plotNo || "", 
      "Arrival Time": record.time,
      "Temperature": record.temperature || "", 
      "Wind Direction": record.windDirection || "", 
      "Wind Force": record.windForce || "",
      "Weather": record.weather || "",              
      "Species": record.species,
      "No. of individuals": record.quantity,
      "No. of Nests": record.nestNum || "",
      "Min Nest Height (m)": record.nestMin || "",
      "Max Nest Height (m)": record.nestMax || "",
      "No. of Juveniles": record.juvNum || "",
      "Other Remarks": record.remarks || "",
      "Disturbance Types": dists.length > 0 ? [...new Set(dists.map(d => d.type))].join(" | ") : "None",
      "Raptor Species": getDistData(dists, "Raptor", "rSpecies"),
      "Raptor No.": getDistData(dists, "Raptor", "rNum"),
      "Raptor Behavior": getDistData(dists, "Raptor", "rBeh"),
      "Visitor Activity": getDistData(dists, "Visitor", "vAct"),
      "Visitor No.": getDistData(dists, "Visitor", "vNum"),
      "Visitor Edu/Remarks": getDistData(dists, "Visitor", "vRem"),
      "Boat Type": getDistData(dists, "Boat", "bType"),
      "Boat Reg No.": getDistData(dists, "Boat", "bReg"),
      "Boat Passengers": getDistData(dists, "Boat", "bPass"),
      "Boat Activity": getDistData(dists, "Boat", "bAct"),
      "Boat Remarks": getDistData(dists, "Boat", "bRem"),
      Latitude: record.lat,
      Longitude: record.lng,
      Coordinates: `${record.lat}, ${record.lng}`,
      "Plot Notes": record.plotRemarks || "", 

    };
  });

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "SeabirdRecords"); 

  const today = getLocalDateString(new Date());
  XLSX.writeFile(workbook, `seabird-records-${today}.xlsx`);
  statusText.textContent = "Excel file downloaded.";
}


function clearActiveMarker() {
  if (!state.activeMarker) {
    return;
  }
  state.map.removeLayer(state.activeMarker);
  state.activeMarker = null;
}

function roundCoordinate(value) { return Number(value.toFixed(6)); }

function createId() { return `rec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; }

function getLocalDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value) { return escapeHtml(value ?? ""); }

function getPolygonStyle(styleUrl, name) {
  return { color: "#00FFFF", weight: 2, fill: true, fillColor: "#00FFFF", fillOpacity: 0.3 };
}

function getStudySitePolygonStyle(styleUrl, name) {
  return { color: "#00FFFF", weight: 2, fill: true, fillColor: "#00FFFF", fillOpacity: 0.3 };
}
