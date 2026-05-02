const STORAGE_KEY = "birdmapper-records-v1";

const state = {
  map: null,
  activeMarker: null,
  locationMarker: null,
  orthophotoLayer: null,
  studySitesLayer: null,
  recordsLayer: null, 
  records: [],
  editingRecords: null,
  watchId: null,
  isTracking: false
};

const statusText = document.getElementById("statusText");
const recordCount = document.getElementById("recordCount");
const recordsBody = document.getElementById("recordsBody");
const locateBtn = document.getElementById("locateBtn");
const backupBtn = document.getElementById("backupBtn"); // NEW: Identifies the button
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

// REPLACED: Medium "Goldilocks" size GPS directional marker (36px)
const locationMarkerIcon = L.divIcon({
  className: "location-marker",
  // Notice we kept the fast 0.1s transition for the smooth compass spinning!
  html: `
    <div id="dir-arrow" style="transform: rotate(0deg); transition: transform 0.1s linear; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center;">
      <svg viewBox="0 0 36 36" aria-hidden="true" style="position: absolute; width: 100%; height: 100%; filter: drop-shadow(0px 3px 5px rgba(0,0,0,0.4));">
        <circle cx="18" cy="18" r="15" fill="rgba(66, 133, 244, 0.25)" stroke="#4285F4" stroke-width="1.5" stroke-opacity="0.6"/>
        <circle cx="18" cy="18" r="7.5" fill="#4285F4" stroke="#ffffff" stroke-width="2.5"/>
        <path d="M 18 2 L 26 13 L 10 13 Z" fill="#4285F4" opacity="0.95" />
      </svg>
    </div>
  `,
  // The medium size
  iconSize: [36, 36], 
  // Anchor must be exactly half the size (18) to stay perfectly centered on your coordinates
  iconAnchor: [18, 18], 
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
  }).setView([22.493230, 114.040616], 13);

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
  helpBtn.addEventListener("click", () => manualModal.classList.remove("hidden"));
  closeManualBtn.addEventListener("click", () => manualModal.classList.add("hidden"));
  locateBtn.addEventListener("click", locateUser);
  exportBtn.addEventListener("click", exportXlsx);
  clearAllBtn.addEventListener("click", clearAllRecords);

  // NEW: The Emergency Backup Logic
  backupBtn.addEventListener("click", () => {
    if (state.records.length === 0) {
      alert("No records to backup yet!");
      return;
    }
    // Turns all your records into a raw text string
    const dataString = JSON.stringify(state.records);
    
    // Tries to copy to clipboard automatically
    navigator.clipboard.writeText(dataString).then(() => {
      alert("✅ Data Copied!\n\nYou can now paste this data into notes app or WhatsApp message as backup.\n\nBy saving the data to .json format, you can retrieve the data by Power Query function of Excel.");
    }).catch(err => {
      // Fallback for older browsers if the clipboard is blocked
      prompt("Clipboard blocked. Copy the text below manually:", dataString);
    });
  });

  recordsBody.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;

    if (state.activeMarker) {
      alert("Please Save or Cancel your open map popup before editing the table!");
      return; 
    }

    const { action, id } = button.dataset;
    const record = state.records.find((item) => item.id === id);
    if (!record) return;

    if (action === "edit") return editRecord(record);
    if (action === "delete") return deleteRecord(record.id);
    if (action === "increase-count") return updateRecordCount(record.id, 1);
    if (action === "decrease-count") return updateRecordCount(record.id, -1);
  });
}

function updateRecordCount(id, delta) {
  const index = state.records.findIndex(r => r.id === id);
  if (index === -1) return;

  const newQuantity = Number(state.records[index].quantity) + delta;
  
  if (newQuantity <= 0) {
    const confirmed = window.confirm("Count is 0. Do you want to delete this species record?");
    if (confirmed) deleteRecord(id);
  } else {
    state.records[index].quantity = newQuantity;
    persistRecords();
    renderTable();
    renderMapMarkers(); 
  }
}

