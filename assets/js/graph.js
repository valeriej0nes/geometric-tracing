const COLORS = ["#2dd4bf", "#f97316", "#a78bfa", "#f43f5e", "#84cc16", "#38bdf8", "#facc15", "#fb7185"];

export function renderSkeletonLinePlot(element, result, width, height) {
  const traces = [skeletonTrace(result.skeletonPoints)];

  result.segments.forEach((segment, index) => {
    traces.push({
      x: [segment.point1.x, segment.point2.x],
      y: [segment.point1.y, segment.point2.y],
      mode: "lines",
      type: "scatter",
      name: `Line ${segment.line}`,
      line: { color: COLORS[index % COLORS.length], width: 2 },
      hovertemplate: `${segment.equation}<extra></extra>`
    });
  });

  renderPlot(element, traces, width, height, "Piecewise Linear Approximation");
}

export function renderSplinePlot(element, result, width, height) {
  const traces = [skeletonTrace(result.skeletonPoints)];

  result.splines.forEach((spline, index) => {
    traces.push({
      x: spline.points.map((point) => point.x),
      y: spline.points.map((point) => point.y),
      mode: "lines",
      type: "scatter",
      name: `Spline ${spline.spline}`,
      line: { color: COLORS[index % COLORS.length], width: 2 },
      hovertemplate: `Spline ${spline.spline}<br>${spline.equation}<extra></extra>`
    });
  });

  renderPlot(element, traces, width, height, "Parametric B-Spline Approximation");
}

export function renderSkeletonEquations(element, result) {
  if (!result.segments.length) {
    element.innerHTML = '<p class="muted">No line segments found.</p>';
    return;
  }

  element.innerHTML = result.segments.map((segment) => `
    <article class="equation-card">
      <h3>Line ${segment.line}: ${escapeHtml(segment.equation)}</h3>
      <p>from (${segment.point1.x.toFixed(1)}, ${segment.point1.y.toFixed(1)}) to (${segment.point2.x.toFixed(1)}, ${segment.point2.y.toFixed(1)})</p>
    </article>
  `).join("");
}

export function renderSplineEquations(element, result) {
  if (!result.splines.length) {
    element.innerHTML = '<p class="muted">No splines found.</p>';
    return;
  }

  element.innerHTML = result.splines.map((spline) => `
    <article class="equation-card">
      <h3>Spline ${spline.spline}</h3>
      <code>${escapeHtml(spline.equation)}</code>
      <p>${escapeHtml(spline.detail)}</p>
      <details>
        <summary>Skeleton control points (${spline.controlPoints.length})</summary>
        <code>${escapeHtml(formatControlPoints(spline.controlPoints))}</code>
      </details>
    </article>
  `).join("");
}

export function downloadText(filename, text) {
  const blob = new Blob([text], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function skeletonTrace(skeletonPoints) {
  return {
    x: skeletonPoints.x,
    y: skeletonPoints.y,
    mode: "markers",
    type: "scattergl",
    name: "Skeleton",
    marker: { color: "rgba(203, 213, 225, 0.62)", size: 2 },
    hoverinfo: "skip"
  };
}

function renderPlot(element, traces, width, height, title) {
  Plotly.react(element, traces, {
    title: { text: title, font: { size: 16 } },
    margin: { l: 48, r: 18, t: 48, b: 42 },
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "#111827",
    font: { color: "#e5e7eb" },
    xaxis: {
      title: "X",
      range: [0, width],
      gridcolor: "#263244",
      zerolinecolor: "#94a3b8"
    },
    yaxis: {
      title: "Y",
      range: [-height, 0],
      scaleanchor: "x",
      scaleratio: 1,
      gridcolor: "#263244",
      zerolinecolor: "#94a3b8"
    },
    legend: { orientation: "h", y: -0.16, bgcolor: "rgba(0,0,0,0)" }
  }, {
    responsive: true,
    displaylogo: false,
    modeBarButtonsToRemove: ["lasso2d", "select2d"]
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatControlPoints(points) {
  return points
    .map((point, index) => `P${index} = (${point.x.toFixed(3)}, ${point.y.toFixed(3)})`)
    .join("\n");
}
