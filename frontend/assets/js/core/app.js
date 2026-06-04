/**
 * app.js  —  Workbench application bootstrap.
 * Entry point loaded by index.html as <script type="module">.
 */

import { bus }                 from './bus.js';
import { api }                 from './api.js';
import { RadialMenu }          from '../ui/radial-menu.js';
import { PanelManager }        from '../ui/panel.js';
import { StickyBoard }         from '../ui/sticky-board.js';
import { NavDock }             from '../ui/nav-dock.js';
import { buildTagsContent }    from '../ui/tags.js';
import { buildArchiveContent } from '../ui/archive.js';

// ── Capture Ctrl+S globally (prevent browser save dialog) ────────────────────
document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 's') e.preventDefault();
});

// ── DOM references ────────────────────────────────────────────────────────────
const canvas       = document.getElementById('wb-canvas');
const hint         = document.getElementById('wb-hint');
const pageFrame    = document.getElementById('wb-page-frame');
const eventCapture = document.getElementById('wb-event-capture');

// ── Event-capture helpers ─────────────────────────────────────────────────────
// The event-capture layer sits above the page iframe but below panels/menus.
// Enabled immediately when a middle-click opens the menu inside an iframe so
// that mousemove / mouseup events reach the parent document.

function enableCapture() {
    if (eventCapture) eventCapture.style.pointerEvents = 'auto';
}

function disableCapture() {
    if (eventCapture) eventCapture.style.pointerEvents = 'none';
}

// ── Singletons ────────────────────────────────────────────────────────────────
const panels = new PanelManager(canvas);

// Store tools for page-switching (populated in init())
let _tools = [];

const menu = new RadialMenu({
    canvas,
    onClose: disableCapture,
    onAltOpen: (x, y) => {
        // Alt+middle-click → show page-switching radial menu
        const items = [
            { id: '_home', _home: true, icon: 'icon-note', name: '便签本', label: '便签本', action: () => switchPage({ id: '_home', _home: true, icon: 'icon-note', name: '便签本' }) },
            ..._tools.map(t => ({
                ...t,
                label: t.name,
                action: () => switchPage(t),
            })),
        ];
        menu.open(x, y, items);
    },
});

const board = new StickyBoard(canvas, {
    onOpenTags:    openTagsPanel,
    onOpenArchive: openArchivePanel,
});

// NavDock – draggable search pill for page switching (bottom-left)
const dock = new NavDock({
    onSelect: (item) => switchPage(item),
});

// ── Relay middle-click mouse events from page iframes to the radial menu ──────
window.addEventListener('message', (e) => {
    if (!e.data || typeof e.data !== 'object') return;
    const d = e.data;

    if (d.type === 'iframe-mousedown' && d.button === 1) {
        enableCapture(); // immediately – menu opens on press
        menu.handleMousedown(d.x, d.y, !!d.altKey);

    } else if (d.type === 'iframe-mouseup' && d.button === 1) {
        disableCapture();
        menu.handleMouseup(d.x, d.y);

    } else if (d.type === 'iframe-mousemove') {
        menu.handleMousemove(d.x, d.y);
    }
});

// ── Page state ────────────────────────────────────────────────────────────────
let _currentPage = null;

// ── Default radial items (sticky-notes home view) ─────────────────────────────
function homeRadialItems() {
    const items = [
        { id: 'new-note',   icon: 'icon-note',   label: '新建便笺', action: () => board.createNote(menu.openPos, 'note') },
        { id: 'new-todo',   icon: 'icon-todo',   label: 'Todo',     action: () => board.createNote(menu.openPos, 'todo') },
        { id: 'new-ticket', icon: 'icon-ticket', label: '工单',     action: () => board.createNote(menu.openPos, 'ticket') },
    ];
    const archiveTool = _tools.find(t => t.id === 'archive-view');
    const tagTool     = _tools.find(t => t.id === 'tag-manager');
    if (archiveTool) items.push({ ...archiveTool, label: archiveTool.name, action: () => switchPage(archiveTool) });
    if (tagTool)     items.push({ ...tagTool,     label: tagTool.name,     action: () => switchPage(tagTool) });
    return items;
}

