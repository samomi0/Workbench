/**
 * sticky-board.js
 * Multi-type sticky notes backed by the /api/notes REST API.
 * Types: note | todo | ticket | image
 */

import { api } from '../core/api.js';
import { bus } from '../core/bus.js';

const NOTE_COLORS = ['#fef08a', '#bbf7d0', '#bae6fd', '#e9d5ff', '#fecaca', '#fed7aa'];
const NOTE_W      = 260;   // default note width (px)

// Palette for ticket link button colours (index 0 = default blue)
const LINK_PALETTE = [
    { bg: 'rgba(219,234,254,0.55)', border: 'rgba(37,99,235,0.35)',  text: '#1d4ed8' }, // blue
    { bg: 'rgba(220,252,231,0.55)', border: 'rgba(22,163,74,0.35)',  text: '#15803d' }, // green
    { bg: 'rgba(254,243,199,0.55)', border: 'rgba(217,119,6,0.40)',  text: '#92400e' }, // amber
    { bg: 'rgba(243,232,255,0.55)', border: 'rgba(126,34,206,0.35)', text: '#6b21a8' }, // purple
    { bg: 'rgba(254,226,226,0.55)', border: 'rgba(220,38,38,0.35)',  text: '#b91c1c' }, // red
    { bg: 'rgba(204,251,241,0.55)', border: 'rgba(13,148,136,0.35)', text: '#0f766e' }, // teal
];

// HSL helpers for the colour wheel picker
function _hslToRgb(h, s, l) {
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h * 6) % 2) - 1));
    const m = l - c / 2;
    let r = 0, g = 0, b = 0;
    const h6 = h * 6;
    if      (h6 < 1) { r = c; g = x; b = 0; }
    else if (h6 < 2) { r = x; g = c; b = 0; }
    else if (h6 < 3) { r = 0; g = c; b = x; }
    else if (h6 < 4) { r = 0; g = x; b = c; }
    else if (h6 < 5) { r = x; g = 0; b = c; }
    else             { r = c; g = 0; b = x; }
    return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

