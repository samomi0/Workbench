/**
 * archive.js  —  Archive system panel content builder.
 * Lists archived notes with search, tag filter, type filter, and ZIP download.
 */

import { api } from '../core/api.js';
import { bus } from '../core/bus.js';

const TYPE_ICONS = {
    note:   'icon-note',
    todo:   'icon-todo',
    image:  'icon-note',
};

const TYPE_LABELS = {
    note:   '便笺',
    todo:   'Todo',
    image:  '图片',
};

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Multi-select filter dropdown.
 * The dropdown is portal-appended to <body> to escape overflow:hidden parents.
 * Supports include/exclude mode for selected values.
 */
function createMultiFilter(allLabel, options, onChange) {
    const container = document.createElement('div');
    container.className = 'wb-multi-filter';

    let selected = new Set();
    let mode = 'include';
    let opts = [...options];
    let _open = false;

    // Trigger button
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'wb-multi-filter-btn';

    // Dropdown portal — appended to <body> so it's never clipped by overflow:hidden
    const dropdown = document.createElement('div');
    dropdown.className = 'wb-multi-filter-dropdown';
    document.body.appendChild(dropdown);

    // Mode toggle row
    const modeRow = document.createElement('div');
    modeRow.className = 'wb-mf-mode-row';
    const includeBtn = document.createElement('button');
    includeBtn.type = 'button';
    includeBtn.textContent = '包含';
    includeBtn.className = 'wb-mf-mode-btn is-active';
    const excludeBtn = document.createElement('button');
    excludeBtn.type = 'button';
    excludeBtn.textContent = '排除';
    excludeBtn.className = 'wb-mf-mode-btn';
    modeRow.append(includeBtn, excludeBtn);

    const optList = document.createElement('div');
    optList.className = 'wb-mf-opt-list';

    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'wb-mf-clear';
    clearBtn.textContent = '清除';

    dropdown.append(modeRow, optList, clearBtn);
    container.appendChild(btn);

    function buildOpts() {
        optList.innerHTML = '';
        opts.forEach(opt => {
            const row = document.createElement('label');
            row.className = 'wb-mf-opt';
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.value = opt.value;
            cb.checked = selected.has(opt.value);
            const dot = document.createElement('span');
            dot.style.cssText = `display:inline-block;width:8px;height:8px;border-radius:50%;background:${opt.color || '#8492a6'};flex-shrink:0;`;
            const span = document.createElement('span');
            span.textContent = opt.label;
            row.append(cb, dot, span);
            cb.addEventListener('change', () => {
                if (cb.checked) selected.add(opt.value);
                else selected.delete(opt.value);
                updateBtn();
                onChange({ selected: new Set(selected), mode });
            });
            optList.appendChild(row);
        });
    }

    function updateBtn() {
        if (selected.size === 0) {
            btn.textContent = allLabel;
            btn.classList.remove('is-filtering', 'is-exclude');
        } else {
            const names = opts.filter(o => selected.has(o.value)).map(o => o.label);
            btn.textContent = (mode === 'exclude' ? '≠ ' : '') + names.join(',');
            btn.classList.add('is-filtering');
            btn.classList.toggle('is-exclude', mode === 'exclude');
        }
    }

    function openDropdown() {
        buildOpts();
        const rect = btn.getBoundingClientRect();
        const dropW = Math.max(rect.width, 140);
        let left = rect.left;
        if (left + dropW > window.innerWidth - 8) left = window.innerWidth - dropW - 8;
        dropdown.style.left = left + 'px';
        dropdown.style.top  = (rect.bottom + 4) + 'px';
        dropdown.style.minWidth = dropW + 'px';
        dropdown.classList.add('is-open');
        _open = true;
    }

    function closeDropdown() {
        dropdown.classList.remove('is-open');
        _open = false;
    }

    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (_open) closeDropdown();
        else openDropdown();
    });

    includeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        mode = 'include';
        includeBtn.classList.add('is-active');
        excludeBtn.classList.remove('is-active');
        updateBtn();
        onChange({ selected: new Set(selected), mode });
    });

    excludeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        mode = 'exclude';
        excludeBtn.classList.add('is-active');
        includeBtn.classList.remove('is-active');
        updateBtn();
        onChange({ selected: new Set(selected), mode });
    });

    clearBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        selected.clear();
        updateBtn();
        onChange({ selected: new Set(selected), mode });
        closeDropdown();
    });

    // Close when clicking outside both the trigger button and the dropdown
    const _docClose = (e) => {
        if (_open && !container.contains(e.target) && !dropdown.contains(e.target)) {
            closeDropdown();
        }
    };
    document.addEventListener('mousedown', _docClose);

    updateBtn();

    return {
        el: container,
        setOptions(newOpts) {
            opts = [...newOpts];
            const valid = new Set(opts.map(o => o.value));
            for (const v of [...selected]) { if (!valid.has(v)) selected.delete(v); }
            updateBtn();
        },
        getState: () => ({ selected: new Set(selected), mode }),
        destroy() {
            dropdown.remove();
            document.removeEventListener('mousedown', _docClose);
        },
    };
}