// ── Send postMessage to the current page iframe ───────────────────────────────
function sendToPage(msg) {
    if (pageFrame && pageFrame.contentWindow) {
        pageFrame.contentWindow.postMessage(msg, '*');
    }
}


// ── Switch page: home (sticky notes) or an iframe tool ───────────────────────
function switchPage(tool) {
    _currentPage = tool;

    if (tool._home) {
        // Return to sticky-notes canvas
        pageFrame.style.display = 'none';
        pageFrame.src = '';
        board.show();
        menu.setItems(homeRadialItems());
        dock.setActive('_home');
    } else {
        // Load tool in full-screen iframe
        board.hide();
        pageFrame.style.display = '';
        pageFrame.src = `/tools/${tool.id}/`;
        menu.setItems([]);
        dock.setActive(tool.id);
    }

    hint.classList.add('is-hidden');
}


// ── Hint visibility for panels ────────────────────────────────────────────────
function syncHint() {
    hint.classList.toggle('is-hidden', panels.count() > 0 || !!_currentPage);
}

// ── Default panel spawn position ─────────────────────────────────────────────
function spawnPos(w, h) {
    const offset = panels.count() * 24;
    return {
        x: Math.round((window.innerWidth  - w) / 2 + offset),
        y: Math.round((window.innerHeight - h) / 2 + offset),
    };
}

// ── System panel open actions ─────────────────────────────────────────────────

function openTagsPanel() {
    if (panels.has('__tags')) { panels.get('__tags').focus(); return; }
    const content = buildTagsContent();
    panels.open('__tags', {
        title:   'Tags',
        icon:    'icon-tag',
        content,
        width:   300,
        height:  380,
        x: 40, y: 60,
        onClose: () => { content.destroy?.(); syncHint(); },
    });
    syncHint();
}

function openArchivePanel() {
    if (panels.has('__archive')) { panels.get('__archive').focus(); return; }
    const content = buildArchiveContent();
    panels.open('__archive', {
        title:   'Archive',
        icon:    'icon-archive',
        content,
        width:   480,
        height:  520,
        x: 60, y: 80,
        onClose: () => { content.destroy?.(); syncHint(); },
    });
    syncHint();
}

// ── Initialise ────────────────────────────────────────────────────────────────

async function init() {
    // Hide iframe; sticky-notes canvas is the default view
    pageFrame.style.display = 'none';
    hint.classList.add('is-hidden');

    // Default radial menu (home = sticky notes)
    menu.setItems(homeRadialItems());

    // Global Ctrl+V paste → create image note on sticky board
    document.addEventListener('paste', async (e) => {
        if (_currentPage) return;
        // Ignore if user is typing in a focusable element (input / textarea / contenteditable)
        const tag = document.activeElement?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        if (document.activeElement?.isContentEditable) return;

        const items = Array.from(e.clipboardData?.items || []);
        const imgItem = items.find(it => it.type.startsWith('image/'));
        if (imgItem) {
            e.preventDefault();
            const blob = imgItem.getAsFile();
            if (blob) {
                const cx = Math.round(window.innerWidth  / 2);
                const cy = Math.round(window.innerHeight / 2);
                await board.createImageNote({ x: cx, y: cy }, blob);
            }
        }
    });

    let tools = [];
    try {
        const res = await fetch('/api/tools');
        if (res.ok) tools = await res.json();
    } catch (_) {}

    // Store tools for Alt+middle-click page-switching radial menu
    _tools = tools;

    // Refresh home radial items now that tools are known
    menu.setItems(homeRadialItems());

    // Populate nav-dock with home + tools
    const homeItem = { id: '_home', _home: true, icon: 'icon-note', name: '便签本', label: '便签本' };
    dock.setItems([homeItem, ...tools.map(t => ({ ...t, label: t.name }))]);
    dock.setActive('_home');
}

init();

