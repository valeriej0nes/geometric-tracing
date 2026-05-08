const EPSILON = 1e-9;

export function imageToMathPoint(point, calibration, width, height) {
  const x = calibration.xMin + (point.x / width) * (calibration.xMax - calibration.xMin);
  const y = calibration.yMax - (point.y / height) * (calibration.yMax - calibration.yMin);
  return { x, y };
}

export function fitBestFunction(points, options = {}) {
  const cleaned = dedupeAndSort(points).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (cleaned.length < 2) return null;

  if (isNearlyVertical(cleaned)) {
    const x = mean(cleaned.map((p) => p.x));
    return {
      type: "vertical",
      label: `x = ${formatNumber(x)}`,
      coefficients: [x],
      rmse: 0,
      r2: 1,
      points: cleaned,
      evaluate: () => null
    };
  }

  const maxDegree = Math.max(1, Math.min(3, Number(options.maxDegree || 2)));
  const candidates = [];
  for (let degree = 1; degree <= maxDegree; degree += 1) {
    const poly = fitPolynomial(cleaned, degree);
    if (poly) candidates.push(poly);
  }

  const sine = fitSinusoid(cleaned);
  if (sine) candidates.push(sine);

  if (!candidates.length) return null;
  candidates.sort((a, b) => scoreModel(a, cleaned.length) - scoreModel(b, cleaned.length));
  return candidates[0];
}

export function fitPolynomial(points, degree) {
  if (points.length < degree + 1) return null;
  const n = degree + 1;
  const matrix = Array.from({ length: n }, () => Array(n).fill(0));
  const vector = Array(n).fill(0);

  for (const { x, y } of points) {
    const powers = Array.from({ length: 2 * degree + 1 }, (_, i) => x ** i);
    for (let row = 0; row < n; row += 1) {
      for (let col = 0; col < n; col += 1) {
        matrix[row][col] += powers[row + col];
      }
      vector[row] += y * powers[row];
    }
  }

  const coefficients = solveLinearSystem(matrix, vector);
  if (!coefficients) return null;

  const evaluate = (x) => coefficients.reduce((sum, coefficient, power) => sum + coefficient * x ** power, 0);
  const metrics = regressionMetrics(points, evaluate);
  const type = degree === 1 ? "linear" : degree === 2 ? "quadratic" : "polynomial";
  return {
    type,
    label: polynomialLabel(coefficients),
    coefficients,
    rmse: metrics.rmse,
    r2: metrics.r2,
    points,
    evaluate
  };
}

export function fitSinusoid(points) {
  if (points.length < 8) return null;
  const xs = points.map((p) => p.x);
  const span = Math.max(...xs) - Math.min(...xs);
  if (span <= EPSILON) return null;

  let best = null;
  const minOmega = (Math.PI * 0.5) / span;
  const maxOmega = (Math.PI * 10) / span;
  const steps = 72;

  for (let i = 0; i <= steps; i += 1) {
    const omega = minOmega + ((maxOmega - minOmega) * i) / steps;
    const fit = fitSineForOmega(points, omega);
    if (!fit) continue;
    if (!best || fit.rmse < best.rmse) best = fit;
  }

  if (!best) return null;
  const amplitude = Math.hypot(best.sinCoefficient, best.cosCoefficient);
  if (amplitude < EPSILON) return null;
  const phase = Math.atan2(best.cosCoefficient, best.sinCoefficient);
  const evaluate = (x) => amplitude * Math.sin(best.omega * x + phase) + best.offset;
  const metrics = regressionMetrics(points, evaluate);

  return {
    type: "sinusoidal",
    label: `y = ${formatNumber(amplitude)} sin(${formatNumber(best.omega)}x ${formatSigned(phase)}) ${formatSigned(best.offset)}`,
    coefficients: [amplitude, best.omega, phase, best.offset],
    rmse: metrics.rmse,
    r2: metrics.r2,
    points,
    evaluate
  };
}

export function buildTraceSamples(model, xRange, yRange, sampleCount = 320) {
  if (model.type === "vertical") {
    return {
      x: [model.coefficients[0], model.coefficients[0]],
      y: [yRange[0], yRange[1]]
    };
  }

  const [xMin, xMax] = xRange;
  const x = [];
  const y = [];
  for (let i = 0; i < sampleCount; i += 1) {
    const value = xMin + ((xMax - xMin) * i) / (sampleCount - 1);
    const yValue = model.evaluate(value);
    if (Number.isFinite(yValue)) {
      x.push(value);
      y.push(yValue);
    }
  }
  return { x, y };
}

