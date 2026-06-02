/**
 * color-wheel.js
 * Continuous HSL colour wheel picker — press & hold a trigger button, then drag
 * to pick any colour from a true colour wheel (hue × saturation).
 *
 * Interaction mirrors the middle-click radial menu.
 *
 * Usage:
 *   import { ColorWheel } from '/assets/js/ui/color-wheel.js';
 *   const wheel = new ColorWheel({
 *       onPick: (hex) => { ... },        // called when user releases on a colour
 *       onPreview: (hex) => { ... },     // optional live preview while dragging
 *   });
 *   // Attach to a trigger button:
 *   triggerBtn.addEventListener('mousedown', e => wheel.open(e, triggerBtn));
 */

// ── Morandi palette (muted, dusty tones) — kept for backward compatibility ──
export const MORANDI_COLORS = [
    '#d4c9b5', // warm beige
    '#b5c4b1', // sage green
    '#a8b5c8', // dusty blue
    '#c4c0d0', // lavender grey
    '#d4b896', // dusty orange
    '#d9cdb3', // pale ochre
    '#d4a5a5', // dusty rose
    '#c4c9b6', // olive green
    '#b0bec5', // grey blue
];

/** Pick a random colour from the Morandi palette. */
export function randomMorandi() {
    return MORANDI_COLORS[Math.floor(Math.random() * MORANDI_COLORS.length)];
}

// ── Morandi palette for link buttons (bg / border / text) ─────────────────────
export const MORANDI_LINK_PALETTE = [
    { bg: 'rgba(212,201,181,0.45)', border: 'rgba(180,165,140,0.35)', text: '#6b5b4a' }, // beige
    { bg: 'rgba(181,196,177,0.45)', border: 'rgba(140,160,135,0.35)', text: '#4a5b4a' }, // sage
    { bg: 'rgba(168,181,200,0.45)', border: 'rgba(125,140,160,0.35)', text: '#3a4a5a' }, // blue
    { bg: 'rgba(196,192,208,0.45)', border: 'rgba(155,150,170,0.35)', text: '#4a3a5a' }, // lavender
    { bg: 'rgba(212,184,150,0.45)', border: 'rgba(175,145,110,0.35)', text: '#6b4a3a' }, // ochre
    { bg: 'rgba(217,205,179,0.45)', border: 'rgba(180,165,135,0.35)', text: '#5b4a3a' }, // wheat
    { bg: 'rgba(212,165,165,0.45)', border: 'rgba(175,125,125,0.35)', text: '#6b3a4a' }, // rose
    { bg: 'rgba(196,201,182,0.45)', border: 'rgba(155,165,140,0.35)', text: '#4a5b3a' }, // olive
    { bg: 'rgba(176,190,197,0.45)', border: 'rgba(135,150,160,0.35)', text: '#3a4a5a' }, // slate
];

// ── Geometry & colour range constants ───────────────────────────────────────
const DISK_R      = 74;     // colour disk radius (px, at 1× display size)
const PADDING     = 12;     // padding around the disk
const SCALE       = 2;      // render at 2× for richer colour detail
const CANVAS_R    = (DISK_R + PADDING) * SCALE;  // canvas half-size in pixels
const CANVAS_DIM  = CANVAS_R * 2;
const DISPLAY_DIM = (DISK_R + PADDING) * 2;      // CSS display size

const CENTER_DOT_R = 4 * SCALE;  // tiny neutral dot at centre (px)

const LIGHTNESS = 0.55;   // balanced lightness for the HSL disk

// ── HSL ↔ RGB helpers ───────────────────────────────────────────────────────

/** Convert HSL (h:0-360, s:0-1, l:0-1) to RGB hex string. */
function hslToHex(h, s, l) {
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = l - c / 2;
    let r, g, b;
    if      (h < 60)  { r = c; g = x; b = 0; }
    else if (h < 120) { r = x; g = c; b = 0; }
    else if (h < 180) { r = 0; g = c; b = x; }
    else if (h < 240) { r = 0; g = x; b = c; }
    else if (h < 300) { r = x; g = 0; b = c; }
    else              { r = c; g = 0; b = x; }
    const toHex = v => Math.round((v + m) * 255).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** Convert RGB hex to HSL {h, s, l}. */
function hexToHsl(hex) {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) return { h: 0, s: 0, l };
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h;
    switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) * 60; break;
        case g: h = ((b - r) / d + 2) * 60; break;
        case b: h = ((r - g) / d + 4) * 60; break;
    }
    return { h, s, l };
}

// ── ColorWheel class ────────────────────────────────────────────────────────

export class ColorWheel {
    /**
     * @param {object} opts
     * @param {Function}  opts.onPick      Called with (hex) on mouseup
     * @param {Function} [opts.onPreview]  Called with (hex) while dragging
     * @param {Function} [opts.onOpen]     Called when wheel opens
     * @param {Function} [opts.onClose]    Called when wheel closes
     */
    constructor(opts = {}) {
        this._onPick    = opts.onPick    || (() => {});
        this._onPreview = opts.onPreview || null;
        this._onOpen    = opts.onOpen    || null;
        this._onClose   = opts.onClose   || null;

        this._isOpen     = false;
        this._hoveredHex = null;

        this._container = null;
        this._overlay   = null;
        this._canvas    = null;

        this._buildDOM();
        this._renderWheel();
    }

