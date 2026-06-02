/**
 * radial-menu.js
 * Pie/wheel context menu triggered by right-click on the canvas.
 *
 * Usage:
 *   import { RadialMenu } from '/assets/js/ui/radial-menu.js';
 *   const menu = new RadialMenu({ canvas: document.getElementById('wb-canvas') });
 *   menu.setItems([{ id, icon, label, action }]);
 */

// ── Geometry constants ────────────────────────────────────────────────────────
const INNER_R   = 34;                         // inner radius (px in SVG coords)
const OUTER_R   = 88;                         // outer radius
const MID_R     = (INNER_R + OUTER_R) / 2;   // 61 – icon anchor radius
const ICON_SIZE = 18;                         // icon render size (px)
const LABEL_OFFSET = ICON_SIZE / 2 + 7;      // label y-offset below icon center
const GAP       = 0;                           // angular gap between sectors (0 = seamless)
const SVG_HALF  = OUTER_R + 22;              // half-side of the SVG viewport (110)
const SVG_DIM   = SVG_HALF * 2;             // SVG width/height (220)

const SVG_NS = 'http://www.w3.org/2000/svg';

// Known valid icon IDs – used to fall back to icon-app for unknown / missing icons
const VALID_ICON_IDS = new Set([
    'icon-note', 'icon-tag', 'icon-archive', 'icon-close', 'icon-minimize',
    'icon-expand', 'icon-plus', 'icon-trash', 'icon-check', 'icon-grip',
    'icon-todo', 'icon-ticket', 'icon-hash', 'icon-search', 'icon-link',
    'icon-download', 'icon-app',
]);

/** Return a safe icon id — falls back to 'icon-app' if unknown. */
function safeIcon(id) {
    return VALID_ICON_IDS.has(id) ? id : 'icon-app';
}

// ── Pure geometry helpers ─────────────────────────────────────────────────────

/** Convert polar coords to {x, y}, rounded to 3 decimals. */
function polar(angle, radius) {
    return {
        x: +(Math.cos(angle) * radius).toFixed(3),
        y: +(Math.sin(angle) * radius).toFixed(3),
    };
}

/**
 * Build the SVG path `d` attribute for sector #idx out of `total` sectors.
 * Sectors start at the top (12 o'clock) and proceed clockwise.
 */
function sectorPath(idx, total) {
    const step  = (Math.PI * 2) / total;
    const start = idx * step - Math.PI / 2;
    const end   = start + step;
    const sa    = start + GAP;
    const ea    = end   - GAP;
    const large = (step - GAP * 2) > Math.PI ? 1 : 0;

    const i1 = polar(sa, INNER_R);
    const i2 = polar(ea, INNER_R);
    const o1 = polar(sa, OUTER_R);
    const o2 = polar(ea, OUTER_R);

    return [
        `M ${i1.x} ${i1.y}`,
        `L ${o1.x} ${o1.y}`,
        `A ${OUTER_R} ${OUTER_R} 0 ${large} 1 ${o2.x} ${o2.y}`,
        `L ${i2.x} ${i2.y}`,
        `A ${INNER_R} ${INNER_R} 0 ${large} 0 ${i1.x} ${i1.y}`,
        'Z',
    ].join(' ');
}

/** Return the {x, y} center point of sector #idx (for icon/label placement). */
function sectorMidpoint(idx, total) {
    const step     = (Math.PI * 2) / total;
    const midAngle = idx * step + step / 2 - Math.PI / 2;
    return polar(midAngle, MID_R);
}

// ── SVG element factory ───────────────────────────────────────────────────────

function svgEl(tag, attrs = {}) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
}

// ── RadialMenu ────────────────────────────────────────────────────────────────

