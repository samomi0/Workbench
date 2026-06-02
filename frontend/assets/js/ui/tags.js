/**
 * tags.js  —  Tags system panel content builder.
 * Returns a DOM Element that can be passed as opts.content to PanelManager.open().
 */

import { api } from '../core/api.js';
import { bus } from '../core/bus.js';
import { ColorWheel, randomMorandi } from './color-wheel.js';

export function buildTagsContent() {
    const wrap = document.createElement('div');
    wrap.className = 'wb-syspanel';

    // ── DOM structure ────────────────────────────────────────────────────────
    const toolbar = document.createElement('div');
    toolbar.className = 'wb-syspanel-toolbar';

    const nameEl = document.createElement('input');
    nameEl.className   = 'wb-syspanel-input';
    nameEl.type        = 'text';
    nameEl.placeholder = 'Tag name';
    nameEl.maxLength   = 32;

    // Colour button (replaces <input type="color">) with Morandi colour wheel
    let currentColor = randomMorandi();
    const colorBtn = document.createElement('button');
    colorBtn.className   = 'wb-syspanel-color-btn';
    colorBtn.title       = '选择颜色';
    colorBtn.style.background = currentColor;

    const addBtn = document.createElement('button');
    addBtn.className = 'wb-syspanel-btn';
    addBtn.title     = 'Add';
    addBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
        <use href="/assets/icons/sprite.svg#icon-plus"/>
    </svg>`;

    toolbar.append(nameEl, colorBtn, addBtn);

    const listWrap = document.createElement('div');
    listWrap.className = 'wb-syspanel-list-wrap';
    const list = document.createElement('ul');
    list.className = 'wb-syspanel-list';
    listWrap.appendChild(list);

    wrap.append(toolbar, listWrap);

    // ── Colour wheel for tag colour ───────────────────────────────────────────
    const tagWheel = new ColorWheel({
        onPick: (hex) => {
            currentColor = hex;
            colorBtn.style.background = hex;
        },
        onPreview: (hex) => {
            colorBtn.style.background = hex;
        },
    });

    colorBtn.addEventListener('mousedown', e => {
        e.preventDefault();
        tagWheel.open(null, colorBtn);
    });

    // Global listeners for the tag colour wheel
    const onTagMove = e => { if (tagWheel.isOpen) tagWheel.updateDrag(e.clientX, e.clientY); };
    const onTagUp   = ()  => { if (tagWheel.isOpen) tagWheel.close(); };
    document.addEventListener('mousemove', onTagMove);
    document.addEventListener('mouseup',   onTagUp);

    // ── Render helpers ───────────────────────────────────────────────────────
    async function refresh() {
        let tags = [];
        try { tags = await api.tags.list(); } catch (_) {}

        list.innerHTML = '';
        if (tags.length === 0) {
            list.innerHTML = '<li class="wb-syspanel-empty">No tags yet</li>';
            return;
        }
        for (const tag of tags) {
            const li = document.createElement('li');
            li.className = 'wb-tag-item';
            const dot = document.createElement('span');
            dot.className = 'wb-tag-dot';
            dot.style.background = tag.color || '#8492a6';
            const name = document.createElement('span');
            name.className = 'wb-tag-name';
            name.textContent = tag.name;
            const delBtn = document.createElement('button');
            delBtn.className = 'wb-tag-del';
            delBtn.title = 'Delete';
            delBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <use href="/assets/icons/sprite.svg#icon-trash"/></svg>`;
            delBtn.addEventListener('click', async () => {
                try { await api.tags.delete(tag.id); } catch (_) {}
                bus.emit('tags:updated');
            });
            li.append(dot, name, delBtn);
            list.appendChild(li);
        }
    }

    // ── Add tag ──────────────────────────────────────────────────────────────
    addBtn.addEventListener('click', async () => {
        const name = nameEl.value.trim();
        if (!name) { nameEl.focus(); return; }
        addBtn.disabled = true;
        try {
            await api.tags.create(name, currentColor);
            nameEl.value = '';
            nameEl.focus();
            bus.emit('tags:updated');
        } catch (_) {}
        addBtn.disabled = false;
    });

    nameEl.addEventListener('keydown', e => { if (e.key === 'Enter') addBtn.click(); });

    // ── Bus subscription ─────────────────────────────────────────────────────
    bus.on('tags:updated', refresh);

    // Called by panel.js close() to clean up bus listener
    wrap.destroy = () => {
        bus.off('tags:updated', refresh);
        document.removeEventListener('mousemove', onTagMove);
        document.removeEventListener('mouseup',   onTagUp);
    };

    refresh();
    return wrap;
}
