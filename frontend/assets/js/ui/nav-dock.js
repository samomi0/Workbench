/**
 * nav-dock.js
 * Draggable search pill in bottom-left corner.
 * Click to open a popup listing available pages with search filter.
 * Popup direction adapts to avoid going off-screen.
 *
 * Usage:
 *   import { NavDock } from '/assets/js/ui/nav-dock.js';
 *   const dock = new NavDock({ onSelect: (item) => switchPage(item) });
 *   dock.setItems([{ id, icon, name, label, ... }]);
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

// ── SVG helpers ───────────────────────────────────────────────────────────────

function makeSearchIcon(cls = '') {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.5');
    svg.setAttribute('stroke-linecap', 'round');
    if (cls) svg.setAttribute('class', cls);

    const circle = document.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('cx', '11');
    circle.setAttribute('cy', '11');
    circle.setAttribute('r', '8');
    svg.appendChild(circle);

    const line = document.createElementNS(SVG_NS, 'line');
    line.setAttribute('x1', '21');
    line.setAttribute('y1', '21');
    line.setAttribute('x2', '16.65');
    line.setAttribute('y2', '16.65');
    svg.appendChild(line);

    return svg;
}

// Known valid icon IDs – fallback to icon-app
const VALID_ICON_IDS = new Set([
    'icon-note', 'icon-tag', 'icon-archive', 'icon-close', 'icon-minimize',
    'icon-expand', 'icon-plus', 'icon-trash', 'icon-check', 'icon-grip',
    'icon-todo', 'icon-ticket', 'icon-hash', 'icon-search', 'icon-link',
    'icon-download', 'icon-app',
]);

function safeIcon(id) {
    return VALID_ICON_IDS.has(id) ? id : 'icon-app';
}

// ── NavDock ───────────────────────────────────────────────────────────────────

export class NavDock {
    /**
     * @param {object}   opts
     * @param {Function} opts.onSelect  Called with the selected item.
     */
    constructor(opts = {}) {
        this._onSelect = opts.onSelect || (() => {});
        this._items    = [];
        this._isOpen   = false;
        this._activeId = null;

        // Drag state
        this._dragging   = false;
        this._dragStartX = 0;
        this._dragStartY = 0;
        this._dockStartX = 0;
        this._dockStartY = 0;
        this._didDrag    = false;

        this._buildDOM();
        this._bindEvents();
    }

    // ── Public ──────────────────────────────────────────────────────────────

    setItems(items) {
        this._items = items;
        if (this._isOpen) this._renderList();
    }

    /** Highlight the currently active page in the list. */
    setActive(id) {
        this._activeId = id;
        this._updateActive();
    }

    /** Close popup if open. */
    close() {
        if (!this._isOpen) return;
        this._isOpen = false;
        this._trigger.classList.remove('is-open');
        this._popup.classList.remove('is-open');
        this._searchInput.value = '';
        document.removeEventListener('mousedown', this._onDocMouseDown);
    }

    get isOpen() { return this._isOpen; }

    // ── Private: DOM ────────────────────────────────────────────────────────

    _buildDOM() {
        // ── Trigger pill ──
        this._trigger = document.createElement('div');
        this._trigger.className = 'wb-nav-dock';
        this._trigger.title = '搜索页面 (点击展开)';

        const icon = makeSearchIcon('wb-nav-dock-icon');
        this._trigger.appendChild(icon);

        this._labelEl = document.createElement('span');
        this._labelEl.className = 'wb-nav-dock-label';
        this._labelEl.textContent = '搜索页面';
        this._trigger.appendChild(this._labelEl);

        document.body.appendChild(this._trigger);

        // ── Popup panel ──
        this._popup = document.createElement('div');
        this._popup.className = 'wb-nav-popup';

        // Search row
        const searchWrap = document.createElement('div');
        searchWrap.className = 'wb-nav-search-wrap';

        const searchIcon = makeSearchIcon('wb-nav-search-icon');
        searchWrap.appendChild(searchIcon);

        this._searchInput = document.createElement('input');
        this._searchInput.className = 'wb-nav-search-input';
        this._searchInput.type = 'text';
        this._searchInput.placeholder = '搜索页面…';
        this._searchInput.autocomplete = 'off';
        this._searchInput.addEventListener('input', () => this._filter());
        this._searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') { this.close(); this._trigger.focus(); }
        });
        searchWrap.appendChild(this._searchInput);

        this._popup.appendChild(searchWrap);

        // List container
        this._listEl = document.createElement('div');
        this._listEl.className = 'wb-nav-list';
        this._popup.appendChild(this._listEl);

        document.body.appendChild(this._popup);
    }

    // ── Private: Events ─────────────────────────────────────────────────────

    _bindEvents() {
        // Mousedown on trigger: start drag or toggle
        this._trigger.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            this._dragging   = true;
            this._didDrag    = false;
            this._dragStartX = e.clientX;
            this._dragStartY = e.clientY;

            const style = getComputedStyle(this._trigger);
            this._dockStartX = parseInt(style.left) || 16;
            this._dockStartY = parseInt(style.bottom) || 16;
        });

        // Global mousemove for drag
        document.addEventListener('mousemove', (e) => {
            if (!this._dragging) return;
            const dx = e.clientX - this._dragStartX;
            const dy = e.clientY - this._dragStartY;
            if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
                this._didDrag = true;
            }
            if (!this._didDrag) return;

            const newLeft = Math.max(0, Math.min(this._dockStartX + dx, window.innerWidth - 60));
            const newBottom = Math.max(0, Math.min(this._dockStartY - dy, window.innerHeight - 40));
            this._trigger.style.left = newLeft + 'px';
            this._trigger.style.bottom = newBottom + 'px';
        });

        // Global mouseup: end drag or toggle popup
        document.addEventListener('mouseup', (e) => {
            if (!this._dragging) return;
            this._dragging = false;
            if (!this._didDrag) {
                // Was a click, toggle popup
                this.toggle();
            }
        });

        // Click on popup item
        this._popup.addEventListener('mousedown', (e) => {
            const itemEl = e.target.closest('.wb-nav-item');
            if (itemEl) {
                e.preventDefault();
                const id = itemEl.dataset.id;
                const item = this._items.find(it => it.id === id || (it._home && id === '_home'));
                if (item) {
                    this.close();
                    this._onSelect(item);
                }
            }
        });
    }

    // ── Private: Popup ──────────────────────────────────────────────────────

    toggle() {
        if (this._isOpen) {
            this.close();
        } else {
            this.open();
        }
    }

    open() {
        if (this._isOpen) return;
        this._isOpen = true;
        this._trigger.classList.add('is-open');
        this._searchInput.value = '';
        this._renderList();
        this._positionPopup();
        this._popup.classList.add('is-open');

        // Focus search input
        setTimeout(() => this._searchInput.focus(), 100);

        // Close on outside click (deferred to let current event finish)
        setTimeout(() => {
            document.addEventListener('mousedown', this._onDocMouseDown = (e) => {
                if (!this._isOpen) return;
                if (this._trigger.contains(e.target)) return;
                if (this._popup.contains(e.target)) return;
                this.close();
            });
        }, 0);
    }

    /** Position popup relative to the dock, preferring upward direction. */
    _positionPopup() {
        const dockRect = this._trigger.getBoundingClientRect();
        const popupW = 220;
        const popupH = Math.min(340, this._popup.scrollHeight || 200);

        // Default: open above the dock
        let top  = dockRect.top - popupH - 8;
        let left = dockRect.left;

        // If not enough space above, try below
        if (top < 8) {
            top = dockRect.bottom + 8;
        }

        // Clamp horizontally
        if (left + popupW > window.innerWidth - 8) {
            left = window.innerWidth - popupW - 8;
        }
        if (left < 8) left = 8;

        this._popup.style.top  = top + 'px';
        this._popup.style.left = left + 'px';
    }

    _renderList() {
        const q = (this._searchInput.value || '').toLowerCase();
        const filtered = q
            ? this._items.filter(it =>
                (it.name || it.label || '').toLowerCase().includes(q) ||
                (it.id || '').toLowerCase().includes(q))
            : this._items;

        this._listEl.innerHTML = '';

        if (filtered.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'wb-nav-empty';
            empty.textContent = q ? '无匹配页面' : '暂无可用页面';
            this._listEl.appendChild(empty);
            return;
        }

        filtered.forEach(item => {
            const row = document.createElement('div');
            row.className = 'wb-nav-item';
            row.dataset.id = item._home ? '_home' : item.id;

            if ((item._home ? '_home' : item.id) === this._activeId) {
                row.classList.add('is-active');
            }

            // Icon
            const iconUse = document.createElementNS(SVG_NS, 'use');
            iconUse.setAttribute('class', 'wb-nav-item-icon');
            iconUse.setAttribute('href', `/assets/icons/sprite.svg#${safeIcon(item.icon || 'icon-app')}`);
            const iconSvg = document.createElementNS(SVG_NS, 'svg');
            iconSvg.setAttribute('viewBox', '0 0 24 24');
            iconSvg.setAttribute('width', '14');
            iconSvg.setAttribute('height', '14');
            iconSvg.appendChild(iconUse);
            row.appendChild(iconSvg);

            // Name
            const nameEl = document.createElement('span');
            nameEl.className = 'wb-nav-item-name';
            nameEl.textContent = item.name || item.label || item.id || '';
            row.appendChild(nameEl);

            this._listEl.appendChild(row);
        });
    }

    _filter() {
        this._renderList();
        // Re-position in case filtered height changed
        this._positionPopup();
    }

    _updateActive() {
        this._listEl.querySelectorAll('.wb-nav-item').forEach(el => {
            el.classList.toggle('is-active', el.dataset.id === this._activeId);
        });
    }
}
