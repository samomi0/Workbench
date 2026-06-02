/**
 * archive.js  —  Archive system panel content builder.
 * Lets the user select tags and download a ZIP of their tagged resources.
 */

import { api } from '../core/api.js';
import { bus } from '../core/bus.js';

export function buildArchiveContent() {
    const wrap = document.createElement('div');
    wrap.className = 'wb-syspanel';

    // ── DOM structure ─────────────────────────────────────────────────────────
    const topSection = document.createElement('div');
    topSection.className = 'wb-archive-section is-grow';
    topSection.innerHTML = `
        <p class="wb-archive-label">Tags to include</p>
        <div class="wb-archive-tags"></div>
    `;

    const bottomSection = document.createElement('div');
    bottomSection.className = 'wb-archive-bottom';
    bottomSection.innerHTML = `
        <input class="wb-syspanel-input" type="text" placeholder="archive.zip" value="archive.zip">
        <button class="wb-syspanel-btn">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <use href="/assets/icons/sprite.svg#icon-download"/>
            </svg>
            ZIP
        </button>
    `;

    wrap.append(topSection, bottomSection);

    // ── References ────────────────────────────────────────────────────────────
    const tagsContainer = topSection.querySelector('.wb-archive-tags');
    const filenameEl    = bottomSection.querySelector('.wb-syspanel-input');
    const dlBtn         = bottomSection.querySelector('.wb-syspanel-btn');

    let checkboxes = [];   // [{id, el: HTMLInputElement}]

    // ── Render tag list ───────────────────────────────────────────────────────
    async function refresh() {
        let tags = [];
        try { tags = await api.tags.list(); } catch (_) {}

        tagsContainer.innerHTML = '';
        checkboxes = [];

        if (tags.length === 0) {
            tagsContainer.innerHTML = '<p class="wb-syspanel-empty">No tags defined</p>';
            return;
        }

        for (const tag of tags) {
            const row = document.createElement('label');
            row.className = 'wb-archive-tag-row';
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.checked = true;
            const dot = document.createElement('span');
            dot.className = 'wb-tag-dot';
            dot.style.background = tag.color || '#8492a6';
            const name = document.createElement('span');
            name.className = 'wb-tag-name';
            name.textContent = tag.name;
            row.append(cb, dot, name);
            tagsContainer.appendChild(row);
            checkboxes.push({ id: tag.id, el: cb });
        }
    }

    // ── Download ──────────────────────────────────────────────────────────────
    dlBtn.addEventListener('click', async () => {
        const ids = checkboxes.filter(c => c.el.checked).map(c => c.id);
        if (ids.length === 0) return;
        const filename = filenameEl.value.trim() || 'archive.zip';
        const original = dlBtn.textContent.trim();
        dlBtn.disabled = true;
        dlBtn.lastChild.textContent = ' ...';
        try {
            await api.archive.download(ids, filename);
        } catch (e) {
            console.error('[wb] archive:', e);
        } finally {
            dlBtn.disabled = false;
            dlBtn.lastChild.textContent = ' ZIP';
        }
    });

    // ── Bus subscription ──────────────────────────────────────────────────────
    bus.on('tags:updated', refresh);
    wrap.destroy = () => bus.off('tags:updated', refresh);

    refresh();
    return wrap;
}