function _hslToHex(h, s, l) {
    const [r, g, b] = _hslToRgb(h, s, l);
    return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

let _zTop = 100;

export class StickyBoard {
    /**
     * @param {HTMLElement} canvas
     * @param {{ onOpenTags?: Function, onOpenArchive?: Function }} opts
     */
    constructor(canvas, opts = {}) {
        this._canvas        = canvas;
        this._notes         = [];
        this._els           = new Map();
        this._onOpenTags    = opts.onOpenTags    || (() => {});
        this._onOpenArchive = opts.onOpenArchive || (() => {});

        this._layer = document.createElement('div');
        this._layer.className = 'wb-sticky-layer';
        this._canvas.appendChild(this._layer);

        this._load();
    }

    // ── Visibility ────────────────────────────────────────────────────────────

    show() { this._layer.style.display = ''; }
    hide() { this._layer.style.display = 'none'; }

    // ── Public: create note at position ──────────────────────────────────────

    /**
     * Create a new note of the given type, centred on pos.
     * @param {{ x: number, y: number }|null} pos  Viewport coordinates (menu click point)
     * @param {'note'|'todo'|'ticket'} type
     */
    async createNote(pos, type = 'note') {
        const { nx, ny } = this._clampPos(pos);

        const data = { type, x: nx, y: ny, color: NOTE_COLORS[0] };
        if (type === 'note')   data.text    = '';
        if (type === 'todo')   data.items   = [];
        if (type === 'ticket') { data.content = ''; data.links = []; }

        try {
            const note = await api.notes.create(data);
            this._notes.push(note);
            const el = this._renderNote(note);
            el.querySelector('textarea, .wb-todo-new-input')?.focus();
            return note.id;
        } catch (e) {
            console.error('Failed to create note', e);
        }
    }

    /**
     * Create a note with an initial image pasted from clipboard.
     * Creates a standard 'note' type that supports text + multiple images.
     * @param {{ x: number, y: number }|null} pos
     * @param {Blob} blob
     */
    async createImageNote(pos, blob) {
        const { nx, ny } = this._clampPos(pos);
        try {
            const note = await api.notes.create({
                type: 'note', x: nx, y: ny, color: '#f8fafc', text: '', images: [],
            });
            this._notes.push(note);
            this._renderNote(note);
            await this._addImageToNote(note, blob, { fallback: 'legacy-convert' });
            return note.id;
        } catch (e) {
            // Last-resort: create old-style image note if mixed-mode create fails.
            try {
                return await this._createLegacyImageNote({ x: nx, y: ny }, blob);
            } catch (_) {
                console.error('Failed to create image note', e);
            }
        }
    }

    // ── Persistence ───────────────────────────────────────────────────────────

    async _load() {
        // Discard legacy localStorage data
        localStorage.removeItem('wb-sticky-notes');

        try {
            this._notes = await api.notes.list();
        } catch (_) {
            this._notes = [];
        }
        this._notes.forEach(n => this._renderNote(n));
    }

    /** Debounced backend sync — call after any data mutation. */
    _scheduleSync(note) {
        clearTimeout(note._syncTimer);
        note._syncTimer = setTimeout(() => this._sync(note), 400);
    }

    async _sync(note) {
        const payload = { x: note.x, y: note.y, color: note.color, tag_ids: note.tag_ids || [] };
        if (note.w) payload.w = note.w;
        if (note.h) payload.h = note.h;
        if (note.type === 'note')   { payload.text = note.text; payload.images = note.images || []; }
        if (note.type === 'todo')   payload.items   = note.items;
        if (note.type === 'ticket') { payload.content = note.content; payload.links = note.links; }
        try { await api.notes.update(note.id, payload); } catch (_) {}
    }

    async _deleteNote(id) {
        this._els.get(id)?.remove();
        this._els.delete(id);
        this._notes = this._notes.filter(n => n.id !== id);
        try { await api.notes.delete(id); } catch (_) {}
    }

    async _archiveNote(note) {
        try { await api.notes.update(note.id, { archived: true }); } catch (_) {}
        this._els.get(note.id)?.remove();
        this._els.delete(note.id);
        this._notes = this._notes.filter(n => n.id !== note.id);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    _clampPos(pos) {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const cx = pos?.x ?? Math.round(vw / 2);
        const cy = pos?.y ?? Math.round(vh / 2);
        const nx = Math.max(10, Math.min(cx - NOTE_W / 2, vw - NOTE_W - 10));
        const ny = Math.max(10, Math.min(cy - 100, vh - 240));
        return { nx, ny };
    }

    // ── Render dispatcher ─────────────────────────────────────────────────────

    _renderNote(note) {
        const el = document.createElement('div');
        el.className    = 'wb-sticky';
        el.style.left   = note.x + 'px';
        el.style.top    = note.y + 'px';
        el.style.zIndex = String(++_zTop);
        el.dataset.id   = note.id;
        el.dataset.type = note.type || 'note';
        if (note.w) el.style.width  = note.w + 'px';
        if (note.h) el.style.height = note.h + 'px';

        el.addEventListener('mousedown', () => { el.style.zIndex = String(++_zTop); });

        el.appendChild(this._makeHead(note));

        const body = document.createElement('div');
        body.className = 'wb-sticky-body';
        switch (note.type) {
            case 'todo':   this._buildTodoBody(note, body);   break;
            case 'ticket': this._buildTicketBody(note, body); break;
            case 'image':  this._buildImageBody(note, body);  break;
            default:       this._buildTextBody(note, body);   break;
        }
        el.appendChild(body);

        this._makeResizable(el, note);
        this._makeDraggable(el, el.querySelector('.wb-sticky-head'), note);
        this._layer.appendChild(el);
        this._els.set(note.id, el);
        return el;
    }

    // ── Header ────────────────────────────────────────────────────────────────

    _makeHead(note) {
        const head = document.createElement('div');
        head.className = 'wb-sticky-head';
        head.style.background = note.color;

        // ── Colour wheel trigger button (left) ──────────────────────────────
        const colorBtn = document.createElement('button');
        colorBtn.className        = 'wb-color-btn';
        colorBtn.title            = '更改颜色';
        colorBtn.style.background = note.color;
        colorBtn.addEventListener('mousedown', e => e.stopPropagation());
        colorBtn.addEventListener('click', e => {
            e.stopPropagation();
            this._openColorWheel(note, colorBtn, head);
        });
        head.appendChild(colorBtn);

        const spacer = document.createElement('div');
        spacer.style.flex = '1';
        head.appendChild(spacer);

        // ── Tool buttons: tag / archive ─────────────────────────────────────
        const tools = document.createElement('div');
        tools.className = 'wb-sticky-tools';

        const tagBtn = this._mkToolBtn(
            `<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>`,
            '标签',
        );
        tagBtn.addEventListener('click', e => { e.stopPropagation(); this._openTagDropdown(note, tagBtn); });
        tools.appendChild(tagBtn);

        const arcBtn = this._mkToolBtn(
            `<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>`,
            '归档',
        );
        arcBtn.addEventListener('click', e => { e.stopPropagation(); this._archiveNote(note); });
        tools.appendChild(arcBtn);

        head.appendChild(tools);
        return head;
    }

    _mkToolBtn(svgHtml, title) {
        const btn = document.createElement('button');
        btn.className = 'wb-sticky-tool-btn';
        btn.title = title;
        btn.innerHTML = svgHtml;
        btn.addEventListener('mousedown', e => e.stopPropagation());
        return btn;
    }

    // ── Colour wheel picker ───────────────────────────────────────────────────

    _openColorWheel(note, anchor, head) {
        document.querySelector('.wb-color-wheel-overlay')?.remove();
        this._colorWheelCleanup?.();

        const SIZE = 140;
        const R    = SIZE / 2;
        const L    = 0.87; // fixed lightness → pleasant pastel tones

        const overlay = document.createElement('div');
        overlay.className = 'wb-color-wheel-overlay';

        const canvas = document.createElement('canvas');
        canvas.width  = SIZE;
        canvas.height = SIZE;
        canvas.className = 'wb-color-wheel-canvas';
        overlay.appendChild(canvas);

        // Draw HSL wheel: hue = angle, saturation = radius, lightness fixed
        const ctx     = canvas.getContext('2d');
        const imgData = ctx.createImageData(SIZE, SIZE);
        for (let y = 0; y < SIZE; y++) {
            for (let x = 0; x < SIZE; x++) {
                const dx   = x - R;
                const dy   = y - R;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist > R) continue;
                const h           = (Math.atan2(dy, dx) / (Math.PI * 2) + 1) % 1;
                const s           = dist / R;
                const [r, g, b]   = _hslToRgb(h, s, L);
                const i           = (y * SIZE + x) * 4;
                imgData.data[i]     = r;
                imgData.data[i + 1] = g;
                imgData.data[i + 2] = b;
                imgData.data[i + 3] = 255;
            }
        }
        ctx.putImageData(imgData, 0, 0);
        ctx.beginPath();
        ctx.arc(R, R, R - 0.5, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(0,0,0,0.12)';
        ctx.lineWidth   = 1;
        ctx.stroke();

        // Position below anchor, clamped within viewport
        const rect = anchor.getBoundingClientRect();
        const ox   = Math.max(4, Math.min(rect.left - R + 10, window.innerWidth  - SIZE - 4));
        const oy   = Math.max(4, Math.min(rect.bottom + 6,    window.innerHeight - SIZE - 4));
        overlay.style.left = ox + 'px';
        overlay.style.top  = oy + 'px';
        document.body.appendChild(overlay);

        const pick = (cx, cy) => {
            const cr  = canvas.getBoundingClientRect();
            const dx  = cx - cr.left - R;
            const dy  = cy - cr.top  - R;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const h   = (Math.atan2(dy, dx) / (Math.PI * 2) + 1) % 1;
            const s   = Math.min(dist / R, 1);
            const hex = _hslToHex(h, s, L);
            note.color              = hex;
            head.style.background   = hex;
            anchor.style.background = hex;
            this._scheduleSync(note);
        };

        let dragging = false;
        const onDown = (e) => {
            if (e.button !== 0) return;
            e.preventDefault(); e.stopPropagation();
            dragging = true;
            pick(e.clientX, e.clientY);
        };
        const onMove = (e) => { if (dragging) pick(e.clientX, e.clientY); };
        const onUp   = ()  => { if (dragging) { dragging = false; cleanup(); } };

        canvas.addEventListener('mousedown', onDown);
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup',   onUp);

        const onOutside = (e) => {
            if (!overlay.contains(e.target) && e.target !== anchor) cleanup();
        };
        setTimeout(() => document.addEventListener('mousedown', onOutside, true), 0);

        const cleanup = () => {
            overlay.remove();
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup',   onUp);
            document.removeEventListener('mousedown', onOutside, true);
            this._colorWheelCleanup = null;
        };
        this._colorWheelCleanup = cleanup;
    }

    // ── Text note body (supports text + multiple inline images) ──────────────

    _buildTextBody(note, body) {
        if (!Array.isArray(note.images)) note.images = [];

        const ta = document.createElement('textarea');
        ta.className   = 'wb-sticky-text';
        ta.value       = note.text || '';
        ta.placeholder = '记点什么…';

        ta.addEventListener('input', () => {
            note.text = ta.value;
            this._scheduleSync(note);
        });
        ta.addEventListener('mousedown', e => { if (e.button === 1) e.stopPropagation(); });

        // Paste image inside textarea → add to image strip (no type conversion)
        ta.addEventListener('paste', async (e) => {
            const items   = Array.from(e.clipboardData?.items || []);
            const imgItem = items.find(it => it.type.startsWith('image/'));
            if (imgItem) {
                e.preventDefault();
                const blob = imgItem.getAsFile();
                if (blob) await this._addImageToNote(note, blob);
            }
        });

        body.appendChild(ta);

        // Image strip (shown even when empty so new images can be appended)
        const strip = this._makeImgStrip(note);
        body.appendChild(strip);
    }

    // ── Per-note image strip helpers ──────────────────────────────────────────

    _makeImgStrip(note) {
        const strip = document.createElement('div');
        strip.className   = 'wb-sticky-img-strip';
        strip.dataset.id  = note.id;
        // Render existing images
        (note.images || []).forEach(imgDef => strip.appendChild(this._mkImgItem(note, imgDef)));
        return strip;
    }

    _mkImgItem(note, imgDef) {
        const item = document.createElement('div');
        item.className = 'wb-sticky-img-item';

        const img = document.createElement('img');
        img.src       = `/api/notes/${note.id}/images/${imgDef.img_id}?t=${Date.now()}`;
        img.alt       = '';
        img.draggable = false;

        // 点击 item 区域打开 lightbox（img 本身 pointer-events:none，点击落在 item 上）
        item.addEventListener('click', e => {
            e.stopPropagation();
            this._openLightbox(img.src);
        });

        const del = document.createElement('button');
        del.className   = 'wb-sticky-img-del';
        del.textContent = '\u00d7';
        del.title       = '删除图片';
        del.addEventListener('mousedown', e => e.stopPropagation());
        del.addEventListener('click', async e => {
            e.stopPropagation();
            item.remove();
            note.images = (note.images || []).filter(i => i.img_id !== imgDef.img_id);
            try { await api.notes.deleteNoteImage(note.id, imgDef.img_id); } catch (_) {}
            this._scheduleSync(note);
        });

        item.append(img, del);
        return item;
    }

    async _createLegacyImageNote(pos, blob) {
        const note = await api.notes.create({ type: 'image', x: pos.x, y: pos.y, color: '#f8fafc' });
        const result = await api.notes.uploadImage(note.id, blob);
        note.image_ext = result.image_ext;
        this._notes.push(note);
        this._renderNote(note);
        return note.id;
    }

    async _addImageToNote(note, blob, opts = {}) {
        const fallback = opts.fallback || 'legacy-spawn';
        try {
            const result = await api.notes.uploadNoteImage(note.id, blob);
            if (!Array.isArray(note.images)) note.images = [];
            const imgDef = { img_id: result.img_id, ext: result.ext };
            note.images.push(imgDef);
            // Append to existing strip in the rendered note
            const el    = this._els.get(note.id);
            let   strip = el?.querySelector('.wb-sticky-img-strip');
            if (strip) {
                strip.appendChild(this._mkImgItem(note, imgDef));
            }
            this._scheduleSync(note);
        } catch (e) {
            // Compatibility fallback for old backend without /api/notes/{id}/images
            try {
                if (fallback === 'legacy-convert') {
                    const result = await api.notes.uploadImage(note.id, blob);
                    note.type      = 'image';
                    note.image_ext = result.image_ext;
                    const el = this._els.get(note.id);
                    if (el) {
                        const savedZ = el.style.zIndex;
                        el.remove();
                        this._els.delete(note.id);
                        const newEl = this._renderNote(note);
                        newEl.style.zIndex = savedZ;
                    }
                } else {
                    const pos = { x: note.x + 24, y: note.y + 24 };
                    await this._createLegacyImageNote(pos, blob);
                }
            } catch (_) {
                console.error('Image upload failed', e);
            }
        }
    }

    // ── Todo note body ────────────────────────────────────────────────────────

    _buildTodoBody(note, body) {
        if (!Array.isArray(note.items)) note.items = [];

        const list = document.createElement('div');
        list.className = 'wb-todo-list';

        // Define addRow / addInput first so renderItem can reference addInput
        const addRow   = document.createElement('div');
        addRow.className = 'wb-todo-add-row';
        const addInput = document.createElement('input');
        addInput.type        = 'text';
        addInput.className   = 'wb-todo-new-input';
        addInput.placeholder = '添加项目…';

        const renderItem = (item) => {
            const row = document.createElement('div');
            row.className = 'wb-todo-row' + (item.done ? ' is-done' : '');

            const cb = document.createElement('input');
            cb.type      = 'checkbox';
            cb.className = 'wb-todo-cb';
            cb.checked   = !!item.done;
            cb.addEventListener('change', () => {
                item.done = cb.checked;
                row.classList.toggle('is-done', item.done);
                this._scheduleSync(note);
            });

            const span = document.createElement('span');
            span.className       = 'wb-todo-text';
            span.textContent     = item.text;
            span.contentEditable = 'true';
            span.spellcheck      = false;
            span.addEventListener('input', () => {
                item.text = span.textContent || '';
                this._scheduleSync(note);
            });
            span.addEventListener('keydown', e => {
                if (e.key === 'Enter') { e.preventDefault(); addInput.focus(); }
            });

            const del = document.createElement('button');
            del.className   = 'wb-todo-del-item';
            del.textContent = '×';
            del.addEventListener('click', () => {
                note.items = note.items.filter(i => i.id !== item.id);
                row.remove();
                this._scheduleSync(note);
            });

            row.append(cb, span, del);
            return row;
        };

        note.items.forEach(item => list.appendChild(renderItem(item)));

        addInput.addEventListener('keydown', e => {
            if (e.key === 'Enter' && addInput.value.trim()) {
                e.preventDefault();
                const newItem = { id: 'ti' + Date.now(), text: addInput.value.trim(), done: false };
                note.items.push(newItem);
                list.insertBefore(renderItem(newItem), addRow);
                addInput.value = '';
                this._scheduleSync(note);
            }
        });

        addRow.appendChild(addInput);
        list.appendChild(addRow);
        body.appendChild(list);
    }

    // ── Ticket note body ──────────────────────────────────────────────────────

    _buildTicketBody(note, body) {
        if (!Array.isArray(note.links)) note.links = [];

        const ta = document.createElement('textarea');
        ta.className   = 'wb-sticky-text wb-ticket-content';
        ta.value       = note.content || '';
        ta.placeholder = '内容…';
        ta.addEventListener('input', () => {
            note.content = ta.value;
            this._scheduleSync(note);
        });
        ta.addEventListener('mousedown', e => { if (e.button === 1) e.stopPropagation(); });
        body.appendChild(ta);

        const linkArea = document.createElement('div');
        linkArea.className = 'wb-ticket-links';

        note.links.forEach(link => linkArea.appendChild(this._mkLinkBtn(note, link)));

        const addBtn = document.createElement('button');
        addBtn.className   = 'wb-ticket-add-link-btn';
        addBtn.textContent = '+ 链接';
        addBtn.addEventListener('mousedown', e => e.stopPropagation());
        addBtn.addEventListener('click', e => {
            e.stopPropagation();
            this._showAddLinkForm(note, linkArea, addBtn);
        });
        linkArea.appendChild(addBtn);
        body.appendChild(linkArea);
    }

    _mkLinkBtn(note, link) {
        const palette = LINK_PALETTE[link.colorIdx ?? 0] ?? LINK_PALETTE[0];
        const btn     = document.createElement('button');
        btn.className         = 'wb-ticket-link-btn';
        btn.title             = link.url;
        btn.style.background  = palette.bg;
        btn.style.borderColor = palette.border;
        btn.style.color       = palette.text;
        btn.addEventListener('mouseenter', () => { btn.style.filter = 'brightness(0.91) saturate(1.1)'; });
        btn.addEventListener('mouseleave', () => { btn.style.filter = ''; });

        const labelSpan = document.createElement('span');
        labelSpan.textContent = link.label || link.url;

        const delSpan = document.createElement('span');
        delSpan.className   = 'wb-link-del';
        delSpan.textContent = '\u00d7'; // ×
        delSpan.title       = '删除链接';
        delSpan.addEventListener('click', e => {
            e.stopPropagation();
            note.links = note.links.filter(l => l.id !== link.id);
            btn.remove();
            this._scheduleSync(note);
        });

        btn.append(labelSpan, delSpan);
        btn.addEventListener('click', e => {
            if (e.target === delSpan) return;
            e.stopPropagation();
            window.open(link.url, '_blank', 'noopener,noreferrer');
        });
        // Right-click also removes (legacy)
        btn.addEventListener('contextmenu', e => {
            e.preventDefault();
            e.stopPropagation();
            note.links = note.links.filter(l => l.id !== link.id);
            btn.remove();
            this._scheduleSync(note);
        });
        return btn;
    }

    _showAddLinkForm(note, linkArea, addBtn) {
        if (linkArea.querySelector('.wb-ticket-link-form')) return;
        addBtn.style.display = 'none';

        const form = document.createElement('div');
        form.className = 'wb-ticket-link-form';

        const labelInput = document.createElement('input');
        labelInput.type        = 'text';
        labelInput.placeholder = '名称';
        labelInput.className   = 'wb-ticket-form-input';

        const urlInput = document.createElement('input');
        urlInput.type        = 'text';
        urlInput.placeholder = 'URL (https://…)';
        urlInput.className   = 'wb-ticket-form-input';

        const okBtn = document.createElement('button');
        okBtn.textContent = '✓';
        okBtn.className   = 'wb-ticket-form-ok';

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = '✕';
        cancelBtn.className   = 'wb-ticket-form-cancel';

        // ── Colour swatches ────────────────────────────────────────────────
        let selectedColorIdx = 0;
        const colorRow = document.createElement('div');
        colorRow.className = 'wb-link-color-row';
        LINK_PALETTE.forEach((p, i) => {
            const sw = document.createElement('button');
            sw.className        = 'wb-link-color-swatch' + (i === 0 ? ' is-selected' : '');
            sw.style.background = p.bg;
            sw.style.outline    = i === 0 ? `2px solid ${p.text}` : '2px solid transparent';
            sw.title            = '';
            sw.addEventListener('mousedown', e => e.stopPropagation());
            sw.addEventListener('click', e => {
                e.stopPropagation();
                selectedColorIdx = i;
                colorRow.querySelectorAll('.wb-link-color-swatch').forEach((s, j) => {
                    s.classList.toggle('is-selected', j === i);
                    s.style.outline = j === i ? `2px solid ${LINK_PALETTE[j].text}` : '2px solid transparent';
                });
            });
            colorRow.appendChild(sw);
        });

        const close = () => { form.remove(); addBtn.style.display = ''; };

        okBtn.addEventListener('click', e => {
            e.stopPropagation();
            const url = urlInput.value.trim();
            if (!url) { urlInput.focus(); return; }
            const label = labelInput.value.trim() || url;
            const link  = { id: 'lk' + Date.now(), label, url, colorIdx: selectedColorIdx };
            note.links.push(link);
            linkArea.insertBefore(this._mkLinkBtn(note, link), form);
            close();
            this._scheduleSync(note);
        });

        cancelBtn.addEventListener('click', e => { e.stopPropagation(); close(); });
        urlInput.addEventListener('keydown', e => {
            if (e.key === 'Enter')  okBtn.click();
            if (e.key === 'Escape') close();
        });
        labelInput.addEventListener('keydown', e => {
            if (e.key === 'Enter')  urlInput.focus();
            if (e.key === 'Escape') close();
        });

        form.append(labelInput, urlInput, colorRow, okBtn, cancelBtn);
        linkArea.insertBefore(form, addBtn);
        labelInput.focus();
    }

    // ── Image note body ───────────────────────────────────────────────────────

    _buildImageBody(note, body) {
        const wrap = document.createElement('div');
        wrap.className = 'wb-sticky-img-wrap';

        const img = document.createElement('img');
        img.className = 'wb-sticky-img';
        img.src       = `/api/notes/${note.id}/image?t=${Date.now()}`;
        img.alt       = '';
        img.draggable = false;
        img.addEventListener('click', e => {
            e.stopPropagation();
            this._openLightbox(img.src);
        });

        wrap.appendChild(img);
        body.appendChild(wrap);
    }

    // ── Lightbox ──────────────────────────────────────────────────────────────

    _openLightbox(src) {
        this._closeLightbox(); // close any existing one first

        const overlay = document.createElement('div');
        overlay.className = 'wb-lightbox';

        const img = document.createElement('img');
        img.className = 'wb-lightbox-img';
        img.src       = src;
        img.alt       = '';
        img.draggable = false;

        overlay.appendChild(img);
        document.body.appendChild(overlay);
        this._lightboxEl = overlay;

        // Prevent image click from bubbling to overlay (which closes)
        img.addEventListener('click', e => e.stopPropagation());

        // Click background → close
        overlay.addEventListener('click', () => this._closeLightbox());

        // Right-click → close (no browser menu)
        overlay.addEventListener('contextmenu', e => {
            e.preventDefault();
            this._closeLightbox();
        });

        // Escape → close
        this._lightboxKeyHandler = (e) => {
            if (e.key === 'Escape') this._closeLightbox();
        };
        document.addEventListener('keydown', this._lightboxKeyHandler);
    }

    _closeLightbox() {
        if (this._lightboxEl) {
            this._lightboxEl.remove();
            this._lightboxEl = null;
        }
        if (this._lightboxKeyHandler) {
            document.removeEventListener('keydown', this._lightboxKeyHandler);
            this._lightboxKeyHandler = null;
        }
    }

    // ── Tag dropdown ──────────────────────────────────────────────────────────

    async _openTagDropdown(note, anchor) {
        document.querySelector('.wb-tag-dropdown')?.remove();

        let tags = [];
        try { tags = await api.tags.list(); } catch (_) {}

        const dd = document.createElement('div');
        dd.className = 'wb-tag-dropdown';

        // ── Inline create-tag row (pinned to bottom) ─────────────────────────
        const createRow    = document.createElement('div');
        createRow.className = 'wb-tag-dd-create';

        const nameInput = document.createElement('input');
        nameInput.type        = 'text';
        nameInput.placeholder = '新标签名称…';
        nameInput.className   = 'wb-tag-dd-create-input';

        const colorInput = document.createElement('input');
        colorInput.type      = 'color';
        colorInput.value     = '#2563eb';
        colorInput.className = 'wb-tag-dd-color';
        colorInput.title     = '选择颜色';

        const addTagBtn = document.createElement('button');
        addTagBtn.className   = 'wb-tag-dd-add-btn';
        addTagBtn.textContent = '+';
        addTagBtn.title       = '创建标签';

        createRow.append(nameInput, colorInput, addTagBtn);
        dd.appendChild(createRow); // bottom anchor — tags insert before it

        // ── Tag-row factory ──────────────────────────────────────────────────
        const addTagRow = (tag) => {
            const lbl = document.createElement('label');
            lbl.className = 'wb-tag-dd-row';
            const cb = document.createElement('input');
            cb.type    = 'checkbox';
            cb.checked = (note.tag_ids || []).includes(tag.id);
            cb.addEventListener('change', () => {
                const set = new Set(note.tag_ids || []);
                if (cb.checked) set.add(tag.id); else set.delete(tag.id);
                note.tag_ids = [...set];
                this._scheduleSync(note);
            });
            const dot = document.createElement('span');
            dot.className        = 'wb-tag-dd-dot';
            dot.style.background = tag.color || '#2563eb';
            const nameSpan = document.createElement('span');
            nameSpan.textContent = tag.name;
            lbl.append(cb, dot, nameSpan);
            dd.insertBefore(lbl, createRow);
        };

        // ── Create-tag action ─────────────────────────────────────────────────
        const doCreateTag = async () => {
            const name = nameInput.value.trim();
            if (!name) { nameInput.focus(); return; }
            addTagBtn.disabled = true;
            try {
                const newTag = await api.tags.create(name, colorInput.value);
                tags.push(newTag);
                addTagRow(newTag);
                nameInput.value = '';
                dd.querySelector('.wb-tag-dd-empty')?.remove();
                bus.emit('tags:updated');
            } catch (_) {}
            addTagBtn.disabled = false;
            nameInput.focus();
        };

        addTagBtn.addEventListener('mousedown', e => e.stopPropagation());
        addTagBtn.addEventListener('click',     e => { e.stopPropagation(); doCreateTag(); });
        nameInput.addEventListener('mousedown', e => e.stopPropagation());
        nameInput.addEventListener('keydown',   e => {
            e.stopPropagation();
            if (e.key === 'Enter')  doCreateTag();
            if (e.key === 'Escape') {
                dd.remove();
                document.removeEventListener('mousedown', onOutside, true);
            }
        });
        colorInput.addEventListener('mousedown', e => e.stopPropagation());

        // ── Render existing tags ─────────────────────────────────────────────
        if (tags.length === 0) {
            const msg = document.createElement('div');
            msg.className   = 'wb-tag-dd-empty';
            msg.textContent = '暂无标签';
            dd.insertBefore(msg, createRow);
        } else {
            tags.forEach(tag => addTagRow(tag));
        }

        const rect    = anchor.getBoundingClientRect();
        dd.style.left = rect.left + 'px';
        dd.style.top  = (rect.bottom + 4) + 'px';
        document.body.appendChild(dd);

        const onOutside = (e) => {
            if (!dd.contains(e.target) && e.target !== anchor) {
                dd.remove();
                document.removeEventListener('mousedown', onOutside, true);
            }
        };
        setTimeout(() => document.addEventListener('mousedown', onOutside, true), 0);
    }

    // ── Drag ──────────────────────────────────────────────────────────────────

    _makeResizable(el, note) {
        const handle = document.createElement('div');
        handle.className = 'wb-sticky-resize-handle';
        el.appendChild(handle);

        const MIN_W = 200, MIN_H = 140;
        let startX = 0, startY = 0, startW = 0, startH = 0;

        const onMove = e => {
            note.w = Math.max(MIN_W, startW + (e.clientX - startX));
            note.h = Math.max(MIN_H, startH + (e.clientY - startY));
            el.style.width  = note.w + 'px';
            el.style.height = note.h + 'px';
        };
        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup',   onUp);
            this._scheduleSync(note);
        };
        handle.addEventListener('mousedown', e => {
            if (e.button !== 0) return;
            e.preventDefault();
            e.stopPropagation();
            startX = e.clientX;
            startY = e.clientY;
            startW = el.offsetWidth;
            startH = el.offsetHeight;
            el.style.zIndex = String(++_zTop);
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup',   onUp);
        });
    }

    _makeDraggable(el, handle, note) {
        let startX = 0, startY = 0, ox = 0, oy = 0;

        const onMove = e => {
            note.x = ox + (e.clientX - startX);
            note.y = oy + (e.clientY - startY);
            el.style.left = note.x + 'px';
            el.style.top  = note.y + 'px';
        };

        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup',   onUp);
            this._scheduleSync(note);
        };

        handle.addEventListener('mousedown', e => {
            if (e.button !== 0) return;
            e.preventDefault();
            ox = note.x; oy = note.y;
            startX = e.clientX; startY = e.clientY;
            el.style.zIndex = String(++_zTop);
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup',   onUp);
        });
    }
}