// Add this variable just above the tracking functions to hold our "shock absorber"
let compassFrame = null;
// Add these two variables just above handleOrientation
let smoothedHeading = 0; // NEW: Keeps track of the continuous smoothed angle

// ==========================================
// THROTTLED HYBRID TRACKING SYSTEM 
// ==========================================

function rotateMarker(heading) {
  if (!state.locationMarker) return;
  const arrowEl = state.locationMarker.getElement()?.querySelector("#dir-arrow");
  if (arrowEl) {
    arrowEl.style.transform = `rotate(${heading}deg)`;
  }
}

function updateLocationMarker(latlng, gpsHeading) {
  if (!state.locationMarker) {
    state.locationMarker = L.marker(latlng, { 
      icon: locationMarkerIcon, 
      zIndexOffset: 1000 
    }).addTo(state.map);
  } else {
    state.locationMarker.setLatLng(latlng);
  }

  // Fallback: ONLY use the GPS heading if the internal compass is dead/denied
  if (!state.useCompass && gpsHeading !== null && !isNaN(gpsHeading)) {
    state.currentHeading = gpsHeading;
    rotateMarker(state.currentHeading);
  }
}

function locateUser() {
  if (!navigator.geolocation) {
    statusText.textContent = "GPS not supported.";
    return;
  }

  // 1. Turn OFF tracking
  if (state.isTracking) {
    navigator.geolocation.clearWatch(state.watchId);
    state.watchId = null;
    state.isTracking = false;
    state.useCompass = false; // Reset compass status
    
    // Shut down the compass sensors
    window.removeEventListener('deviceorientationabsolute', handleOrientation);
    window.removeEventListener('deviceorientation', handleOrientation);
    
    locateBtn.textContent = "Locate";
    locateBtn.style.background = "#0f81cd"; 
    statusText.textContent = "Tracking stopped.";
    
    if (state.locationMarker) {
      state.map.removeLayer(state.locationMarker);
      state.locationMarker = null; 
    }
    return;
  }

  // 2. Turn ON tracking
  locateBtn.disabled = true; 
  statusText.textContent = "Connecting GPS...";

  // 3. Ask for Compass Permission safely
  if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
    DeviceOrientationEvent.requestPermission()
      .then(permissionState => {
        if (permissionState === 'granted') {
          window.addEventListener('deviceorientation', handleOrientation, true);
        }
      })
      .catch(() => {
         // Silently catch errors so the app doesn't freeze if iOS blocks it
         console.log("Compass blocked by browser security."); 
      }); 
  } else {
    window.addEventListener('deviceorientationabsolute', handleOrientation, true);
    window.addEventListener('deviceorientation', handleOrientation, true);
  }
  
  // 4. Start the GPS Tracker
  state.watchId = navigator.geolocation.watchPosition(
    (position) => {
      state.isTracking = true;
      locateBtn.disabled = false;
      locateBtn.textContent = "Stop Track";
      locateBtn.style.background = "#d94f3d"; 
      
      const latlng = L.latLng(position.coords.latitude, position.coords.longitude);
      const heading = position.coords.heading; 
      const isFirstFix = state.locationMarker === null;
      
      updateLocationMarker(latlng, heading);
      
      if (isFirstFix && !state.activeMarker) {
        state.map.setView(latlng, Math.max(state.map.getZoom(), 15), { animate: true });
      }
      
      statusText.textContent = state.useCompass ? "GPS & Compass Active" : "GPS Active";
    },
    (error) => {
      locateBtn.disabled = false;
      statusText.textContent = "GPS Signal Lost.";
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
}

// 5. The "Shock Absorber" Compass Logic
function handleOrientation(event) {
  let rawHeading = null;
  
  if (event.webkitCompassHeading) {
    rawHeading = event.webkitCompassHeading; // iOS
  } else if (event.absolute && event.alpha !== null) {
    rawHeading = 360 - event.alpha; // Android
  }

  if (rawHeading !== null) {
    state.useCompass = true; // Tells the app to ignore GPS headings
    
    if (!compassFrame) {
      compassFrame = requestAnimationFrame(() => {
        
        // --- THE MATH FIX ---
        // 1. Find the shortest distance between our current arrow and the new raw heading
        let diff = rawHeading - (smoothedHeading % 360);
        
        // 2. Force it to take the shortest path (prevents the 359 -> 1 "Death Spin")
        if (diff > 180) diff -= 360;
        if (diff < -180) diff += 360;

        // 3. The Low-Pass Filter: Multiply the difference by 0.1 
        // This means we only move 10% of the way toward the new erratic number, 
        // absorbing all the violent shaking!
        smoothedHeading += diff * 0.1; 
        
        state.currentHeading = smoothedHeading;
        rotateMarker(smoothedHeading);
        
        compassFrame = null; 
      });
    }
  }
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
    plotNo: defaultPlotNo,   // <--- Fills in the polygon name automatically!
    plotRemarks: "",
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

  // The fixed layout HTML string (using min-width: 0 and precise flex ratios)
  const rowTemplate = (index, record = {}) => `
    <div class="species-row" data-id="${escapeAttribute(record.id || "")}" style="display: flex; gap: 4px; margin-bottom: 5px; width: 100%; align-items: center;">
      <span class="row-number" style="font-weight: bold; font-size: 14px; min-width: 15px; color: #7f3f98;">${index}.</span>
      <input class="speciesInput" list="hk-birds" style="flex: 5; min-width: 0; box-sizing: border-box;" type="text" value="${escapeAttribute(record.species)}" maxlength="100" placeholder="Species" required>
      <input class="quantityInput" style="width: 45px; flex-shrink: 0; box-sizing: border-box;" type="number" value="${escapeAttribute(String(record.quantity))}" min="1" step="1" placeholder="Count" required>
      <input class="remarksInput" style="flex: 2; min-width: 0; box-sizing: border-box;" type="text" value="${escapeAttribute(record.remarks)}" placeholder="Remarks">
      <button type="button" class="remove-btn danger" style="width: 32px; flex-shrink: 0; padding: 0;">X</button>
    </div>
  `;

  if (isEditing) {
    recordsToEdit.forEach((record, index) => {
      rowsHtml += rowTemplate(index + 1, record);
    });
  } else {
    rowsHtml = rowTemplate(1, { species: "", quantity: "", remarks: "" });
  }

  return `
    <div class="popup-form" style="width: 100%;">
      <strong>${title}</strong>
      
      <div style="max-height: 250px; overflow-y: auto; overflow-x: hidden; padding-right: 5px; margin-top: 10px; margin-bottom: 5px;">
        <div class="popup-grid" style="margin-bottom: 5px; width: 100%;">
          <input id="dateInput" type="date" style="width: 100%; box-sizing: border-box;" value="${escapeAttribute(baseRecord.date)}" required>
          <input id="timeInput" type="time" style="width: 100%; box-sizing: border-box;" value="${escapeAttribute(baseRecord.time)}" required>
        </div>
        
        <div style="margin-bottom: 10px; width: 100%; display: flex; gap: 5px;">
          <input id="plotInput" type="text" style="flex: 1; box-sizing: border-box;" value="${escapeAttribute(baseRecord.plotNo)}" placeholder="Plot ID">
          <input id="plotRemarksInput" type="text" style="flex: 3; box-sizing: border-box;" value="${escapeAttribute(baseRecord.plotRemarks)}" placeholder="Plot Notes">
        </div>
        
        <div id="speciesList" style="width: 100%;">
          ${rowsHtml}
        </div>
        
        <button type="button" id="addSpeciesBtn" style="margin-bottom: 10px; height: 40px; width: 100%; border: 1px dashed #7f3f98; background: transparent; color: #7f3f98; box-sizing: border-box;">+ Add Species</button>
      </div>

      <div class="error-text" id="formError" style="color: #d94f3d; font-size: 12px; margin-bottom: 5px;"></div>
      
      <div class="error-text" id="formError" style="color: #d94f3d; font-size: 12px; margin-bottom: 5px;"></div>
      
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
  const speciesList = popupRoot.querySelector("#speciesList");
  const addSpeciesBtn = popupRoot.querySelector("#addSpeciesBtn");
  const saveBtn = popupRoot.querySelector("#saveBtn");
  const cancelBtn = popupRoot.querySelector("#cancelBtn");
  const formError = popupRoot.querySelector("#formError");
  const deleteChecklistBtn = popupRoot.querySelector("#deleteChecklistBtn");

    const validate = () => {
    const rows = popupRoot.querySelectorAll(".species-row");
    let validRowCount = 0;
    let hasInvalidRow = false;

    rows.forEach((row, index) => {
      const numSpan = row.querySelector(".row-number");
      if (numSpan) numSpan.textContent = `${index + 1}.`;

      const species = row.querySelector(".speciesInput").value.trim();
      const quantity = row.querySelector(".quantityInput").value.trim();
      const remarks = row.querySelector(".remarksInput").value.trim();

      const quantityValid = /^\d+$/.test(quantity) && Number(quantity) > 0;

      // NEW: Check if the row is completely blank (e.g., from pressing Enter)
      const isCompletelyEmpty = species === "" && quantity === "" && remarks === "";

      if (isCompletelyEmpty) {
        // Skip validation for this row entirely! 
        return; 
      }

      // If it has ANY text, it must be completely filled out correctly
      if (species.length > 0 && quantityValid) {
        validRowCount++;
      } else {
        hasInvalidRow = true;
      }
    });

    // Form is valid IF: Date/Time exist, at least 1 valid bird exists, and NO partially broken rows exist
    let allValid = !!(dateInput.value && timeInput.value && validRowCount > 0 && !hasInvalidRow);

    saveBtn.disabled = !allValid;
    saveBtn.style.backgroundColor = allValid ? "#305f4b" : "#9bb1a8";

    // Smarter error messages
    if (validRowCount === 0 && !hasInvalidRow) {
      formError.textContent = "Please add at least one species.";
    } else if (hasInvalidRow) {
      formError.textContent = "Please complete all started rows (Species + Qty > 0).";
    } else {
      formError.textContent = "";
    }

    const removeBtns = popupRoot.querySelectorAll(".remove-btn");
    removeBtns.forEach(btn => btn.style.display = rows.length > 1 ? "block" : "none");
  };

  // --- THE MAGIC JUMP & ENTER LOGIC ---
  const setupRowEvents = (row) => {
    const speciesInput = row.querySelector(".speciesInput");
    const quantityInput = row.querySelector(".quantityInput");
    const remarksInput = row.querySelector(".remarksInput");
    const removeBtn = row.querySelector(".remove-btn");

    // 1. Jump from Species to Count
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

    // 2. Jump from Count to Remarks
    quantityInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        remarksInput.focus();
      }
    });

    // 3. ENTER ON REMARKS = Add New Species automatically!
    remarksInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        addSpeciesBtn.click();
      }
    });

    // Ensure inputs trigger validation when typed in
    row.querySelectorAll("input").forEach(i => {
      i.addEventListener("input", validate);
      i.addEventListener("change", validate);
    });

    // Setup Delete Button
    if (removeBtn) {
      removeBtn.addEventListener("click", () => {
        row.remove();
        validate();
      });
    }
  };

  // Attach events to the existing rows when the popup opens
  popupRoot.querySelectorAll(".species-row").forEach(setupRowEvents);

  if (addSpeciesBtn) {
    addSpeciesBtn.addEventListener("click", () => {
      const newRow = document.createElement("div");
      newRow.className = "species-row";
      newRow.setAttribute("data-id", ""); 
      newRow.style.cssText = "display: flex; gap: 4px; margin-bottom: 5px; width: 100%; align-items: center;";
      
      newRow.innerHTML = `
        <span class="row-number" style="font-weight: bold; font-size: 14px; min-width: 15px; color: #7f3f98;"></span>
        <input class="speciesInput" list="hk-birds" style="flex: 5; min-width: 0; box-sizing: border-box;" type="text" maxlength="100" placeholder="Species" required>
        <input class="quantityInput" style="width: 45px; flex-shrink: 0; box-sizing: border-box;" type="number" min="1" step="1" placeholder="Count" required>
        <input class="remarksInput" style="flex: 2; min-width: 0; box-sizing: border-box;" type="text" placeholder="Remarks">
        <button type="button" class="remove-btn danger" style="width: 32px; flex-shrink: 0; padding: 0;">X</button>
      `;

      speciesList.appendChild(newRow);
      setupRowEvents(newRow); // Apply the jump logic to the newly created row!
      validate();
      
      // Scroll to bottom and instantly focus the new species box
      const scrollBox = speciesList.parentElement;
      scrollBox.scrollTop = scrollBox.scrollHeight;
      setTimeout(() => { newRow.querySelector(".speciesInput").focus(); }, 50);
    });
  }

  if (deleteChecklistBtn) {
    deleteChecklistBtn.addEventListener("click", () => {
      if (confirm("Are you sure you want to delete this location and ALL its bird records? This cannot be undone.")) {
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
    const rows = popupRoot.querySelectorAll(".species-row");

    if (state.editingRecords) {
      const oldIds = state.editingRecords.map(r => r.id).filter(id => id);
      state.records = state.records.filter((item) => !oldIds.includes(item.id));
    }

    const sharedPlotNo = plotInput.value.trim();
    const sharedPlotRemarks = plotRemarksInput ? plotRemarksInput.value.trim() : "";
    const mergedRecords = [];

    rows.forEach((row) => {
      const speciesName = row.querySelector(".speciesInput").value.trim();
      const quantity = Number(row.querySelector(".quantityInput").value.trim());
      const remarks = row.querySelector(".remarksInput").value.trim();
      const existingId = row.getAttribute("data-id");

      // Skip entirely empty rows in case they pressed Enter by accident at the end
      if (!speciesName) return;

      const existingRecord = mergedRecords.find(r => r.species.toLowerCase() === speciesName.toLowerCase());

      if (existingRecord) {
        existingRecord.quantity += quantity;
        if (remarks) {
          if (!existingRecord.remarks) existingRecord.remarks = remarks;
          else if (!existingRecord.remarks.includes(remarks)) existingRecord.remarks += ` | ${remarks}`; 
        }
      } else {
        mergedRecords.push({ id: existingId, species: speciesName, quantity: quantity, remarks: remarks });
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
        species: record.species,
        quantity: record.quantity,
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
  backupBtn.disabled = state.records.length === 0;

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
        const safePlotNo = escapeHtml(record.plotNo || "");
        const safePlotRemarks = escapeHtml(record.plotRemarks || "");
        
        displayPlot = `<strong>${safePlotNo}</strong>`;
        
        if (safePlotRemarks) {
          displayPlot += `<div style="font-size: 11px; color: #666; font-weight: normal; margin-top: 2px; line-height: 1.2;">${safePlotRemarks}</div>`;
        }
      }

      // REARRANGED COLUMNS: Plot, Species, Count, Date, Time, Coords, Remarks, Actions
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
          <td>${escapeHtml(record.remarks || "")}</td>
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

// NEW: Exported the Plot Remarks as a column!
function exportXlsx() {
  if (state.records.length === 0) return;

  const rows = state.records.map((record) => ({
    Date: record.date,
    Time: record.time,
    "Plot ID": record.plotNo || "", 
    Latitude: record.lat,
    Longitude: record.lng,
    Coordinates: `${record.lat}, ${record.lng}`,
    Species: record.species,
    Quantity: record.quantity,
    "Plot Notes": record.plotRemarks || "", 
    "Species Remarks": record.remarks || "",
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "BirdRecords");

  const today = getLocalDateString(new Date());
  XLSX.writeFile(workbook, `bird-records-${today}.xlsx`);
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