    /** Open the colour wheel at the trigger element's position. */
    open(event, triggerEl) {
        if (this._isOpen) this._forceClose();

        const rect = triggerEl.getBoundingClientRect();
        const cx   = rect.left + rect.width  / 2;
        const cy   = rect.top  + rect.height / 2;

        this._container.style.left = cx + 'px';
        this._container.style.top  = cy + 'px';

        this._overlay.classList.add('is-active');
        this._container.classList.remove('is-closing');
        void this._container.offsetWidth;
        this._container.classList.add('is-open');
        this._isOpen     = true;
        this._hoveredHex = null;

        if (event) {
            this._updateHover(event.clientX, event.clientY);
        }

        if (this._onOpen) this._onOpen();
    }

    /** Update hover state as mouse moves. */
    updateDrag(clientX, clientY) {
        if (!this._isOpen) return;
        this._updateHover(clientX, clientY);
    }

    /** Close and commit the currently hovered colour. */
    close() {
        if (!this._isOpen) return;
        const hex = this._hoveredHex;
        this._forceClose();
        if (hex) this._onPick(hex);
        if (this._onClose) this._onClose();
    }

    /** Close without selecting. */
    cancel() {
        if (!this._isOpen) return;
        this._forceClose();
        if (this._onClose) this._onClose();
    }

    get isOpen() { return this._isOpen; }

    // ── Private ─────────────────────────────────────────────────────────────

    _buildDOM() {
        this._overlay = document.createElement('div');
        this._overlay.className = 'wb-cw-overlay';
        document.body.appendChild(this._overlay);

        this._container = document.createElement('div');
        this._container.className = 'wb-cw-container';

        this._canvas = document.createElement('canvas');
        this._canvas.className = 'wb-cw-canvas';
        this._canvas.width  = CANVAS_DIM;
        this._canvas.height = CANVAS_DIM;
        this._canvas.style.width  = DISPLAY_DIM + 'px';
        this._canvas.style.height = DISPLAY_DIM + 'px';

        this._container.appendChild(this._canvas);
        document.body.appendChild(this._container);
    }

    /** Render the full HSL colour disk onto the canvas (2× resolution). */
    _renderWheel() {
        const ctx = this._canvas.getContext('2d');
        const cx  = CANVAS_R;
        const cy  = CANVAS_R;
        const diskPx = DISK_R * SCALE;
        const imageData = ctx.createImageData(CANVAS_DIM, CANVAS_DIM);
        const data = imageData.data;

        for (let py = 0; py < CANVAS_DIM; py++) {
            for (let px = 0; px < CANVAS_DIM; px++) {
                const dx = px - cx;
                const dy = py - cy;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const idx = (py * CANVAS_DIM + px) * 4;

                if (dist <= diskPx) {
                    // Full disk: hue = angle, saturation = distance from centre
                    let angle = Math.atan2(dy, dx);
                    angle = ((angle / (Math.PI * 2)) + 1) % 1;
                    const hue = angle * 360;
                    const sat = dist / diskPx;   // 0 at centre → 1 at edge
                    const hex = hslToHex(hue, sat, LIGHTNESS);
                    const r = parseInt(hex.slice(1, 3), 16);
                    const g = parseInt(hex.slice(3, 5), 16);
                    const b = parseInt(hex.slice(5, 7), 16);
                    data[idx] = r; data[idx+1] = g; data[idx+2] = b; data[idx+3] = 255;
                }
                // else: outside disk — transparent
            }
        }

        ctx.putImageData(imageData, 0, 0);

        // Tiny centre dot — visual anchor for neutral
        ctx.beginPath();
        ctx.arc(cx, cy, CENTER_DOT_R, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.08)';
        ctx.lineWidth = 1;
        ctx.stroke();
    }

    _getColourAt(clientX, clientY) {
        const cr = this._container.getBoundingClientRect();
        // Container CSS size is DISPLAY_DIM; map mouse coords to disk space
        const scale = DISK_R / (DISPLAY_DIM / 2);  // px-per-CSS-px in disk coords
        const cxPx = cr.left + cr.width  / 2;
        const cyPx = cr.top  + cr.height / 2;
        const dx = (clientX - cxPx) * scale;
        const dy = (clientY - cyPx) * scale;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > DISK_R) return null;

        let angle = Math.atan2(dy, dx);
        angle = ((angle / (Math.PI * 2)) + 1) % 1;
        const hue = angle * 360;
        const sat = dist / DISK_R;   // 0 at centre → 1 at edge
        return hslToHex(hue, sat, LIGHTNESS);
    }

    _updateHover(clientX, clientY) {
        const hex = this._getColourAt(clientX, clientY);

        if (hex !== this._hoveredHex) {
            this._hoveredHex = hex;
            const effectiveHex = hex || this._hoveredHex;
            if (this._onPreview && effectiveHex) {
                this._onPreview(effectiveHex);
            }
        }
    }

    _forceClose() {
        this._isOpen = false;
        this._hoveredHex = null;

        this._container.classList.add('is-closing');
        this._container.classList.remove('is-open');
        this._overlay.classList.remove('is-active');

        this._container.addEventListener('transitionend', () => {
            this._container.classList.remove('is-closing');
        }, { once: true });
    }
}