class RadialMenu {
    /**
     * @param {object}      opts
     * @param {HTMLElement} opts.canvas  Element to intercept right-click on.
     * @param {Function}    [opts.onClose]  Called whenever the menu closes.
     * @param {Function}    [opts.onAltOpen]  Called on Alt+middle-click (x, y) → should open with page-switch items.
     */
    constructor(opts = {}) {
        this._canvas    = opts.canvas || document.body;
        this._onClose   = opts.onClose || null;        // called whenever menu closes
        this._onAltOpen = opts.onAltOpen || null;       // called on Alt+middle-click
        this._items     = [];
        this._isOpen    = false;
        this._overlay   = null;
        this._container = null;

        // Drag-mode state (active while middle button is held)
        this._holdOrigin  = null;   // {x, y} where mousedown happened
        this._lastOpenPos = null;   // preserved after close, for action callbacks
        this._dragMode    = false;  // true while middle button is held
        this._altMode     = false;  // true when opened via Alt+middle-click
        this._sectorEls   = [];     // references to sector <g> elements
        this._hoveredIdx  = -1;     // currently drag-highlighted sector index

        this._buildDOM();
        this._bindGlobal();
        this._bindCanvas();
    }

    // ── Public ──────────────────────────────────────────────────────────────

    /** Replace the item list used when the next right-click fires. */
    setItems(items) {
        this._items = items;
    }

    /**
     * External mouse event injection – used by page iframes that relay
     * their mouse events to the parent via postMessage.
     */
    /** Return the viewport position where the menu was last opened (survives close). */
    get openPos() { return this._lastOpenPos ? { ...this._lastOpenPos } : null; }

    /** Called by app.js when an iframe relays a middle-mousedown. */
    handleMousedown(x, y, altKey) {
        if (this._items.length === 0 && !this._onAltOpen) return;
        this._holdOrigin  = { x, y };
        this._lastOpenPos = { x, y };
        this._dragMode    = true;

        if (altKey && this._onAltOpen) {
            this._altMode = true;
            this._onAltOpen(x, y);
        } else if (this._items.length > 0) {
            this._altMode = false;
            this.open(x, y, this._items);
        }
    }

    /** Called by app.js when an iframe relays a middle-mouseup. */
    handleMouseup(x, y) {
        if (!this._dragMode || !this._isOpen) {
            this._holdOrigin = null;
            this._dragMode   = false;
            this._altMode    = false;
            return;
        }
        const idx = this._hoveredIdx;
        this.close();
        this._dragMode   = false;
        this._hoveredIdx = -1;
        this._holdOrigin = null;
        this._altMode    = false;
        if (idx >= 0 && idx < this._items.length) {
            const action = this._items[idx].action;
            if (typeof action === 'function') setTimeout(action, 90);
        }
    }

    handleMousemove(x, y) {
        if (!this._dragMode || !this._isOpen) return;
        const cx = parseFloat(this._container.style.left);
        const cy = parseFloat(this._container.style.top);
        const idx = this._sectorIdxFromPoint(cx, cy, x, y);
        if (idx !== this._hoveredIdx) {
            this._hoveredIdx = idx;
            this._highlightSector(idx);
        }
    }

    /**
     * Open the menu at viewport coordinates (x, y) with the given items.
     * Replaces any currently-open menu instantly before opening.
     */
    open(x, y, items) {
        if (this._isOpen) this._forceClose();

        this._items = items;
        this._position(x, y);
        this._rebuild();

        this._overlay.classList.add('is-active');
        this._container.classList.remove('is-closing');

        // Trigger transition on the next paint
        void this._container.offsetWidth;
        this._container.classList.add('is-open');
        this._isOpen = true;
    }

    /** Close with an exit animation. */
    close() {
        if (!this._isOpen) return;
        this._isOpen = false;
        if (this._onClose) this._onClose();

        this._container.classList.add('is-closing');
        this._container.classList.remove('is-open');
        this._overlay.classList.remove('is-active');

        this._container.addEventListener('transitionend', () => {
            this._container.classList.remove('is-closing');
        }, { once: true });
    }

    get isOpen() { return this._isOpen; }

    // ── Private ─────────────────────────────────────────────────────────────