function fitSineForOmega(points, omega) {
  const matrix = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0]
  ];
  const vector = [0, 0, 0];

  for (const { x, y } of points) {
    const row = [Math.sin(omega * x), Math.cos(omega * x), 1];
    for (let r = 0; r < 3; r += 1) {
      for (let c = 0; c < 3; c += 1) matrix[r][c] += row[r] * row[c];
      vector[r] += row[r] * y;
    }
  }

  const solved = solveLinearSystem(matrix, vector);
  if (!solved) return null;
  const [sinCoefficient, cosCoefficient, offset] = solved;
  const evaluate = (x) => sinCoefficient * Math.sin(omega * x) + cosCoefficient * Math.cos(omega * x) + offset;
  const { rmse } = regressionMetrics(points, evaluate);
  return { omega, sinCoefficient, cosCoefficient, offset, rmse };
}

function solveLinearSystem(matrix, vector) {
  const n = vector.length;
  const augmented = matrix.map((row, i) => [...row, vector[i]]);

  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < n; row += 1) {
      if (Math.abs(augmented[row][col]) > Math.abs(augmented[pivot][col])) pivot = row;
    }
    if (Math.abs(augmented[pivot][col]) < EPSILON) return null;
    [augmented[col], augmented[pivot]] = [augmented[pivot], augmented[col]];

    const divisor = augmented[col][col];
    for (let c = col; c <= n; c += 1) augmented[col][c] /= divisor;
    for (let row = 0; row < n; row += 1) {
      if (row === col) continue;
      const factor = augmented[row][col];
      for (let c = col; c <= n; c += 1) augmented[row][c] -= factor * augmented[col][c];
    }
  }

  return augmented.map((row) => row[n]);
}

function regressionMetrics(points, evaluate) {
  const ys = points.map((p) => p.y);
  const yMean = mean(ys);
  let residual = 0;
  let total = 0;
  for (const point of points) {
    const estimate = evaluate(point.x);
    residual += (point.y - estimate) ** 2;
    total += (point.y - yMean) ** 2;
  }
  return {
    rmse: Math.sqrt(residual / points.length),
    r2: total < EPSILON ? 1 : 1 - residual / total
  };
}

function scoreModel(model, count) {
  const complexity = model.type === "linear" ? 2 : model.type === "quadratic" ? 3 : model.type === "sinusoidal" ? 4 : 4;
  return count * Math.log(model.rmse ** 2 + EPSILON) + complexity * Math.log(count);
}

function polynomialLabel(coefficients) {
  const terms = [];
  for (let power = coefficients.length - 1; power >= 0; power -= 1) {
    const coefficient = coefficients[power];
    if (Math.abs(coefficient) < 1e-5) continue;
    const abs = Math.abs(coefficient);
    const sign = coefficient < 0 ? "-" : "+";
    const body = power === 0
      ? formatNumber(abs)
      : power === 1
        ? `${formatNumber(abs)}x`
        : `${formatNumber(abs)}x^${power}`;
    terms.push({ sign, body });
  }
  if (!terms.length) return "y = 0";
  const first = terms[0].sign === "-" ? `-${terms[0].body}` : terms[0].body;
  return `y = ${first} ${terms.slice(1).map((term) => `${term.sign} ${term.body}`).join(" ")}`.trim();
}

function isNearlyVertical(points) {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const xSpan = Math.max(...xs) - Math.min(...xs);
  const ySpan = Math.max(...ys) - Math.min(...ys);
  return xSpan < Math.max(ySpan * 0.04, EPSILON);
}

function dedupeAndSort(points) {
  const seen = new Set();
  const result = [];
  for (const point of points) {
    const key = `${point.x.toFixed(5)}:${point.y.toFixed(5)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(point);
  }
  return result.sort((a, b) => a.x - b.x);
}

function formatSigned(value) {
  const sign = value < 0 ? "-" : "+";
  return `${sign} ${formatNumber(Math.abs(value))}`;
}

function formatNumber(value) {
  if (Math.abs(value) < 1e-6) return "0";
  return Number(value.toFixed(4)).toString();
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
