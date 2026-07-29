/**
 * Batch processing — extract Mermaid from .md files and convert to images.
 *
 * Pipeline:
 *   1. Scan source directory for .md files
 *   2. Extract ```mermaid blocks → .mmd files in target/mermaid/
 *   3. Render each .mmd → full-size image + thumbnail
 *
 * Output structure:
 *   target/
 *   └── mermaid/
 *       ├── source-doc-name_1.mmd
 *       ├── source-doc-name_1.png
 *       ├── source-doc-name_1_thumb.png
 *       ├── source-doc-name_2.mmd
 *       ├── source-doc-name_2.png
 *       ├── source-doc-name_2_thumb.png
 *       └── ...
 */

const fs = require('fs');
const path = require('path');
const { render, renderToRaster, generateThumbnail, closeBrowser } = require('./renderer');

const MERMAID_REGEX = /```mermaid\s*\n([\s\S]*?)```/g;

/**
 * Recursively find all .md files in a directory.
 */
function findMarkdownFiles(dir) {
    const results = [];

    function walk(currentDir) {
        const entries = fs.readdirSync(currentDir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(currentDir, entry.name);
            if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
                walk(fullPath);
            } else if (entry.isFile() && entry.name.endsWith('.md')) {
                results.push(fullPath);
            }
        }
    }

    walk(dir);
    return results.sort();
}

/**
 * Extract mermaid blocks from a markdown file.
 * @returns {Array<{content: string, index: number}>}
 */
function extractMermaidBlocks(mdFilePath) {
    const text = fs.readFileSync(mdFilePath, 'utf-8');
    const blocks = [];
    let match;

    MERMAID_REGEX.lastIndex = 0;
    while ((match = MERMAID_REGEX.exec(text)) !== null) {
        blocks.push({ content: match[1].trim() });
    }

    return blocks;
}

/**
 * Run the full batch pipeline: extract + render.
 * @param {object} options
 * @param {string} options.sourceDir - Directory with .md files
 * @param {string} options.targetDir - Output directory
 * @param {string} options.format - Image format: svg, png, jpeg
 * @param {string} options.theme - Mermaid theme
 * @param {string} options.background - Background color
 * @param {number} options.scale - Scale factor for raster
 * @param {number} options.thumbWidth - Thumbnail width in px
 * @param {boolean} options.verbose - Print progress
 */
async function runBatch(options) {
    const {
        sourceDir,
        targetDir,
        format = 'png',
        theme = 'neutral',
        background = 'white',
        scale = 2,
        thumbWidth = 400,
        verbose = true,
    } = options;

    const mermaidDir = path.join(targetDir, 'mermaid');
    fs.mkdirSync(mermaidDir, { recursive: true });

    // Step 1: Find all markdown files
    const mdFiles = findMarkdownFiles(sourceDir);
    if (verbose) console.log(`\nFound ${mdFiles.length} markdown files in ${sourceDir}\n`);

    // Step 2: Extract mermaid blocks
    const extractions = [];
    for (const mdFile of mdFiles) {
        const blocks = extractMermaidBlocks(mdFile);
        if (blocks.length === 0) continue;

        const relativePath = path.relative(sourceDir, mdFile);
        const stem = path.basename(relativePath, '.md');

        for (let i = 0; i < blocks.length; i++) {
            const name = `${stem}_${i + 1}`;
            extractions.push({
                name,
                content: blocks[i].content,
                sourceFile: relativePath,
            });
        }

        if (verbose) console.log(`  ${relativePath}: ${blocks.length} diagram(s)`);
    }

    if (extractions.length === 0) {
        if (verbose) console.log('No mermaid diagrams found.');
        return { extracted: 0, rendered: 0, errors: [] };
    }

    if (verbose) {
        console.log(`\n  Total: ${extractions.length} diagrams to process\n`);
        console.log('  Rendering...\n');
    }

    // Step 3: Write .mmd files and render images
    let rendered = 0;
    const errors = [];
    const ext = format === 'jpeg' ? 'jpg' : format;

    for (const item of extractions) {
        const mmdPath = path.join(mermaidDir, `${item.name}.mmd`);
        const imgPath = path.join(mermaidDir, `${item.name}.${ext}`);
        const thumbPath = path.join(mermaidDir, `${item.name}_thumb.${ext}`);

        // Write .mmd
        fs.writeFileSync(mmdPath, item.content + '\n', 'utf-8');

        // Render image
        try {
            let imageBuffer;

            if (format === 'svg') {
                const svg = await render(item.content, { format: 'svg', theme, background });
                fs.writeFileSync(imgPath, svg, 'utf-8');
                // For SVG thumbnails, render a raster version at thumbnail size
                const rasterBuf = await renderToRaster(item.content, {
                    format: 'png', theme, background, scale: 1,
                });
                const thumbBuf = await generateThumbnail(rasterBuf, { width: thumbWidth, format: 'png' });
                const thumbPngPath = path.join(mermaidDir, `${item.name}_thumb.png`);
                fs.writeFileSync(thumbPngPath, thumbBuf);
            } else {
                imageBuffer = await render(item.content, { format, theme, background, scale });
                fs.writeFileSync(imgPath, imageBuffer);
                // Generate thumbnail
                const thumbBuf = await generateThumbnail(imageBuffer, { width: thumbWidth, format });
                fs.writeFileSync(thumbPath, thumbBuf);
            }

            rendered++;
            if (verbose && rendered % 5 === 0) {
                process.stdout.write(`    [${rendered}/${extractions.length}] rendered\r`);
            }
        } catch (err) {
            errors.push({ name: item.name, error: err.message });
            if (verbose) console.log(`    ❌ ${item.name}: ${err.message}`);
        }
    }

    await closeBrowser();

    if (verbose) {
        console.log(`\n  ────────────────────────────────────────`);
        console.log(`  ✅ Rendered: ${rendered}/${extractions.length}`);
        if (errors.length > 0) console.log(`  ❌ Errors: ${errors.length}`);
        console.log(`  📁 Output:  ${mermaidDir}/`);
        console.log(`  ────────────────────────────────────────\n`);
    }

    return { extracted: extractions.length, rendered, errors };
}

module.exports = { runBatch, findMarkdownFiles, extractMermaidBlocks };