    /** Build the two persistent DOM nodes (overlay + container). */
    _buildDOM() {
        this._overlay = document.createElement('div');
        this._overlay.className = 'wb-radial-overlay';
        this._overlay.addEventListener('mousedown', () => this.close());
        document.body.appendChild(this._overlay);

        this._container = document.createElement('div');
        this._container.className = 'wb-radial-container';
        document.body.appendChild(this._container);
    }

    /** Global keyboard handler. */
    _bindGlobal() {
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this._isOpen) this.close();
        });
    }

    /** Bind middle-click on the canvas:
     *  • Alt+Middle-click → page-switching radial menu (via onAltOpen callback)
     *  • Middle-click alone → context radial menu (current items)
     *  • Drag → highlight sector under cursor
     *  • Mouseup → activate highlighted sector and close
     */
    _bindCanvas() {
        this._canvas.addEventListener('mousedown', (e) => {
            if (e.button !== 1) return;
            e.preventDefault(); // stop browser auto-scroll cursor
            if (e.target.closest('.wb-panel')) return;

            this._holdOrigin  = { x: e.clientX, y: e.clientY };
            this._lastOpenPos = { x: e.clientX, y: e.clientY };
            this._dragMode    = true;

            if (e.altKey && this._onAltOpen) {
                // Alt+middle-click → page switching
                this._altMode = true;
                this._onAltOpen(e.clientX, e.clientY);
            } else if (this._items.length > 0) {
                // Plain middle-click → context menu
                this._altMode = false;
                this.open(e.clientX, e.clientY, this._items);
            }
        });

        // Capture mouseup globally so it fires even if cursor drifted
        document.addEventListener('mouseup', (e) => {
            if (e.button !== 1) return;
            if (!this._dragMode || !this._isOpen) {
                this._holdOrigin = null;
                this._dragMode   = false;
                this._altMode    = false;
                return;
            }
            const idx = this._hoveredIdx;
            this.close();
            this._dragMode   = false;
            this._hoveredIdx = -1;
            this._holdOrigin = null;
            this._altMode    = false;
            if (idx >= 0 && idx < this._items.length) {
                const action = this._items[idx].action;
                if (typeof action === 'function') setTimeout(action, 90);
            }
        });

        // Highlight sector under cursor during drag
        document.addEventListener('mousemove', (e) => {
            if (!this._dragMode || !this._isOpen) return;
            const cx = parseFloat(this._container.style.left);
            const cy = parseFloat(this._container.style.top);
            const idx = this._sectorIdxFromPoint(cx, cy, e.clientX, e.clientY);
            if (idx !== this._hoveredIdx) {
                this._hoveredIdx = idx;
                this._highlightSector(idx);
            }
        });
    }

    /** Close immediately, no transition. Used when re-opening at a new spot. */
    _forceClose() {
        const wasOpen = this._isOpen;
        this._dragMode   = false;
        this._altMode    = false;
        this._hoveredIdx = -1;
        this._isOpen = false;
        this._container.classList.remove('is-open', 'is-closing');
        this._overlay.classList.remove('is-active');
        if (wasOpen && this._onClose) this._onClose();
    }

    /** Clamp position so the menu stays fully within the viewport. */
    _position(x, y) {
        const pad = SVG_HALF + 4;
        const ax  = Math.max(pad, Math.min(x, window.innerWidth  - pad));
        const ay  = Math.max(pad, Math.min(y, window.innerHeight - pad));
        this._container.style.left = ax + 'px';
        this._container.style.top  = ay + 'px';
    }

    /** Rebuild SVG from current items. */
    _rebuild() {
        this._sectorEls = [];
        this._hoveredIdx = -1;
        this._container.innerHTML = '';
        this._container.appendChild(this._makeSVG());
    }

    /** Create the full SVG element. */
    _makeSVG() {
        const svg = svgEl('svg', {
            class:   'wb-radial-svg',
            viewBox: `${-SVG_HALF} ${-SVG_HALF} ${SVG_DIM} ${SVG_DIM}`,
            width:   SVG_DIM,
            height:  SVG_DIM,
            xmlns:   SVG_NS,
        });

        // Sectors (rendered first, below center circle)
        const n = this._items.length;
        this._items.forEach((item, i) => svg.appendChild(this._makeSector(i, n, item)));

        // Center circle (on top of sector inner edges)
        svg.appendChild(svgEl('circle', {
            class: 'wb-radial-center',
            r:     INNER_R - 1,
        }));

        // Decorative crosshair inside center circle
        svg.appendChild(this._makeCenterMark());

        return svg;
    }

    /** Create one sector: background path + icon + label. */
    _makeSector(idx, total, item) {
        const g = svgEl('g', { class: 'wb-radial-sector' });

        // Background path
        const path = svgEl('path', {
            class: 'wb-radial-sector-path',
            d:     sectorPath(idx, total),
        });
        g.appendChild(path);

        // Icon via external SVG sprite (with fallback to icon-app)
        const mp = sectorMidpoint(idx, total);
        const iconEl = svgEl('use', {
            class:  'wb-radial-sector-icon',
            href:   `/assets/icons/sprite.svg#${safeIcon(item.icon)}`,
            x:      mp.x - ICON_SIZE / 2,
            y:      mp.y - ICON_SIZE / 2 - 3, // shift slightly toward center for label room
            width:  ICON_SIZE,
            height: ICON_SIZE,
        });
        g.appendChild(iconEl);

        // Label (shown only on hover via CSS opacity)
        const raw   = (item.label || item.name || '');
        const label = raw.length > 11 ? raw.slice(0, 10) + '.' : raw;
        const lbl   = svgEl('text', {
            class:        'wb-radial-sector-label',
            x:            mp.x,
            y:            mp.y + LABEL_OFFSET,
            'text-anchor': 'middle',
        });
        lbl.textContent = label;
        g.appendChild(lbl);

        // Interaction (used in quick-click mode)
        g.addEventListener('mouseenter', () => {
            if (!this._dragMode) g.classList.add('is-hover');
        });
        g.addEventListener('mouseleave', () => {
            if (!this._dragMode) g.classList.remove('is-hover');
        });
        g.addEventListener('click', (e) => {
            if (this._dragMode) return; // drag-mode uses mouseup on document
            e.stopPropagation();
            this.close();
            if (typeof item.action === 'function') {
                setTimeout(item.action, 90);
            }
        });

        // Track element for drag-highlight
        this._sectorEls[idx] = g;

        return g;
    }

    /**
     * Highlight a specific sector by index (for drag-mode).
     * Pass -1 to clear all highlights.
     */
    _highlightSector(idx) {
        this._sectorEls.forEach((el, i) => {
            el.classList.toggle('is-hover', i === idx);
        });
    }

    /**
     * Determine which sector index the mouse is pointing at, based on the
     * angle from the menu center (cx, cy) to the cursor (mx, my).
     * Returns -1 if the cursor is inside the dead-zone (inner radius).
     */
    _sectorIdxFromPoint(cx, cy, mx, my) {
        const dx = mx - cx;
        const dy = my - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < INNER_R) return -1; // inside center dead-zone

        const n = this._items.length;
        if (n === 0) return -1;

        // atan2 gives angle from positive x-axis; sectors start from 12 o'clock
        let angle = Math.atan2(dy, dx) + Math.PI / 2; // rotate so 0 = top
        if (angle < 0) angle += Math.PI * 2;           // normalize to [0, 2π]

        return Math.floor(angle / (Math.PI * 2 / n)) % n;
    }

    /** Small crosshair drawn inside the center circle. */
    _makeCenterMark() {
        const g = svgEl('g', { class: 'wb-radial-center-mark' });
        const R = 9;
        const gap = 3;
        const lines = [
            [0, -R, 0, -gap], [0, gap, 0, R],
            [-R, 0, -gap, 0], [gap, 0, R, 0],
        ];
        for (const [x1, y1, x2, y2] of lines) {
            g.appendChild(svgEl('line', {
                x1, y1, x2, y2,
                stroke:              'currentColor',
                'stroke-width':      '1.5',
                'stroke-linecap':    'round',
            }));
        }
        return g;
    }
}

export { RadialMenu };
