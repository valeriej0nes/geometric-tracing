import { drawBinaryImage, processImageToSkeleton } from "./imageProcessor.js";
import { analyzeSkeletonLines, analyzeSkeletonSplines } from "./skeletonAnalysis.js";
import {
  downloadText,
  renderSkeletonEquations,
  renderSkeletonLinePlot,
  renderSplineEquations,
  renderSplinePlot
} from "./graph.js";

const state = {
  imageLoaded: false,
  isProcessing: false,
  processed: null,
  analysis: null,
  method: "skeleton"
};

const elements = {
  status: document.querySelector("#opencvStatus"),
  howItWorksButton: document.querySelector("#howItWorksButton"),
  howItWorksDialog: document.querySelector("#howItWorksDialog"),
  closeHowItWorksButton: document.querySelector("#closeHowItWorksButton"),
  dropZone: document.querySelector("#dropZone"),
  imageInput: document.querySelector("#imageInput"),
  sourceCanvas: document.querySelector("#sourceCanvas"),
  edgeCanvas: document.querySelector("#edgeCanvas"),
  downloadButton: document.querySelector("#downloadButton"),
  desmosButton: document.querySelector("#desmosButton"),
  linePlot: document.querySelector("#linePlot"),
  equationList: document.querySelector("#equationList"),
  methodInputs: [...document.querySelectorAll('input[name="method"]')]
};

init();

function init() {
  bindEvents();
  watchOpenCv();
  renderEmptyPlot();
}

function bindEvents() {
  elements.howItWorksButton.addEventListener("click", () => {
    if (typeof elements.howItWorksDialog.showModal === "function") {
      elements.howItWorksDialog.showModal();
    } else {
      elements.howItWorksDialog.setAttribute("open", "");
    }
  });

  elements.closeHowItWorksButton.addEventListener("click", () => {
    elements.howItWorksDialog.close();
  });

  elements.howItWorksDialog.addEventListener("click", (event) => {
    if (event.target === elements.howItWorksDialog) elements.howItWorksDialog.close();
  });

  elements.imageInput.addEventListener("change", (event) => {
    const [file] = event.target.files;
    if (file) loadFile(file);
    event.target.value = "";
  });

  ["dragenter", "dragover"].forEach((eventName) => {
    elements.dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      elements.dropZone.classList.add("is-dragging");
    });
  });

  ["dragleave", "drop"].forEach((eventName) => {
    elements.dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      elements.dropZone.classList.remove("is-dragging");
    });
  });

  elements.dropZone.addEventListener("drop", (event) => {
    const [file] = event.dataTransfer.files;
    if (file) loadFile(file);
  });

  elements.methodInputs.forEach((input) => {
    input.addEventListener("change", () => {
      state.method = input.value;
      if (state.processed) analyzeAndRender();
    });
  });

  elements.downloadButton.addEventListener("click", downloadEquations);
  elements.desmosButton.addEventListener("click", openInDesmos);
}

function watchOpenCv() {
  const timer = window.setInterval(() => {
    if (window.cv?.Mat) {
      window.clearInterval(timer);
      elements.status.textContent = "Ready";
      elements.status.classList.add("is-ready");
      if (state.imageLoaded && !state.processed) processCurrentImage();
    }
  }, 120);
}

function loadFile(file) {
  if (!/^image\/(png|jpeg)$/.test(file.type)) {
    showStatus("Use a JPG or PNG image.");
    return;
  }

  const url = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => {
    drawSourceImage(image, { autoProcess: window.cv?.Mat });
    URL.revokeObjectURL(url);
  };
  image.onerror = () => {
    URL.revokeObjectURL(url);
    showStatus("Could not load image.");
  };
  image.src = url;
}

function drawSourceImage(image, options = {}) {
  const maxDimension = 1200;
  const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.round(image.naturalWidth * scale);
  const height = Math.round(image.naturalHeight * scale);

  elements.sourceCanvas.width = width;
  elements.sourceCanvas.height = height;
  const ctx = elements.sourceCanvas.getContext("2d");
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);

  resetDerivedState(width, height);

  if (options.autoProcess && window.cv?.Mat) {
    processCurrentImage();
  } else {
    elements.equationList.innerHTML = '<p class="muted">Processing starts automatically when OpenCV is ready.</p>';
  }
}

function processCurrentImage() {
  if (!state.imageLoaded || !window.cv?.Mat || state.isProcessing) return;

  try {
    setProcessing(true);
    state.processed = processImageToSkeleton(elements.sourceCanvas);
    drawBinaryImage(elements.edgeCanvas, state.processed.edgePixels, state.processed.width, state.processed.height);
    analyzeAndRender();
  } catch (error) {
    console.error(error);
    showStatus(error.message);
  } finally {
    setProcessing(false);
  }
}

