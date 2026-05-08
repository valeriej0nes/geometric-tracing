const DIRECTIONS = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0],           [1, 0],
  [-1, 1],  [0, 1],  [1, 1]
];

export function analyzeSkeletonLines(skeleton, width, height, options = {}) {
  const tolerance = options.tolerance ?? 2;
  const minSegmentLength = options.minSegmentLength ?? 4;
  const skeletonPoints = collectSkeletonPoints(skeleton, width, height);
  const paths = traceSkeletonPaths(skeleton, width, height);
  const segments = [];
  let lineNumber = 1;

  for (const path of paths) {
    if (path.length < 3) continue;
    const cartPoints = path.map(([x, y]) => ({ x, y: -y }));
    const simplified = simplifyPath(cartPoints, tolerance);

    for (let i = 0; i < simplified.length - 1; i += 1) {
      const p1 = simplified[i];
      const p2 = simplified[i + 1];
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const length = Math.hypot(dx, dy);
      if (length < minSegmentLength) continue;

      const equation = Math.abs(dx) < 1e-9
        ? `x = ${formatNumber(p1.x)}`
        : `y = ${formatNumber(dy / dx, 4)}x ${formatSigned(p1.y - (dy / dx) * p1.x, 4)}`;

      segments.push({
        line: lineNumber,
        point1: p1,
        point2: p2,
        equation,
        length
      });
      lineNumber += 1;
    }
  }

  return { skeletonPoints, paths, segments };
}

export function analyzeSkeletonSplines(skeleton, width, height, options = {}) {
  const minPoints = options.minPoints ?? 10;
  const numOutputPoints = options.numOutputPoints ?? 100;
  const skeletonPoints = collectSkeletonPoints(skeleton, width, height);
  const paths = traceSkeletonPaths(skeleton, width, height);
  const splines = [];
  let splineNumber = 1;

  for (const path of paths) {
    const clean = removeConsecutiveDuplicates(path).map(([x, y]) => ({ x, y: -y }));
    if (clean.length < minPoints) continue;
    const sampled = sampleCatmullRom(clean, numOutputPoints);
    if (sampled.length < minPoints) continue;

    splines.push({
      spline: splineNumber,
      controlPoints: clean,
      points: sampled,
      equation: "x = x(t), y = y(t), 0 <= t <= 1",
      detail: `Parametric spline approximation through ${clean.length} skeleton control points.`
    });
    splineNumber += 1;
  }

  return { skeletonPoints, paths, splines };
}

function traceSkeletonPaths(skeleton, width, height) {
  const degrees = new Uint8Array(skeleton.length);
  const nodeIndices = [];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (!skeleton[index]) continue;
      const degree = neighborPixels(skeleton, width, height, x, y).length;
      degrees[index] = degree;
      if (degree !== 2) nodeIndices.push(index);
    }
  }

  const visited = new Set();
  const paths = [];

  for (const nodeIndex of nodeIndices) {
    const x = nodeIndex % width;
    const y = Math.floor(nodeIndex / width);
    for (const [nx, ny] of neighborPixels(skeleton, width, height, x, y)) {
      const edge = edgeKey(x, y, nx, ny);
      if (visited.has(edge)) continue;
      paths.push(walkPath(skeleton, degrees, width, height, x, y, nx, ny, visited));
    }
  }

  for (let index = 0; index < skeleton.length; index += 1) {
    if (!skeleton[index]) continue;
    const x = index % width;
    const y = Math.floor(index / width);
    const neighbors = neighborPixels(skeleton, width, height, x, y);
    const unvisited = neighbors.find(([nx, ny]) => !visited.has(edgeKey(x, y, nx, ny)));
    if (unvisited) paths.push(walkPath(skeleton, degrees, width, height, x, y, unvisited[0], unvisited[1], visited));
  }

  return paths.filter((path) => path.length > 1);
}

