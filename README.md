# Geometric Tracing

Geometric Tracing is a fully static GitHub Pages-compatible web app for converting uploaded images into mathematical geometric representations.

The app extracts image edges, skeletonizes them into one-pixel-wide centerlines, interprets those centerlines as graph paths, and reconstructs the geometry using either piecewise linear equations or smooth parametric spline curves.

## Features

- JPG/PNG image upload
- Black-and-white edge extraction
- Skeletonized line/curve tracing
- Piecewise Linear Approximation
- Parametric Catmull-Rom Approximation
- Cartesian-style Plotly visualization
- Equation and control point display
- Equation download
- LaTeX-rendered “How does it work?” explanation
- Fully static, no backend required

## How It Works

The app follows this pipeline:

image
→ intensity field
→ Sobel gradient response
→ Canny edge set
→ skeleton graph
→ line segments or spline curves

