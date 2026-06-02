/**
 * fan-menu.js
 * Bottom-left FAB that opens as a palette-style SVG arc fan.
 * Sectors radiate upward and rightward from the FAB corner.
 */

const SVG_NS   = 'http://www.w3.org/2000/svg';
const INNER_R  = 24;    // inner radius (px) – just outside FAB edge
const OUTER_R  = 76;    // outer radius (px)
const MID_R    = (INNER_R + OUTER_R) / 2;
const ICON_SZ  = 16;
const SVG_SIZE = OUTER_R + 16;   // 92 – must match .wb-fan-svg width/height in CSS
const GAP      = 0.022;           // angular gap between adjacent sectors (rad)

/**
 * Point on a circle, measured clockwise from "straight up":
 *   a=0   → (0,  -r)  = up
 *   a=π/2 → (r,   0)  = right
 *
 * Returns {x, y} in SVG user coords (y-down, but sectors live at y<0).
 */
function pt(a, r) {
    return {
        x: +(Math.sin(a) * r).toFixed(3),
        y: +(-Math.cos(a) * r).toFixed(3),
    };
}

/** SVG path for sector #idx out of #total, spanning a quarter-circle (90°). */
function sectorPath(idx, total) {
    const span  = (Math.PI / 2) / total;
    const sa    = idx * span + GAP;
    const ea    = (idx + 1) * span - GAP;
    const large = (ea - sa) > Math.PI ? 1 : 0;

    const i1 = pt(sa, INNER_R);
    const i2 = pt(ea, INNER_R);
    const o1 = pt(sa, OUTER_R);
    const o2 = pt(ea, OUTER_R);

    return [
        `M ${i1.x},${i1.y}`,
        `L ${o1.x},${o1.y}`,
        `A ${OUTER_R},${OUTER_R} 0 ${large} 1 ${o2.x},${o2.y}`,
        `L ${i2.x},${i2.y}`,
        `A ${INNER_R},${INNER_R} 0 ${large} 0 ${i1.x},${i1.y}`,
        'Z',
    ].join(' ');
}

/** Visual center of sector #idx for icon placement. */
function sectorMid(idx, total) {
    const span = (Math.PI / 2) / total;
    return pt((idx + 0.5) * span, MID_R);
}

function svgEl(tag, attrs = {}) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
}

export class FanMenu {
    constructor(opts = {}) {
        this._fab      = opts.fabEl;
        this._onSelect = opts.onSelect || (() => {});
        this._items    = [];
        this._isOpen   = false;
        this._activeId = null;
        this._sectorsGroup = null;
        this._svg      = null;
        this._overlay  = null;

        this._buildDOM();
        this._fab.addEventListener('click', () => this.toggle());
    }

    // ── Public ───────────────────────────────────────────────────────────────

    setItems(items) {
        this._items = items;
        if (this._isOpen) this._rebuildSectors();
    }

    setActive(id) {
        this._activeId = id;
        this._syncActive();
    }

    open() {
        if (this._isOpen) return;
        this._isOpen = true;
        this._rebuildSectors();
        this._fab.classList.add('is-open');
        this._overlay.classList.add('is-active');
        this._svg.classList.add('is-open');
    }

    close() {
        if (!this._isOpen) return;
        this._isOpen = false;
        this._fab.classList.remove('is-open');
        this._overlay.classList.remove('is-active');
        this._svg.classList.remove('is-open');
    }

    toggle() { this._isOpen ? this.close() : this.open(); }

    get isOpen() { return this._isOpen; }

    // ── Private ──────────────────────────────────────────────────────────────

    _buildDOM() {
        // Overlay (catches outside clicks)
        this._overlay = document.createElement('div');
        this._overlay.className = 'wb-fan-overlay';
        this._overlay.addEventListener('click', () => this.close());
        document.body.appendChild(this._overlay);

        // SVG: origin (0,0) = FAB center; viewBox goes up (-y) and right (+x)
        this._svg = svgEl('svg', {
            class:   'wb-fan-svg',
            viewBox: `0 ${-SVG_SIZE} ${SVG_SIZE} ${SVG_SIZE}`,
            xmlns:   SVG_NS,
        });

        // Insert BEFORE the FAB so the FAB stays on top at same z-index
        document.body.insertBefore(this._svg, this._fab);

        this._sectorsGroup = svgEl('g', { class: 'wb-fan-sectors' });
        this._svg.appendChild(this._sectorsGroup);
    }

    _rebuildSectors() {
        this._sectorsGroup.innerHTML = '';
        const n = this._items.length;
        if (n === 0) return;

        this._items.forEach((item, i) => {
            const isActive = item.id === this._activeId;
            const g = svgEl('g', {
                class:     'wb-fan-sector' + (isActive ? ' is-active' : ''),
                'data-id': item.id,
            });

            // Sector background path
            const path = svgEl('path', {
                class: 'wb-fan-sector-path',
                d:     sectorPath(i, n),
            });
            g.appendChild(path);

            // Tooltip title
            const title = svgEl('title');
            title.textContent = item.label || item.name || '';
            g.appendChild(title);

            // Icon
            const mp   = sectorMid(i, n);
            const icon = svgEl('use', {
                class:  'wb-fan-sector-icon',
                href:   `/assets/icons/sprite.svg#${item.icon || 'icon-note'}`,
                x:      String(mp.x - ICON_SZ / 2),
                y:      String(mp.y - ICON_SZ / 2),
                width:  String(ICON_SZ),
                height: String(ICON_SZ),
            });
            g.appendChild(icon);

            g.addEventListener('click', e => {
                e.stopPropagation();
                this.close();
                this._onSelect(item);
            });

            this._sectorsGroup.appendChild(g);
        });
    }

    _syncActive() {
        if (!this._sectorsGroup) return;
        this._sectorsGroup.querySelectorAll('.wb-fan-sector').forEach(g => {
            g.classList.toggle('is-active', g.dataset.id === this._activeId);
        });
    }
}