function walkPath(skeleton, degrees, width, height, startX, startY, nextX, nextY, visited) {
  const path = [[startX, startY]];
  let previous = [startX, startY];
  let current = [nextX, nextY];

  while (true) {
    path.push(current);
    visited.add(edgeKey(previous[0], previous[1], current[0], current[1]));

    const currentIndex = current[1] * width + current[0];
    if (degrees[currentIndex] !== 2 && !(current[0] === startX && current[1] === startY)) break;

    const candidates = neighborPixels(skeleton, width, height, current[0], current[1])
      .filter(([x, y]) => !(x === previous[0] && y === previous[1]));

    const next = candidates.find(([x, y]) => !visited.has(edgeKey(current[0], current[1], x, y))) || candidates[0];
    if (!next) break;
    if (next[0] === startX && next[1] === startY) {
      path.push([startX, startY]);
      visited.add(edgeKey(current[0], current[1], startX, startY));
      break;
    }

    previous = current;
    current = next;
  }

  return path;
}

function neighborPixels(skeleton, width, height, x, y) {
  const result = [];
  for (const [dx, dy] of DIRECTIONS) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
    if (skeleton[ny * width + nx]) result.push([nx, ny]);
  }
  return result;
}

function collectSkeletonPoints(skeleton, width, height) {
  const x = [];
  const y = [];
  for (let row = 0; row < height; row += 1) {
    for (let col = 0; col < width; col += 1) {
      if (skeleton[row * width + col]) {
        x.push(col);
        y.push(-row);
      }
    }
  }
  return { x, y };
}

function simplifyPath(points, tolerance) {
  if (points.length <= 2) return points;
  const first = points[0];
  const last = points[points.length - 1];
  let maxDistance = 0;
  let splitIndex = 0;

  for (let i = 1; i < points.length - 1; i += 1) {
    const distance = perpendicularDistance(points[i], first, last);
    if (distance > maxDistance) {
      maxDistance = distance;
      splitIndex = i;
    }
  }

  if (maxDistance <= tolerance) return [first, last];
  const left = simplifyPath(points.slice(0, splitIndex + 1), tolerance);
  const right = simplifyPath(points.slice(splitIndex), tolerance);
  return [...left.slice(0, -1), ...right];
}

function perpendicularDistance(point, lineStart, lineEnd) {
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;
  if (Math.abs(dx) + Math.abs(dy) === 0) return Math.hypot(point.x - lineStart.x, point.y - lineStart.y);
  return Math.abs(dy * point.x - dx * point.y + lineEnd.x * lineStart.y - lineEnd.y * lineStart.x) / Math.hypot(dx, dy);
}

function sampleCatmullRom(points, outputCount) {
  if (points.length < 2) return points;
  const result = [];
  const segmentCount = points.length - 1;

  for (let i = 0; i < outputCount; i += 1) {
    const scaled = (i / (outputCount - 1)) * segmentCount;
    const segment = Math.min(segmentCount - 1, Math.floor(scaled));
    const t = scaled - segment;
    const p0 = points[Math.max(0, segment - 1)];
    const p1 = points[segment];
    const p2 = points[segment + 1];
    const p3 = points[Math.min(points.length - 1, segment + 2)];
    result.push(catmullRomPoint(p0, p1, p2, p3, t));
  }

  return result;
}

function catmullRomPoint(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3)
  };
}

function removeConsecutiveDuplicates(points) {
  const result = [];
  for (const point of points) {
    const last = result.at(-1);
    if (!last || last[0] !== point[0] || last[1] !== point[1]) result.push(point);
  }
  return result;
}

function edgeKey(x1, y1, x2, y2) {
  return x1 < x2 || (x1 === x2 && y1 <= y2)
    ? `${x1},${y1}:${x2},${y2}`
    : `${x2},${y2}:${x1},${y1}`;
}

function formatSigned(value, decimals = 2) {
  return value < 0 ? `- ${formatNumber(Math.abs(value), decimals)}` : `+ ${formatNumber(value, decimals)}`;
}

function formatNumber(value, decimals = 2) {
  return Number(value.toFixed(decimals)).toString();
}
