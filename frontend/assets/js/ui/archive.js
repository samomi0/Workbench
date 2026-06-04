/**
 * archive.js  —  Archive system panel content builder.
 * Lists archived notes with search, tag filter, type filter, and ZIP download.
 */

import { api } from '../core/api.js';
import { bus } from '../core/bus.js';

const TYPE_ICONS = {
    note:   'icon-note',
    todo:   'icon-todo',
    ticket: 'icon-ticket',
    image:  'icon-note',
};

const TYPE_LABELS = {
    note:   '便笺',
    todo:   'Todo',
    ticket: '工单',
    image:  '图片',
};

const SVG_NS = 'http://www.w3.org/2000/svg';

export function buildArchiveContent() {
    const wrap = document.createElement('div');
    wrap.className = 'wb-syspanel';

    let _notes     = [];
    let _tags      = [];
    let _selected  = new Set();       // selected note ids
    let _selectAll = false;

    // ── Toolbar: search + download ──────────────────────────────────────────
    const toolbar = document.createElement('div');
    toolbar.className = 'wb-archive-toolbar';

    const searchEl = document.createElement('input');
    searchEl.className   = 'wb-syspanel-input';
    searchEl.type        = 'text';
    searchEl.placeholder = '搜索归档…';

    const tagFilter = document.createElement('select');
    tagFilter.className = 'wb-archive-select';

    const typeFilter = document.createElement('select');
    typeFilter.className = 'wb-archive-select';

    const zipBtn = document.createElement('button');
    zipBtn.className = 'wb-syspanel-btn';
    zipBtn.title     = '下载 ZIP';
    zipBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <use href="/assets/icons/sprite.svg#icon-download"/>
    </svg> ZIP`;

    toolbar.append(searchEl, tagFilter, typeFilter, zipBtn);

    // ── Select-all row ─────────────────────────────────────────────────────
    const selRow = document.createElement('div');
    selRow.className = 'wb-archive-selrow';

    const selAllCB = document.createElement('input');
    selAllCB.type = 'checkbox';
    selAllCB.className = 'wb-archive-selall-cb';
    const selLabel = document.createElement('span');
    selLabel.className = 'wb-archive-sel-label';
    selLabel.textContent = '全选';

    const unarchiveBtn = document.createElement('button');
    unarchiveBtn.className = 'wb-archive-restore-btn';
    unarchiveBtn.textContent = '取消归档';
    unarchiveBtn.title = '将选中项取消归档';

    selRow.append(selAllCB, selLabel, unarchiveBtn);

    // ── List container ─────────────────────────────────────────────────────
    const listWrap = document.createElement('div');
    listWrap.className = 'wb-archive-list-wrap';
    const list = document.createElement('div');
    list.className = 'wb-archive-list';
    listWrap.appendChild(list);

    wrap.append(toolbar, selRow, listWrap);

    // ── Refresh: load data & render ────────────────────────────────────────
    async function loadData() {
        try { _notes = await api.notes.list(true); } catch (_) { _notes = []; }
        try { _tags  = await api.tags.list();     } catch (_) { _tags  = []; }
        renderFilters();
        render();
    }

    function renderFilters() {
        // Tag filter
        tagFilter.innerHTML = '<option value="">全部标签</option>';
        _tags.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t.id;
            opt.textContent = t.name;
            tagFilter.appendChild(opt);
        });

        // Type filter
        typeFilter.innerHTML = '<option value="">全部类型</option>';
        ['note', 'todo', 'ticket', 'image'].forEach(t => {
            const opt = document.createElement('option');
            opt.value = t;
            opt.textContent = TYPE_LABELS[t];
            typeFilter.appendChild(opt);
        });
    }

    function getFilteredNotes() {
        const q    = searchEl.value.toLowerCase();
        const tid  = tagFilter.value;
        const type = typeFilter.value;

        return _notes.filter(n => {
            if (q) {
                const text = n.text || n.content || '';
                const itemsText = (n.items || []).map(i => i.text || '').join(' ');
                if (!(`${text} ${itemsText}`.toLowerCase().includes(q))) return false;
            }
            if (tid && !(n.tag_ids || []).includes(tid)) return false;
            if (type && n.type !== type) return false;
            return true;
        });
    }

    function render() {
        const filtered = getFilteredNotes();
        list.innerHTML = '';

        if (filtered.length === 0) {
            list.innerHTML = '<div class="wb-archive-empty">暂无归档</div>';
            updateSelectAll();
            return;
        }

        filtered.forEach(note => {
            const card = document.createElement('div');
            card.className = 'wb-archive-card';

            // Checkbox
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.className = 'wb-archive-card-cb';
            cb.checked = _selected.has(note.id) || _selectAll;
            cb.addEventListener('change', () => {
                if (cb.checked) _selected.add(note.id);
                else { _selected.delete(note.id); _selectAll = false; }
                updateSelectAll();
            });

            // Type icon
            const typeIcon = document.createElementNS(SVG_NS, 'svg');
            typeIcon.setAttribute('viewBox', '0 0 24 24');
            typeIcon.setAttribute('width', '14');
            typeIcon.setAttribute('height', '14');
            typeIcon.classList.add('wb-archive-type-icon');
            const use = document.createElementNS(SVG_NS, 'use');
            use.setAttribute('href', `/assets/icons/sprite.svg#${TYPE_ICONS[note.type] || 'icon-note'}`);
            typeIcon.appendChild(use);

            // Thumbnail / preview
            const preview = document.createElement('div');
            preview.className = 'wb-archive-preview';

            if (note.type === 'image' && note.image_ext) {
                const img = document.createElement('img');
                img.src = `/api/notes/${note.id}/image?t=${Date.now()}`;
                img.alt = '';
                preview.appendChild(img);
            } else if (note.type === 'note' && (note.images || []).length > 0) {
                const img = document.createElement('img');
                img.src = `/api/notes/${note.id}/images/${note.images[0].img_id}?t=${Date.now()}`;
                img.alt = '';
                preview.appendChild(img);
            } else {
                preview.classList.add('is-text');
                const snippet = document.createElement('span');
                snippet.className = 'wb-archive-snippet';
                if (note.type === 'note')   snippet.textContent = (note.text || '').slice(0, 80);
                if (note.type === 'todo')   snippet.textContent = (note.items || []).map(i => i.text).join(' · ').slice(0, 80);
                if (note.type === 'ticket') snippet.textContent = (note.content || '').slice(0, 80);
                preview.appendChild(snippet);
            }

            // Info area
            const info = document.createElement('div');
            info.className = 'wb-archive-info';

            const titleRow = document.createElement('div');
            titleRow.className = 'wb-archive-title-row';
            const typeBadge = document.createElement('span');
            typeBadge.className = 'wb-archive-type-badge';
            typeBadge.textContent = TYPE_LABELS[note.type] || note.type;
            typeBadge.style.background = note.color || '#d4c9b5';
            titleRow.appendChild(typeBadge);

            // Tags
            const tagRow = document.createElement('div');
            tagRow.className = 'wb-archive-tag-row';
            (note.tag_ids || []).forEach(tid => {
                const tag = _tags.find(t => t.id === tid);
                if (!tag) return;
                const pill = document.createElement('span');
                pill.className = 'wb-archive-tag-pill';
                pill.textContent = tag.name;
                pill.style.background = tag.color || '#8492a6';
                tagRow.appendChild(pill);
            });

            info.append(titleRow, tagRow);
            card.append(cb, typeIcon, preview, info);
            list.appendChild(card);
        });

        updateSelectAll();
    }

    function updateSelectAll() {
        const filtered = getFilteredNotes();
        const allSelected = filtered.length > 0 && filtered.every(n => _selected.has(n.id));
        selAllCB.checked = allSelected;
        selAllCB.indeterminate = filtered.length > 0 && filtered.some(n => _selected.has(n.id)) && !allSelected;
    }

    // ── Event: Search / Filter ──────────────────────────────────────────────
    searchEl.addEventListener('input', render);
    tagFilter.addEventListener('change', render);
    typeFilter.addEventListener('change', render);

    // ── Event: Select all ───────────────────────────────────────────────────
    selAllCB.addEventListener('change', () => {
        const filtered = getFilteredNotes();
        if (selAllCB.checked) {
            _selectAll = true;
            _selected = new Set(filtered.map(n => n.id));
        } else {
            _selectAll = false;
            _selected.clear();
        }
        render();
    });

    // ── Event: Unarchive ────────────────────────────────────────────────────
    unarchiveBtn.addEventListener('click', async () => {
        const ids = _selectAll
            ? getFilteredNotes().map(n => n.id)
            : [..._selected];
        if (ids.length === 0) return;
        unarchiveBtn.disabled = true;
        try {
            for (const id of ids) {
                await api.notes.update(id, { archived: false });
            }
        } catch (_) {}
        _selected.clear();
        _selectAll = false;
        await loadData();
        unarchiveBtn.disabled = false;
    });

    // ── Event: ZIP download ─────────────────────────────────────────────────
    zipBtn.addEventListener('click', async () => {
        const ids = _selectAll
            ? getFilteredNotes().map(n => n.id)
            : [..._selected];
        if (ids.length === 0) return;
        const original = zipBtn.innerHTML;
        zipBtn.disabled = true;
        zipBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg> ...';
        try {
            await api.archive.downloadNotes(ids, 'archived_notes.zip');
        } catch (e) {
            console.error('[wb] archive:', e);
        } finally {
            zipBtn.disabled = false;
            zipBtn.innerHTML = original;
        }
    });

    // ── Bus ─────────────────────────────────────────────────────────────────
    const onTagsUpdate = () => {
        api.tags.list().then(t => { _tags = t; }).catch(() => {});
    };
    bus.on('tags:updated', onTagsUpdate);
    wrap.destroy = () => bus.off('tags:updated', onTagsUpdate);

    loadData();
    return wrap;
}

