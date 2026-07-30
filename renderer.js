/**
 * Headless Mermaid renderer using Puppeteer.
 * Converts .mmd content to SVG, PNG, or JPEG buffers.
 */

const path = require('path');
const puppeteer = require('puppeteer');
const sharp = require('sharp');

const TEMPLATE_PATH = path.join(__dirname, 'render-template.html');

let browser = null;

/**
 * Get or launch the shared browser instance.
 */
async function getBrowser() {
    if (!browser || !browser.connected) {
        browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
        });
    }
    return browser;
}

/**
 * Render a Mermaid diagram string to SVG.
 * @param {string} mmdContent - Raw Mermaid diagram text
 * @param {object} options - { theme, background }
 * @returns {string} SVG string
 */
async function renderToSvg(mmdContent, options = {}) {
    const { theme = 'default', background = 'transparent' } = options;
    const b = await getBrowser();
    const page = await b.newPage();

    try {
        await page.goto(`file://${TEMPLATE_PATH}`, { waitUntil: 'networkidle0' });

        const svg = await page.evaluate(
            async (code, thm) => await window.renderMermaid(code, thm),
            mmdContent,
            theme
        );

        // Inject background if not transparent
        if (background !== 'transparent') {
            const bgRect = `<rect width="100%" height="100%" fill="${background}"/>`;
            return svg.replace(/(<svg[^>]*>)/, `$1${bgRect}`);
        }

        return svg;
    } finally {
        await page.close();
    }
}

/**
 * Render a Mermaid diagram to a raster buffer (PNG or JPEG).
 * @param {string} mmdContent - Raw Mermaid diagram text
 * @param {object} options - { format, theme, background, scale }
 * @returns {Buffer} Image buffer
 */
async function renderToRaster(mmdContent, options = {}) {
    const { format = 'png', theme = 'default', background = 'white', scale = 2 } = options;
    const b = await getBrowser();
    const page = await b.newPage();

    try {
        await page.goto(`file://${TEMPLATE_PATH}`, { waitUntil: 'networkidle0' });
        await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: scale });

        await page.evaluate(
            async (code, thm) => await window.renderMermaid(code, thm),
            mmdContent,
            theme
        );

        // Get the SVG element bounds
        const svgElement = await page.$('#container svg');
        if (!svgElement) throw new Error('SVG element not found after rendering');

        const screenshotOptions = {
            type: format === 'jpeg' ? 'jpeg' : 'png',
            omitBackground: background === 'transparent',
        };

        if (format === 'jpeg') {
            screenshotOptions.quality = 92;
        }

        const buffer = await svgElement.screenshot(screenshotOptions);
        return buffer;
    } finally {
        await page.close();
    }
}

/**
 * Generate a thumbnail from a full-size image buffer.
 * @param {Buffer} imageBuffer - Full-size PNG/JPEG buffer
 * @param {object} options - { width, format }
 * @returns {Buffer} Thumbnail buffer
 */
async function generateThumbnail(imageBuffer, options = {}) {
    const { width = 400, format = 'png' } = options;

    let pipeline = sharp(imageBuffer).resize({ width, withoutEnlargement: true });

    if (format === 'jpeg') {
        pipeline = pipeline.jpeg({ quality: 85 });
    } else {
        pipeline = pipeline.png();
    }

    return pipeline.toBuffer();
}

/**
 * Render a diagram to the requested format.
 * @param {string} mmdContent
 * @param {object} options - { format, theme, background, scale }
 * @returns {Buffer|string} SVG string or image Buffer
 */
async function render(mmdContent, options = {}) {
    const { format = 'svg' } = options;

    if (format === 'svg') {
        return renderToSvg(mmdContent, options);
    }
    return renderToRaster(mmdContent, options);
}

/**
 * Close the shared browser instance.
 */
async function closeBrowser() {
    if (browser && browser.connected) {
        await browser.close();
        browser = null;
    }
}

module.exports = {
    render,
    renderToSvg,
    renderToRaster,
    generateThumbnail,
    closeBrowser,
};