function analyzeAndRender() {
  if (!state.processed) return;
  const { skeleton, width, height } = state.processed;

  if (state.method === "spline") {
    state.analysis = analyzeSkeletonSplines(skeleton, width, height, {
      minPoints: 10,
      numOutputPoints: 100
    });
    renderSplinePlot(elements.linePlot, state.analysis, width, height);
    renderSplineEquations(elements.equationList, state.analysis);
  } else {
    state.analysis = analyzeSkeletonLines(skeleton, width, height, {
      tolerance: 2,
      minSegmentLength: 4
    });
    renderSkeletonLinePlot(elements.linePlot, state.analysis, width, height);
    renderSkeletonEquations(elements.equationList, state.analysis);
  }

  elements.downloadButton.disabled = false;
  elements.desmosButton.disabled = false;
  const count = state.method === "spline" ? state.analysis.splines.length : state.analysis.segments.length;
  showStatus(`${count} ${state.method === "spline" ? "spline" : "line"}${count === 1 ? "" : "s"} found`);
}

function downloadEquations() {
  if (!state.analysis) return;
  const text = state.method === "spline" ? splineText(state.analysis) : skeletonText(state.analysis);
  downloadText(`${state.method}-equations.txt`, text);
}

function openInDesmos() {
  if (!state.analysis || !state.processed) return;

  const exportData = buildDesmosExportData();
  localStorage.setItem("geometricTracing.desmosExport", JSON.stringify(exportData));
  window.open("desmos-export.html", "_blank");
}

function buildDesmosExportData() {
  const base = {
    app: "Geometric Tracing",
    exportedAt: new Date().toISOString(),
    method: state.method,
    width: state.processed.width,
    height: state.processed.height
  };

  if (state.method === "spline") {
    return {
      ...base,
      splines: state.analysis.splines.map((spline) => ({
        id: spline.spline,
        points: spline.points.map(toPlainPoint),
        controlPoints: spline.controlPoints.map(toPlainPoint)
      }))
    };
  }

  return {
    ...base,
    segments: state.analysis.segments.map((segment) => ({
      id: segment.line,
      equation: segment.equation,
      point1: toPlainPoint(segment.point1),
      point2: toPlainPoint(segment.point2)
    }))
  };
}

function toPlainPoint(point) {
  return {
    x: Number(point.x.toFixed(6)),
    y: Number(point.y.toFixed(6))
  };
}

function skeletonText(result) {
  return [
    "========== SKAN-STYLE GRAPH LINE EQUATIONS ==========",
    "",
    ...result.segments.map((segment) => [
      `Line ${segment.line}: ${segment.equation}`,
      `  from (${segment.point1.x.toFixed(1)}, ${segment.point1.y.toFixed(1)}) to (${segment.point2.x.toFixed(1)}, ${segment.point2.y.toFixed(1)})`
    ].join("\n")),
    "",
    `Total line segments found: ${result.segments.length}`
  ].join("\n\n");
}

function splineText(result) {
  return [
    "========== SPLINE PARAMETRIC EQUATIONS ==========",
    "",
    ...result.splines.map((spline) => [
      `Spline ${spline.spline}:`,
      "  Parametric form:",
      "  x = x(t)",
      "  y = y(t)",
      "  where 0 <= t <= 1",
      `  Skeleton control points (${spline.controlPoints.length} points):`,
      ...spline.controlPoints.map((point, index) => `  P${index} = (${point.x.toFixed(3)}, ${point.y.toFixed(3)})`)
    ].join("\n")),
    "",
    `Total splines found: ${result.splines.length}`
  ].join("\n\n");
}

function resetDerivedState(width, height) {
  elements.edgeCanvas.width = width;
  elements.edgeCanvas.height = height;
  const edgeCtx = elements.edgeCanvas.getContext("2d");
  edgeCtx.clearRect(0, 0, width, height);

  state.imageLoaded = true;
  state.isProcessing = false;
  state.processed = null;
  state.analysis = null;
  elements.downloadButton.disabled = true;
  elements.desmosButton.disabled = true;
  renderEmptyPlot(width, height);
}

function setProcessing(isProcessing) {
  state.isProcessing = isProcessing;
  elements.imageInput.disabled = isProcessing;
}

function renderEmptyPlot(width = 10, height = 10) {
  Plotly.react(elements.linePlot, [], {
    margin: { l: 48, r: 18, t: 28, b: 42 },
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "#111827",
    font: { color: "#e5e7eb" },
    xaxis: { range: [0, width], gridcolor: "#263244" },
    yaxis: { range: [-height, 0], gridcolor: "#263244", scaleanchor: "x", scaleratio: 1 }
  }, { responsive: true, displaylogo: false });
}

function showStatus(message) {
  elements.status.textContent = message;
  window.clearTimeout(showStatus.timer);
  showStatus.timer = window.setTimeout(() => {
    if (window.cv?.Mat) elements.status.textContent = "Ready";
  }, 2600);
}
