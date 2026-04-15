const form = document.getElementById("route-form");
const startInput = document.getElementById("start");
const destinationInput = document.getElementById("destination");
const statusBox = document.getElementById("status");
const submitButton = document.getElementById("submit-btn");
const requestTableBody = document.getElementById("request-table-body");
const summaryTableBody = document.getElementById("summary-table-body");
const maneuversTableBody = document.getElementById("maneuvers-table-body");
const historyTableBody = document.getElementById("history-table-body");
const routeMap = document.getElementById("route-map");
const mapPlaceholder = document.getElementById("map-placeholder");
const runCounter = document.getElementById("run-counter");

const runHistory = [];

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function secondsToClock(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

function safeValue(value) {
  if (value === null || value === undefined || value === "") {
    return "N/A";
  }

  return escapeHtml(value);
}

function renderKeyValueTable(bodyElement, rows, emptyMessage, columnSpan) {
  if (!rows.length) {
    bodyElement.innerHTML = `<tr><td colspan="${columnSpan}">${emptyMessage}</td></tr>`;
    return;
  }

  bodyElement.innerHTML = rows
    .map(
      (row) => `
        <tr>
          <td>${escapeHtml(row[0])}</td>
          <td>${row[1]}</td>
        </tr>
      `
    )
    .join("");
}

function renderRequestTable(start, destination) {
  const rows = [
    ["HTTP Method", "<code>GET</code>"],
    ["Endpoint", "<code>/directions/v2/route</code>"],
    ["Starting location", safeValue(start)],
    ["Destination", safeValue(destination)],
    ["Route type", "fastest"],
    ["Response format", "json"],
  ];

  renderKeyValueTable(requestTableBody, rows, "No request submitted yet.", 2);
}

function renderSummaryTable(route, info) {
  const hasMessages = info?.messages?.length ? info.messages.join("; ") : "None";
  const sessionId = route.sessionId || "N/A";

  const rows = [
    ["Status code", String(info.statuscode ?? "N/A")],
    ["Messages", escapeHtml(hasMessages)],
    ["Session ID", sessionId],
    ["Formatted time", safeValue(route.formattedTime)],
    ["Real time (HH:MM:SS)", secondsToClock(route.realTime ?? 0)],
    ["Distance (miles)", `${Number(route.distance ?? 0).toFixed(2)} mi`],
    ["Fuel used (gallons)", escapeHtml(String(route.fuelUsed ?? "N/A"))],
    ["Has toll road", route.hasTollRoad ? "Yes" : "No"],
    ["Has ferry", route.hasFerry ? "Yes" : "No"],
    ["Has highway", route.hasHighway ? "Yes" : "No"],
  ];

  renderKeyValueTable(summaryTableBody, rows, "No response data yet.", 2);
}

function renderManeuversTable(maneuvers) {
  if (!maneuvers.length) {
    maneuversTableBody.innerHTML = '<tr><td colspan="4">No route maneuvers returned.</td></tr>';
    return;
  }

  maneuversTableBody.innerHTML = maneuvers
    .map((maneuver, index) => {
      const distance = `${Number(maneuver.distance ?? 0).toFixed(2)} mi`;
      const time = secondsToClock(maneuver.time ?? 0);

      return `
        <tr>
          <td>${index + 1}</td>
          <td>${safeValue(maneuver.narrative)}</td>
          <td>${distance}</td>
          <td>${time}</td>
        </tr>
      `;
    })
    .join("");
}

function renderHistoryTable() {
  runCounter.textContent = `Runs recorded: ${runHistory.length}`;

  if (!runHistory.length) {
    historyTableBody.innerHTML =
      '<tr><td colspan="5">Complete three runs and take a screenshot after each one.</td></tr>';
    return;
  }

  historyTableBody.innerHTML = runHistory
    .map(
      (run) => `
        <tr>
          <td>${escapeHtml(run.run)}</td>
          <td>${escapeHtml(run.start)}</td>
          <td>${escapeHtml(run.destination)}</td>
          <td>${escapeHtml(run.distance)}</td>
          <td>${escapeHtml(run.time)}</td>
        </tr>
      `
    )
    .join("");
}

function updateMap(start, destination) {
  const key = window.MAPQUEST_API_KEY;
  const params = new URLSearchParams({
    key,
    start,
    end: destination,
    size: "1280,520@2x",
    type: "map",
    margin: "40",
  });

  routeMap.src = `https://www.mapquestapi.com/staticmap/v5/map?${params.toString()}`;
  routeMap.hidden = false;
  mapPlaceholder.hidden = true;
}

async function requestRoute(start, destination) {
  const params = new URLSearchParams({
    key: window.MAPQUEST_API_KEY,
    from: start,
    to: destination,
    outFormat: "json",
    ambiguities: "ignore",
    routeType: "fastest",
    doReverseGeocode: "false",
    enhancedNarrative: "false",
    avoidTimedConditions: "false",
  });

  const response = await fetch(`https://www.mapquestapi.com/directions/v2/route?${params.toString()}`);

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}.`);
  }

  return response.json();
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const start = startInput.value.trim();
  const destination = destinationInput.value.trim();

  renderRequestTable(start, destination);

  if (!window.MAPQUEST_API_KEY || window.MAPQUEST_API_KEY === "PASTE_YOUR_MAPQUEST_KEY_HERE") {
    statusBox.textContent = "Add your MapQuest API key in config.js before requesting directions.";
    return;
  }

  submitButton.disabled = true;
  statusBox.textContent = "Requesting route from MapQuest...";

  try {
    const data = await requestRoute(start, destination);
    const { info, route } = data;

    if (info?.statuscode !== 0) {
      renderSummaryTable({}, info || {});
      renderManeuversTable([]);
      statusBox.textContent = `MapQuest returned an error: ${(info?.messages || ["Unknown error"]).join("; ")}`;
      return;
    }

    const maneuvers = route?.legs?.flatMap((leg) => leg.maneuvers || []) || [];
    renderSummaryTable(route, info);
    renderManeuversTable(maneuvers);
    updateMap(start, destination);

    runHistory.push({
      run: runHistory.length + 1,
      start,
      destination,
      distance: `${Number(route.distance ?? 0).toFixed(2)} mi`,
      time: safeValue(route.formattedTime),
    });
    renderHistoryTable();

    statusBox.textContent = "Route loaded successfully. Capture a screenshot if this is one of your required runs.";
  } catch (error) {
    renderSummaryTable({}, { statuscode: "Error", messages: [error.message] });
    renderManeuversTable([]);
    statusBox.textContent = `Unable to load directions. ${error.message}`;
  } finally {
    submitButton.disabled = false;
  }
});

renderHistoryTable();
