# 🧜‍♀️ Mermaid to Image Converter

A client-side web app + Node.js API for rendering Mermaid diagrams and exporting them as SVG, PNG, or JPEG.

**Two ways to use it:**

1. **Browser UI** — open `index.html` directly from your filesystem. No server, no uploads, no dependencies.
2. **API + CLI** — Node.js service for batch conversion, headless rendering, and automation.

---

## Quick Start

### Static Browser UI (zero dependencies)

```bash
open index.html
```

That's it. Paste a diagram, export an image.

### API + CLI (requires Node.js 20+)

```bash
make env       # Install dependencies
make dev-up    # Start API server (http://localhost:3200)
make convert   # Interactive batch conversion
```

---

## Features

### Browser UI (`index.html`)

- ✏️ Live editor with real-time preview (500ms debounce)
- 🎨 Theme selection (Default, Dark, Forest, Neutral)
- 🖼️ Background options (Transparent, White, Dark)
- ⬇️ Export to SVG, PNG, or JPEG
- 📋 Copy SVG to clipboard
- 🔍 Zoom controls (in/out/reset)
- 🔍 Scale control (1x–4x) for high-resolution raster exports
- ⌨️ Keyboard shortcuts (Cmd+Enter to render, Cmd+S to save SVG)
- 📱 Responsive layout
- 🔒 Privacy — nothing leaves your browser

### API Server (`api/server.js`)

- `GET /health` — Liveness check
- `POST /convert` — Single diagram → image (SVG, PNG, or JPEG)
- `POST /convert/batch` — Multiple diagrams → ZIP archive with thumbnails
- `/ui` — Serves the browser UI over HTTP

### Batch CLI (`api/cli.js`)

- Scans directories for `.md` files
- Extracts all ` ```mermaid ` blocks
- Renders each to full-size image + thumbnail
- Interactive prompts or direct CLI arguments
- Output: `{name}_1.mmd`, `{name}_1.png`, `{name}_1_thumb.png`

---

## Makefile Targets

```
Local Development:
  dev-up        Start API + UI server (background)
  dev-down      Stop local dev processes

Docker:
  docker-up     Build and start container (API + UI)
  docker-down   Stop and remove container

Utilities:
  env           Install Node.js dependencies
  status        Check running services (local + Docker)
  convert       Batch extract + render diagrams from .md files
  clean         Remove output/ directory
```

---

## Usage

### Browser UI

Open `index.html` in any browser — works from `file://` with zero setup.

Or serve via the API at `http://localhost:3200/ui` after `make dev-up`.

### Single Diagram via API

```bash
curl -X POST http://localhost:3200/convert \
  -H "Content-Type: text/plain" \
  -H "X-Format: png" \
  -H "X-Theme: neutral" \
  -d 'flowchart TD
    A[Start] --> B{Decision}
    B -->|Yes| C[Done]
    B -->|No| A' \
  -o diagram.png
```

**Headers:**

| Header | Values | Default |
|--------|--------|---------|
| `X-Format` | svg, png, jpeg | svg |
| `X-Theme` | default, dark, forest, neutral | default |
| `X-Background` | transparent, white, #hex | transparent (svg/png), white (jpeg) |
| `X-Scale` | 1–4 | 2 |
| `X-Filename` | any string | diagram |

### Batch Conversion (Interactive)

```bash
make convert
```

Prompts for source directory, output directory, format, theme, scale, and thumbnail size.

### Batch Conversion (Direct)

```bash
make convert SOURCE=~/docs FORMAT=png THEME=neutral SCALE=2
```

Or call the CLI directly:

```bash
node api/cli.js ./path/to/docs --format svg --output ./output --theme neutral
```

### Batch via API

```bash
curl -X POST http://localhost:3200/convert/batch \
  -H "Content-Type: application/json" \
  -H "X-Format: png" \
  -H "X-Theme: neutral" \
  -d '{
    "diagrams": [
      {"name": "flow-1", "content": "flowchart TD\n  A-->B"},
      {"name": "seq-1", "content": "sequenceDiagram\n  A->>B: Hello"}
    ]
  }' \
  -o diagrams.zip
```

Returns a ZIP with full-size images + thumbnails.

---

## Output Structure

```
output/mermaid/
├── source-doc-name_1.mmd           # Extracted diagram source
├── source-doc-name_1.png           # Full-size rendered image
├── source-doc-name_1_thumb.png     # 400px thumbnail (for Google Docs embedding)
├── source-doc-name_2.mmd
├── source-doc-name_2.png
├── source-doc-name_2_thumb.png
└── ...
```

Files are named after the source markdown file with a sequence number. Thumbnails are sized for embedding in documents and linking to the full-size image.

---

## Docker

```bash
make docker-up    # Build + run on port 3200
make docker-down  # Stop
```

The Docker image includes Chromium for headless rendering — no external dependencies needed at runtime.

---

## Supported Diagram Types

All Mermaid diagram types are supported:

- Flowcharts (`flowchart TD/LR`)
- Sequence diagrams (`sequenceDiagram`)
- Class diagrams (`classDiagram`)
- State diagrams (`stateDiagram-v2`)
- Entity-Relationship (`erDiagram`)
- Gantt charts (`gantt`)
- Pie charts (`pie`)
- Git graphs (`gitGraph`)
- Mindmaps (`mindmap`)
- Timeline (`timeline`)
- And more — see [Mermaid docs](https://mermaid.js.org/intro/)

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Browser UI | Vanilla HTML/CSS/JS, Mermaid.js v11 (CDN) |
| API Server | Node.js, Express |
| Rendering | Puppeteer (headless Chromium) + Mermaid.js |
| Thumbnails | Sharp |
| Batch output | Archiver (ZIP) |
| Container | node:20-slim + system Chromium |

---

## Keyboard Shortcuts (Browser UI)

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + Enter` | Render immediately (skip debounce) |
| `Cmd/Ctrl + S` | Export as SVG |

---

## Project Structure

```
mermaid-to-image-converter/
├── index.html          # Static browser UI (zero deps, works from file://)
├── app.js              # Browser-side rendering logic
├── style.css           # UI styles
├── Makefile            # Dev, Docker, and batch targets
├── api/
│   ├── server.js       # Express API server
│   ├── renderer.js     # Puppeteer headless rendering
│   ├── batch.js        # Directory scanning + extraction + rendering
│   ├── cli.js          # CLI with interactive prompts
│   ├── Dockerfile      # Container image (with Chromium)
│   └── docker-compose.yml
└── output/             # Generated images (gitignored)
```

---

## License

MIT
