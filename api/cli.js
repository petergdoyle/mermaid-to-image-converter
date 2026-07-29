#!/usr/bin/env node
/**
 * CLI for batch Mermaid conversion.
 *
 * Usage:
 *   node api/cli.js <source-dir> [options]
 *
 * Options:
 *   --output, -o    Output directory (default: ./output)
 *   --format, -f    Image format: svg, png, jpeg (default: png)
 *   --theme, -t     Mermaid theme: default, dark, forest, neutral (default: neutral)
 *   --background    Background: transparent, white, #hex (default: white)
 *   --scale, -s     Scale factor for raster: 1-4 (default: 2)
 *   --thumb-width   Thumbnail width in px (default: 400)
 *   --help, -h      Show help
 *
 * Examples:
 *   node api/cli.js ./docs --format png --output ./output
 *   node api/cli.js ../platform-manager/docs -f svg -o ./output --theme neutral
 */

const path = require('path');
const { runBatch } = require('./batch');

function parseArgs(args) {
    const opts = {
        sourceDir: null,
        output: './output',
        format: 'png',
        theme: 'neutral',
        background: 'white',
        scale: 2,
        thumbWidth: 400,
    };

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];

        if (arg === '--help' || arg === '-h') {
            printHelp();
            process.exit(0);
        } else if (arg === '--output' || arg === '-o') {
            opts.output = args[++i];
        } else if (arg === '--format' || arg === '-f') {
            opts.format = args[++i];
        } else if (arg === '--theme' || arg === '-t') {
            opts.theme = args[++i];
        } else if (arg === '--background') {
            opts.background = args[++i];
        } else if (arg === '--scale' || arg === '-s') {
            opts.scale = parseInt(args[++i]) || 2;
        } else if (arg === '--thumb-width') {
            opts.thumbWidth = parseInt(args[++i]) || 400;
        } else if (!arg.startsWith('-') && !opts.sourceDir) {
            opts.sourceDir = arg;
        }
    }

    return opts;
}

function printHelp() {
    console.log(`
  🧜‍♀️ Mermaid Batch Converter

  Scans a directory for .md files, extracts Mermaid diagrams,
  and renders them to images with thumbnails.

  Usage:
    node api/cli.js <source-dir> [options]

  Options:
    --output, -o     Output directory (default: ./output)
    --format, -f     Image format: svg, png, jpeg (default: png)
    --theme, -t      Theme: default, dark, forest, neutral (default: neutral)
    --background     Background: transparent, white, #hex (default: white)
    --scale, -s      Scale factor for raster: 1-4 (default: 2)
    --thumb-width    Thumbnail width in px (default: 400)
    --help, -h       Show this help

  Output structure:
    <output>/mermaid/
      ├── source-doc_1.mmd          (extracted diagram source)
      ├── source-doc_1.png          (full-size rendered image)
      ├── source-doc_1_thumb.png    (thumbnail for embedding)
      ├── source-doc_2.mmd
      ├── source-doc_2.png
      └── ...

  Examples:
    node api/cli.js ./docs --format png
    node api/cli.js ../platform-manager/docs -f svg -o ./rendered
`);
}

async function main() {
    const args = process.argv.slice(2);
    const opts = parseArgs(args);

    if (!opts.sourceDir) {
        console.error('Error: source directory is required.\n');
        printHelp();
        process.exit(1);
    }

    const sourceDir = path.resolve(opts.sourceDir);
    const targetDir = path.resolve(opts.output);

    const validFormats = ['svg', 'png', 'jpeg'];
    if (!validFormats.includes(opts.format)) {
        console.error(`Error: invalid format "${opts.format}". Use: ${validFormats.join(', ')}`);
        process.exit(1);
    }

    console.log(`\n  🧜‍♀️ Mermaid Batch Converter`);
    console.log(`  ─────────────────────────────────`);
    console.log(`  Source:     ${sourceDir}`);
    console.log(`  Output:     ${targetDir}/mermaid/`);
    console.log(`  Format:     ${opts.format}`);
    console.log(`  Theme:      ${opts.theme}`);
    console.log(`  Background: ${opts.background}`);
    console.log(`  Scale:      ${opts.scale}x`);
    console.log(`  Thumbnails: ${opts.thumbWidth}px wide`);
    console.log(`  ─────────────────────────────────`);

    const result = await runBatch({
        sourceDir,
        targetDir,
        format: opts.format,
        theme: opts.theme,
        background: opts.background,
        scale: opts.scale,
        thumbWidth: opts.thumbWidth,
        verbose: true,
    });

    process.exit(result.errors.length > 0 ? 1 : 0);
}

main().catch((err) => {
    console.error('Fatal error:', err.message);
    process.exit(1);
});
