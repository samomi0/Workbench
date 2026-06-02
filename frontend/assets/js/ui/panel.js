/**
 * panel.js  —  Floating, draggable panel system
 *
 * Usage:
 *   import { PanelManager } from '/assets/js/ui/panel.js';
 *   const panels = new PanelManager(document.getElementById('wb-canvas'));
 *   panels.open('my-id', { title, icon, url | content, width, height, x, y, onClose });
 */

// ── Module-level registry (singleton per page) ───────────────────────────────
const _panels = new Map();   // id -> Panel
let   _zTop   = 10;

const SVG_NS = 'http://www.w3.org/2000/svg';

function iconSvg(symbolId, size = 14, strokeWidth = '1.5') {
    const safe = symbolId.replace(/[^a-z0-9-]/gi, '');
    // Build inline SVG referencing external sprite
    const div = document.createElement('div');
    div.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round">
        <use href="/assets/icons/sprite.svg#${safe}"/></svg>`;
    return div.firstElementChild;
}

// ── Panel ─────────────────────────────────────────────────────────────────────

class Panel {
    /**
     * @param {string} id     Unique panel identifier.
     * @param {object} opts
     *   title, icon, url, content (Element), width, height, x, y
     *   onClose  callback fired after the panel is removed from DOM
     *   _cnt     container element (set by PanelManager)
     */
    constructor(id, opts) {
        this.id     = id;
        this._opts  = opts;
        this.el     = this._build(opts);
        _panels.set(id, this);
        (opts._cnt || document.body).appendChild(this.el);
        this._bindDrag();
        this._bindInteract();
        this.focus();
    }

    // ── Public ───────────────────────────────────────────────────────────────

    focus() {
        _zTop++;
        this.el.style.zIndex = _zTop;
        for (const [, p] of _panels) p.el.classList.remove('is-active');
        this.el.classList.add('is-active');
    }

    minimize() {
        this.el.classList.toggle('is-minimized');
    }

    close() {
        this._cleanupDrag?.();
        // Destroy system panel content if it exposes destroy()
        const content = this.el.querySelector('.wb-panel-body')?.firstElementChild;
        if (typeof content?.destroy === 'function') content.destroy();
        this.el.remove();
        _panels.delete(this.id);
        this._opts.onClose?.();
    }

    // ── Private ──────────────────────────────────────────────────────────────

    _build(opts) {
        const el = document.createElement('div');
        el.className = 'wb-panel';
        el.id = `panel-${this.id.replace(/[^a-z0-9]/gi, '-')}`;
        el.style.left   = Math.max(0, opts.x ?? 100) + 'px';
        el.style.top    = Math.max(0, opts.y ?? 80)  + 'px';
        el.style.width  = (opts.width  ?? 400) + 'px';
        el.style.height = (opts.height ?? 320) + 'px';

        // Header
        const head = document.createElement('div');
        head.className = 'wb-panel-head';

        const iconWrap = document.createElement('span');
        iconWrap.className = 'wb-panel-icon';
        iconWrap.appendChild(iconSvg(opts.icon || 'icon-note', 14));

        const titleEl = document.createElement('span');
        titleEl.className = 'wb-panel-title';
        titleEl.textContent = opts.title || '';

        const controls = document.createElement('div');
        controls.className = 'wb-panel-controls';

        const minBtn = document.createElement('button');
        minBtn.className = 'wb-panel-btn';
        minBtn.title = 'Minimize';
        minBtn.dataset.action = 'minimize';
        minBtn.appendChild(iconSvg('icon-minimize', 12, '2'));

        const closeBtn = document.createElement('button');
        closeBtn.className = 'wb-panel-btn is-danger';
        closeBtn.title = 'Close';
        closeBtn.dataset.action = 'close';
        closeBtn.appendChild(iconSvg('icon-close', 12, '2'));

        controls.append(minBtn, closeBtn);
        head.append(iconWrap, titleEl, controls);

        // Body
        const body = document.createElement('div');
        body.className = 'wb-panel-body';

        if (opts.url) {
            const iframe = document.createElement('iframe');
            iframe.src = opts.url;
            iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms');
            body.appendChild(iframe);
        } else if (opts.content instanceof Element) {
            // System panels: fill body absolutely
            opts.content.style.cssText = 'position:absolute;inset:0;overflow:hidden;';
            body.appendChild(opts.content);
        }

        el.append(head, body);
        return el;
    }

    _bindDrag() {
        const head = this.el.querySelector('.wb-panel-head');
        let live = false, ox, oy, ol, ot;

        const onDown = (e) => {
            if (e.target.closest('.wb-panel-btn')) return;
            live = true;
            ox = e.clientX;  oy = e.clientY;
            ol = parseFloat(this.el.style.left) || 0;
            ot = parseFloat(this.el.style.top)  || 0;
            this.focus();
            // Disable iframe pointer capture so drag works over iframes
            document.querySelectorAll('.wb-panel-body > iframe')
                    .forEach(f => { f.style.pointerEvents = 'none'; });
        };

        const onMove = (e) => {
            if (!live) return;
            const nx = Math.max(0, Math.min(ol + e.clientX - ox, window.innerWidth  - 80));
            const ny = Math.max(0, Math.min(ot + e.clientY - oy, window.innerHeight - 36));
            this.el.style.left = nx + 'px';
            this.el.style.top  = ny + 'px';
        };

        const onUp = () => {
            if (!live) return;
            live = false;
            document.querySelectorAll('.wb-panel-body > iframe')
                    .forEach(f => { f.style.pointerEvents = ''; });
        };

        head.addEventListener('mousedown', onDown);
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup',   onUp);

        this._cleanupDrag = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup',   onUp);
        };
    }

    _bindInteract() {
        // Focus on any click inside the panel
        this.el.addEventListener('mousedown', () => this.focus());

        // Control buttons
        this.el.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-action]');
            if (!btn) return;
            if (btn.dataset.action === 'minimize') this.minimize();
            if (btn.dataset.action === 'close')    this.close();
        });
    }
}

// ── PanelManager ──────────────────────────────────────────────────────────────

class PanelManager {
    /**
     * @param {HTMLElement} container  The canvas element panels are appended to.
     */
    constructor(container) {
        this._cnt = container;
    }

    /** Open (or focus if already open) a panel with the given id. */
    open(id, opts = {}) {
        if (_panels.has(id)) {
            _panels.get(id).focus();
            return _panels.get(id);
        }
        return new Panel(id, { ...opts, _cnt: this._cnt });
    }

    close(id)  { _panels.get(id)?.close(); }
    has(id)    { return _panels.has(id); }
    get(id)    { return _panels.get(id) ?? null; }
    count()    { return _panels.size; }
}

export { PanelManager };