/** Format an ISO timestamp for display. */
function fmtDate(iso) {
    if (!iso) return '';
    try {
        return new Date(iso).toLocaleString('zh-CN', {
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit',
        });
    } catch (_) { return iso; }
}

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

    const tagFilter  = createMultiFilter('全部标签', [], () => render());
    const typeFilter = createMultiFilter('全部类型', [], () => render());

    const zipBtn = document.createElement('button');
    zipBtn.className = 'wb-syspanel-btn';
    zipBtn.title     = '下载 ZIP';
    zipBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <use href="/assets/icons/sprite.svg#icon-download"/>
    </svg> ZIP`;

    toolbar.append(searchEl, tagFilter.el, typeFilter.el, zipBtn);

    // ── Attribute filter toggle buttons (image / link) ───────────────────
    const attrRow = document.createElement('div');
    attrRow.className = 'wb-archive-attr-row';

    const mkAttrBtn = (attr, label, iconSvg) => {
        const btn = document.createElement('button');
        btn.className = 'wb-attr-btn';
        btn.dataset.attr  = attr;
        btn.dataset.state = 'any';
        btn.title = `${label}: 不限`;
        btn.innerHTML = `${iconSvg}<span class="wb-attr-label">${label}</span>`;
        btn.addEventListener('click', () => {
            const states = ['any', 'has', 'none'];
            const idx = states.indexOf(btn.dataset.state);
            btn.dataset.state = states[(idx + 1) % 3];
            btn.classList.toggle('is-has',  btn.dataset.state === 'has');
            btn.classList.toggle('is-none', btn.dataset.state === 'none');
            const tips = { any: `${label}: 不限`, has: `${label}: 有`, none: `${label}: 无` };
            btn.title = tips[btn.dataset.state];
            render();
        });
        return btn;
    };

    const imgBtn = mkAttrBtn('img', '图片',
        `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`);
    const linkBtn = mkAttrBtn('link', '链接',
        `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`);

    attrRow.append(imgBtn, linkBtn);

    // ── Date range filter ──────────────────────────────────────────────────
    const dateRow = document.createElement('div');
    dateRow.className = 'wb-archive-date-row';
    const fromLbl = document.createElement('span');
    fromLbl.className = 'wb-archive-date-label';
    fromLbl.textContent = '从';
    const fromDate = document.createElement('input');
    fromDate.type = 'date';
    fromDate.className = 'wb-archive-date-input';
    fromDate.title = '创建时间起始';
    const toLbl = document.createElement('span');
    toLbl.className = 'wb-archive-date-label';
    toLbl.textContent = '至';
    const toDate = document.createElement('input');
    toDate.type = 'date';
    toDate.className = 'wb-archive-date-input';
    toDate.title = '创建时间截止';
    const dateClearBtn = document.createElement('button');
    dateClearBtn.type = 'button';
    dateClearBtn.className = 'wb-archive-date-clear';
    dateClearBtn.textContent = '×';
    dateClearBtn.title = '清除日期筛选';
    dateClearBtn.addEventListener('click', () => { fromDate.value = ''; toDate.value = ''; render(); });
    dateRow.append(fromLbl, fromDate, toLbl, toDate, dateClearBtn);

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

    wrap.append(toolbar, attrRow, dateRow, selRow, listWrap);

    // ── Refresh: load data & render ────────────────────────────────────────
    async function loadData() {
        try { _notes = await api.notes.list(true); } catch (_) { _notes = []; }
        try { _tags  = await api.tags.list();     } catch (_) { _tags  = []; }
        renderFilters();
        render();
    }

    function renderFilters() {
        // Tag filter
        tagFilter.setOptions(_tags.map(t => ({ value: t.id, label: t.name, color: t.color })));

        // Type filter
        typeFilter.setOptions(
            ['note', 'todo'].map(t => ({ value: t, label: TYPE_LABELS[t] }))
        );
    }

    // ── Detail modal ─────────────────────────────────────────────────────
    function showDetail(note) {
        const overlay = document.createElement('div');
        overlay.className = 'wb-archive-modal-overlay';
        const modal = document.createElement('div');
        modal.className = 'wb-archive-modal';

        // Head
        const mHead = document.createElement('div');
        mHead.className = 'wb-archive-modal-head';
        const mBadge = document.createElement('span');
        mBadge.className = 'wb-archive-type-badge';
        mBadge.textContent = TYPE_LABELS[note.type] || note.type;
        mBadge.style.background = note.color || '#d4c9b5';
        const mClose = document.createElement('button');
        mClose.type = 'button';
        mClose.className = 'wb-archive-modal-close';
        mClose.textContent = '×';
        mClose.addEventListener('click', () => overlay.remove());
        mHead.append(mBadge, mClose);

        // Body
        const mBody = document.createElement('div');
        mBody.className = 'wb-archive-modal-body';

        const mkField = (label, valueText) => {
            const f = document.createElement('div');
            f.className = 'wb-archive-modal-field';
            const lbl = document.createElement('div');
            lbl.className = 'wb-archive-modal-label';
            lbl.textContent = label;
            const val = document.createElement('div');
            val.className = 'wb-archive-modal-value';
            val.textContent = valueText || '(空)';
            f.append(lbl, val);
            return f;
        };

        if (note.type === 'note') {
            mBody.appendChild(mkField('内容', note.text));
        } else if (note.type === 'todo') {
            const items = (note.items || []).map(i => `${i.done ? '✓' : '○'} ${i.text}`).join('\n');
            mBody.appendChild(mkField('待办', items));
        }

        if ((note.tag_ids || []).length > 0) {
            const tf = document.createElement('div');
            tf.className = 'wb-archive-modal-field';
            const tl = document.createElement('div');
            tl.className = 'wb-archive-modal-label';
            tl.textContent = '标签';
            const tr = document.createElement('div');
            tr.className = 'wb-archive-tag-row';
            (note.tag_ids || []).forEach(tid => {
                const tag = _tags.find(t => t.id === tid);
                if (!tag) return;
                const pill = document.createElement('span');
                pill.className = 'wb-archive-tag-pill';
                pill.style.background = tag.color || '#8492a6';
                pill.textContent = tag.name;
                tr.appendChild(pill);
            });
            tf.append(tl, tr);
            mBody.appendChild(tf);
        }

        // Created at (editable)
        const caf = document.createElement('div');
        caf.className = 'wb-archive-modal-field';
        const cal = document.createElement('div');
        cal.className = 'wb-archive-modal-label';
        cal.textContent = '创建时间';
        const caWrap = document.createElement('div');
        caWrap.style.cssText = 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;';
        const caInput = document.createElement('input');
        caInput.type = 'datetime-local';
        caInput.className = 'wb-archive-modal-ts-input';
        if (note.created_at) {
            const d = new Date(note.created_at);
            caInput.value = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
        }
        const caSave = document.createElement('button');
        caSave.type = 'button';
        caSave.className = 'wb-archive-modal-save-btn';
        caSave.textContent = '保存';
        caSave.addEventListener('click', async () => {
            if (!caInput.value) return;
            const newTs = new Date(caInput.value).toISOString();
            try {
                await api.notes.update(note.id, { created_at: newTs });
                note.created_at = newTs;
                const card = list.querySelector(`.wb-archive-card[data-note-id="${note.id}"]`);
                if (card) {
                    const tsEl = card.querySelector('.wb-archive-ts');
                    if (tsEl) tsEl.textContent = fmtDate(newTs);
                    else {
                        const newTsEl = document.createElement('div');
                        newTsEl.className = 'wb-archive-ts';
                        newTsEl.textContent = fmtDate(newTs);
                        card.querySelector('.wb-archive-info')?.appendChild(newTsEl);
                    }
                }
            } catch (e) { console.error('Failed to update timestamp', e); }
        });
        caWrap.append(caInput, caSave);
        caf.append(cal, caWrap);
        mBody.appendChild(caf);

        if (note.updated_at) {
            mBody.appendChild(mkField('最后修改', fmtDate(note.updated_at)));
        }

        modal.append(mHead, mBody);
        overlay.appendChild(modal);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
        document.body.appendChild(overlay);
    }

    /** Parse the active attribute filter state from the toggle buttons.
     *  Returns { img: 'any'|'has'|'none', link: 'any'|'has'|'none' } */
    function getAttrFilters() {
        const imgBtn  = wrap.querySelector('.wb-attr-btn[data-attr="img"]');
        const linkBtn = wrap.querySelector('.wb-attr-btn[data-attr="link"]');
        return {
            img:  imgBtn  ? (imgBtn.dataset.state  || 'any') : 'any',
            link: linkBtn ? (linkBtn.dataset.state || 'any') : 'any',
        };
    }

    function getFilteredNotes() {
        const q      = searchEl.value.toLowerCase();
        const tagSt  = tagFilter.getState();
        const typeSt = typeFilter.getState();
        const attrs  = getAttrFilters();
        const from   = fromDate.value ? new Date(fromDate.value) : null;
        const to     = toDate.value   ? new Date(toDate.value + 'T23:59:59') : null;

        return _notes.filter(n => {
            if (q) {
                const text = n.text || n.content || '';
                const itemsText = (n.items || []).map(i => i.text || '').join(' ');
                const linksText = (n.links || []).map(l => `${l.label || ''} ${l.url || ''}`).join(' ');
                if (!(`${text} ${itemsText} ${linksText}`.toLowerCase().includes(q))) return false;
            }

            // Tag filter (multi-select with include/exclude)
            if (tagSt.selected.size > 0) {
                const hasAny = (n.tag_ids || []).some(tid => tagSt.selected.has(tid));
                if (tagSt.mode === 'include' && !hasAny) return false;
                if (tagSt.mode === 'exclude' &&  hasAny) return false;
            }

            // Type filter (multi-select with include/exclude)
            if (typeSt.selected.size > 0) {
                const matches = typeSt.selected.has(n.type);
                if (typeSt.mode === 'include' && !matches) return false;
                if (typeSt.mode === 'exclude' &&  matches) return false;
            }

            // Attribute: image filter
            if (attrs.img !== 'any') {
                const hasImg = (n.type === 'image' && n.image_ext) ||
                               (n.type === 'note' && (n.images || []).length > 0);
                if (attrs.img === 'has'  && !hasImg) return false;
                if (attrs.img === 'none' &&  hasImg) return false;
            }

            // Attribute: link filter (only applies to note type)
            if (attrs.link !== 'any') {
                const hasLink = n.type === 'note' && (n.links || []).length > 0;
                if (attrs.link === 'has'  && !hasLink) return false;
                if (attrs.link === 'none' &&  hasLink) return false;
            }

            // Date range filter (based on created_at)
            if (from || to) {
                const nd = n.created_at ? new Date(n.created_at) : null;
                if (!nd) return false;
                if (from && nd < from) return false;
                if (to   && nd > to)   return false;
            }

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
                pill.style.background = tag.color || '#8492a6';
                // Tag icon
                const tagIcon = document.createElementNS(SVG_NS, 'svg');
                tagIcon.setAttribute('viewBox', '0 0 24 24');
                tagIcon.setAttribute('width', '8');
                tagIcon.setAttribute('height', '8');
                tagIcon.setAttribute('fill', 'none');
                tagIcon.setAttribute('stroke', 'currentColor');
                tagIcon.setAttribute('stroke-width', '2.5');
                tagIcon.setAttribute('stroke-linecap', 'round');
                tagIcon.setAttribute('stroke-linejoin', 'round');
                const tu = document.createElementNS(SVG_NS, 'use');
                tu.setAttribute('href', '/assets/icons/sprite.svg#icon-tag');
                tagIcon.appendChild(tu);
                const tagName = document.createElement('span');
                tagName.textContent = tag.name;
                pill.append(tagIcon, tagName);
                tagRow.appendChild(pill);
            });

            // Link pills in archive card
            const links = (note.type === 'note' && Array.isArray(note.links)) ? note.links : [];
            if (links.length > 0) {
                const linkRow = document.createElement('div');
                linkRow.className = 'wb-archive-link-row';
                links.slice(0, 3).forEach(link => {
                    const lPill = document.createElement('span');
                    lPill.className = 'wb-archive-link-pill';
                    lPill.title = link.url;
                    const lIcon = document.createElementNS(SVG_NS, 'svg');
                    lIcon.setAttribute('viewBox', '0 0 24 24');
                    lIcon.setAttribute('width', '8');
                    lIcon.setAttribute('height', '8');
                    lIcon.setAttribute('fill', 'none');
                    lIcon.setAttribute('stroke', 'currentColor');
                    lIcon.setAttribute('stroke-width', '2.5');
                    lIcon.setAttribute('stroke-linecap', 'round');
                    lIcon.setAttribute('stroke-linejoin', 'round');
                    const lu = document.createElementNS(SVG_NS, 'use');
                    lu.setAttribute('href', '/assets/icons/sprite.svg#icon-link');
                    lIcon.appendChild(lu);
                    const lName = document.createElement('span');
                    lName.textContent = link.label || link.url;
                    lPill.append(lIcon, lName);
                    linkRow.appendChild(lPill);
                });
                if (links.length > 3) {
                    const more = document.createElement('span');
                    more.className = 'wb-archive-link-more';
                    more.textContent = `+${links.length - 3}`;
                    linkRow.appendChild(more);
                }
                info.append(titleRow, tagRow, linkRow);
            } else {
                info.append(titleRow, tagRow);
            }
            if (note.created_at) {
                const tsEl = document.createElement('div');
                tsEl.className = 'wb-archive-ts';
                tsEl.textContent = fmtDate(note.created_at);
                info.appendChild(tsEl);
            }
            card.dataset.noteId = note.id;
            card.style.cursor = 'pointer';
            card.addEventListener('click', (e) => {
                if (e.target.closest('.wb-archive-card-cb')) return;
                showDetail(note);
            });
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

    // ── Event: Search ────────────────────────────────────────────────────────
    searchEl.addEventListener('input', render);    fromDate.addEventListener('change', render);
    toDate.addEventListener('change', render);
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
    wrap.destroy = () => {
        bus.off('tags:updated', onTagsUpdate);
        tagFilter.destroy();
        typeFilter.destroy();
    };

    loadData();
    return wrap;
}

