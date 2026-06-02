/**
 * tags.js  —  Tags system panel content builder.
 * Returns a DOM Element that can be passed as opts.content to PanelManager.open().
 */

import { api } from '../core/api.js';
import { bus } from '../core/bus.js';

export function buildTagsContent() {
    const wrap = document.createElement('div');
    wrap.className = 'wb-syspanel';

    // ── DOM structure ────────────────────────────────────────────────────────
    const toolbar = document.createElement('div');
    toolbar.className = 'wb-syspanel-toolbar';
    toolbar.innerHTML = `
        <input class="wb-syspanel-input" type="text" placeholder="Tag name" maxlength="32">
        <input class="wb-syspanel-color" type="color" value="#2563eb">
        <button class="wb-syspanel-btn" title="Add">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                <use href="/assets/icons/sprite.svg#icon-plus"/>
            </svg>
        </button>
    `;

    const listWrap = document.createElement('div');
    listWrap.className = 'wb-syspanel-list-wrap';
    const list = document.createElement('ul');
    list.className = 'wb-syspanel-list';
    listWrap.appendChild(list);

    wrap.append(toolbar, listWrap);

    // ── References ───────────────────────────────────────────────────────────
    const nameEl  = toolbar.querySelector('.wb-syspanel-input');
    const colorEl = toolbar.querySelector('.wb-syspanel-color');
    const addBtn  = toolbar.querySelector('.wb-syspanel-btn');

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
            await api.tags.create(name, colorEl.value);
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
    wrap.destroy = () => bus.off('tags:updated', refresh);

    refresh();
    return wrap;
}
