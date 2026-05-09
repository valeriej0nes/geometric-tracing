const COLORS = ["#2dd4bf", "#f97316", "#a78bfa", "#f43f5e", "#84cc16", "#38bdf8", "#facc15", "#fb7185"];
const STORAGE_KEY = "geometricTracing.desmosExport";

const elements = {
  calculator: document.querySelector("#calculator"),
  message: document.querySelector("#desmosMessage"),
  closeButton: document.querySelector("#closeExportButton")
};

init();

function init() {
  elements.closeButton.addEventListener("click", closeExportTab);

  const data = readExportData();

  if (!data) {
    showMessage("No traced geometry was found. Return to the app, process an image, then open Desmos again.");
    return;
  }

  if (!window.Desmos?.GraphingCalculator) {
    showMessage("Desmos could not be loaded. Check your internet connection and API key.");
    return;
  }

  const calculator = Desmos.GraphingCalculator(elements.calculator, {
    expressions: true,
    settingsMenu: true,
    zoomButtons: true,
    keypad: true,
    graphpaper: true
  });

  calculator.setExpression({
    id: "geometric_tracing_note",
    type: "text",
    text: `Geometric Tracing export: ${methodLabel(data.method)}`
  });

  if (data.method === "spline") {
    renderSplines(calculator, data.splines || []);
  } else {
    renderSegments(calculator, data.segments || []);
  }

  const bounds = computeBounds(data);
  if (bounds) calculator.setMathBounds(bounds);
  showMessage(`Loaded ${itemCount(data)} traced ${data.method === "spline" ? "spline curve" : "line segment"}${itemCount(data) === 1 ? "" : "s"} into Desmos.`);
}

function readExportData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.error(error);
    return null;
  }
}

function renderSegments(calculator, segments) {
  segments.forEach((segment, index) => {
    const latex = segmentLatex(segment.point1, segment.point2);
    if (!latex) return;

    calculator.setExpression({
      id: `segment_${segment.id}`,
      latex,
      color: COLORS[index % COLORS.length],
      lineWidth: "2"
    });
  });
}

function renderSplines(calculator, splines) {
  splines.forEach((spline, index) => {
    const points = (spline.points || []).filter(isFinitePoint);
    if (points.length < 2) return;

    calculator.setExpression({
      id: `spline_${spline.id}`,
      type: "table",
      columns: [
        {
          latex: `x_{${spline.id}}`,
          values: points.map((point) => desmosNumber(point.x))
        },
        {
          latex: `y_{${spline.id}}`,
          values: points.map((point) => desmosNumber(point.y)),
          color: COLORS[index % COLORS.length],
          lines: true,
          points: false
        }
      ]
    });

    const controlPoints = (spline.controlPoints || []).filter(isFinitePoint);
    if (controlPoints.length) {
      calculator.setExpression({
        id: `control_points_${spline.id}`,
        type: "table",
        columns: [
          {
            latex: `c_{${spline.id}}`,
            values: controlPoints.map((point) => desmosNumber(point.x))
          },
          {
            latex: `d_{${spline.id}}`,
            values: controlPoints.map((point) => desmosNumber(point.y)),
            color: "#94a3b8",
            lines: false,
            points: true
          }
        ]
      });
    }
  });
}

function segmentLatex(point1, point2) {
  if (!isFinitePoint(point1) || !isFinitePoint(point2)) return "";

  const dx = point2.x - point1.x;
  const dy = point2.y - point1.y;

  if (Math.abs(dx) < 1e-9) {
    const yMin = Math.min(point1.y, point2.y);
    const yMax = Math.max(point1.y, point2.y);
    return `x=${desmosNumber(point1.x)}\\left\\{${desmosNumber(yMin)}\\le y\\le ${desmosNumber(yMax)}\\right\\}`;
  }

  const m = dy / dx;
  const b = point1.y - m * point1.x;
  const xMin = Math.min(point1.x, point2.x);
  const xMax = Math.max(point1.x, point2.x);
  return `y=${desmosNumber(m)}x${signedDesmosNumber(b)}\\left\\{${desmosNumber(xMin)}\\le x\\le ${desmosNumber(xMax)}\\right\\}`;
}

function computeBounds(data) {
  const points = [];

  if (data.method === "spline") {
    (data.splines || []).forEach((spline) => {
      points.push(...(spline.points || []), ...(spline.controlPoints || []));
    });
  } else {
    (data.segments || []).forEach((segment) => {
      points.push(segment.point1, segment.point2);
    });
  }

  const valid = points.filter(isFinitePoint);
  if (!valid.length) return null;

  const xValues = valid.map((point) => point.x);
  const yValues = valid.map((point) => point.y);
  const xMin = Math.min(...xValues);
  const xMax = Math.max(...xValues);
  const yMin = Math.min(...yValues);
  const yMax = Math.max(...yValues);
  const width = Math.max(1, xMax - xMin);
  const height = Math.max(1, yMax - yMin);
  const padding = Math.max(width, height) * 0.08;

  return {
    left: xMin - padding,
    right: xMax + padding,
    bottom: yMin - padding,
    top: yMax + padding
  };
}

function itemCount(data) {
  return data.method === "spline" ? (data.splines || []).length : (data.segments || []).length;
}

function methodLabel(method) {
  return method === "spline" ? "Parametric B-Spline Approximation" : "Piecewise Linear Approximation";
}

function isFinitePoint(point) {
  return Number.isFinite(point?.x) && Number.isFinite(point?.y);
}

function signedDesmosNumber(value) {
  return value < 0 ? desmosNumber(value) : `+${desmosNumber(value)}`;
}

function desmosNumber(value) {
  return Number(value.toFixed(6)).toString();
}

function showMessage(message) {
  elements.message.textContent = message;
}

function closeExportTab() {
  window.close();

  window.setTimeout(() => {
    window.location.href = "index.html";
  }, 120);
}
