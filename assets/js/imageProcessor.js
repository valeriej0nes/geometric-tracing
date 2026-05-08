export function processImageToSkeleton(sourceCanvas) {
  if (!window.cv?.Mat) {
    throw new Error("OpenCV is still loading.");
  }

  const cv = window.cv;
  const src = cv.imread(sourceCanvas);
  const gray = new cv.Mat();
  const blurred = new cv.Mat();
  const edges = new cv.Mat();

  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 1.4, 1.4, cv.BORDER_DEFAULT);
    cv.Canny(blurred, edges, 50, 150);

    const width = edges.cols;
    const height = edges.rows;
    const edgePixels = Uint8Array.from(edges.data, (value) => (value > 80 ? 1 : 0));
    const skeleton = skeletonize(edgePixels, width, height);

    return {
      width,
      height,
      edgePixels,
      skeleton
    };
  } finally {
    src.delete();
    gray.delete();
    blurred.delete();
    edges.delete();
  }
}

export function drawBinaryImage(canvas, pixels, width, height) {
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  const imageData = ctx.createImageData(width, height);

  for (let index = 0; index < pixels.length; index += 1) {
    const value = pixels[index] ? 255 : 0;
    const offset = index * 4;
    imageData.data[offset] = value;
    imageData.data[offset + 1] = value;
    imageData.data[offset + 2] = value;
    imageData.data[offset + 3] = 255;
  }

  ctx.putImageData(imageData, 0, 0);
}

// Zhang-Suen thinning, the browser equivalent of skimage.morphology.skeletonize
// for this binary edge-image use case.
function skeletonize(binary, width, height) {
  const image = Uint8Array.from(binary);
  let changed = true;

  while (changed) {
    changed = false;
    const firstPass = [];
    const secondPass = [];

    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const index = y * width + x;
        if (!image[index]) continue;
        const n = neighbors(image, width, x, y);
        const count = n.reduce((sum, value) => sum + value, 0);
        const transitions = transitionCount(n);
        if (
          count >= 2 &&
          count <= 6 &&
          transitions === 1 &&
          n[0] * n[2] * n[4] === 0 &&
          n[2] * n[4] * n[6] === 0
        ) {
          firstPass.push(index);
        }
      }
    }

    if (firstPass.length) changed = true;
    for (const index of firstPass) image[index] = 0;

    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const index = y * width + x;
        if (!image[index]) continue;
        const n = neighbors(image, width, x, y);
        const count = n.reduce((sum, value) => sum + value, 0);
        const transitions = transitionCount(n);
        if (
          count >= 2 &&
          count <= 6 &&
          transitions === 1 &&
          n[0] * n[2] * n[6] === 0 &&
          n[0] * n[4] * n[6] === 0
        ) {
          secondPass.push(index);
        }
      }
    }

    if (secondPass.length) changed = true;
    for (const index of secondPass) image[index] = 0;
  }

  return image;
}

function neighbors(image, width, x, y) {
  return [
    image[(y - 1) * width + x],
    image[(y - 1) * width + x + 1],
    image[y * width + x + 1],
    image[(y + 1) * width + x + 1],
    image[(y + 1) * width + x],
    image[(y + 1) * width + x - 1],
    image[y * width + x - 1],
    image[(y - 1) * width + x - 1]
  ];
}

function transitionCount(values) {
  let transitions = 0;
  for (let i = 0; i < values.length; i += 1) {
    if (values[i] === 0 && values[(i + 1) % values.length] === 1) transitions += 1;
  }
  return transitions;
}
