/**
 * api.js  —  Thin fetch wrapper for the Workbench backend REST API.
 *
 * All methods return Promises.
 * On HTTP error, the promise rejects with an Error containing the status.
 */

async function req(url, opts = {}) {
    const hasBody = opts.body !== undefined;
    const res = await fetch(url, {
        ...opts,
        headers: {
            ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
            ...(opts.headers || {}),
        },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}: ${url}`);
    return res;
}

function json(url, opts)  { return req(url, opts).then(r => r.json()); }
function body(data)       { return JSON.stringify(data); }

export const api = {

    tools: {
        list: () => json('/api/tools'),
    },

    tags: {
        list:   ()                   => json('/api/tags'),
        create: (name, color)        => req('/api/tags', { method: 'POST', body: body({ name, color }) }),
        update: (id, data)           => json(`/api/tags/${id}`, { method: 'PUT',  body: body(data) }),
        delete: (id)                 => req(`/api/tags/${id}`, { method: 'DELETE' }),
    },

    resources: {
        list:   (tag)        => json(`/api/resources${tag ? `?tag=${encodeURIComponent(tag)}` : ''}`),
        create: (data)       => json('/api/resources',     { method: 'POST', body: body(data) }),
        update: (id, data)   => json(`/api/resources/${id}`, { method: 'PUT',  body: body(data) }),
        delete: (id)         => req(`/api/resources/${id}`, { method: 'DELETE' }),
        setTags: (id, tagIds) => req(`/api/resources/${id}/tags`, { method: 'POST', body: body({ tag_ids: tagIds }) }),
    },

    notes: {
        list: (archived = false) =>
            json(`/api/notes?archived=${archived}`),
        create: (data) =>
            json('/api/notes', { method: 'POST', body: body(data) }),
        update: (id, data) =>
            json(`/api/notes/${id}`, { method: 'PUT', body: body(data) }),
        delete: (id) =>
            req(`/api/notes/${id}`, { method: 'DELETE' }),
        uploadImage: async (id, blob) => {
            const fd = new FormData();
            fd.append('file', blob, 'image');
            const res = await fetch(`/api/notes/${id}/image`, { method: 'POST', body: fd });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json();
        },
        uploadNoteImage: async (id, blob) => {
            const fd = new FormData();
            fd.append('file', blob, 'image');
            const res = await fetch(`/api/notes/${id}/images`, { method: 'POST', body: fd });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json();
        },
        deleteNoteImage: (id, imgId) =>
            req(`/api/notes/${id}/images/${imgId}`, { method: 'DELETE' }),
    },

    archive: {
        /**
         * POST /api/archive, then trigger a browser file download.
         * @param {string[]} tagIds
         * @param {string}   filename
         */
        download: async (tagIds, filename = 'archive.zip') => {
            const res  = await req('/api/archive', {
                method: 'POST',
                body:   body({ tag_ids: tagIds, filename }),
            });
            const blob = await res.blob();
            const url  = URL.createObjectURL(blob);
            const a    = Object.assign(document.createElement('a'), {
                href: url, download: filename,
            });
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        },

        /**
         * POST /api/archive/notes, download archived notes as ZIP.
         * @param {string[]} noteIds
         * @param {string}   filename
         */
        downloadNotes: async (noteIds, filename = 'archive.zip') => {
            const res  = await req('/api/archive/notes', {
                method: 'POST',
                body:   body({ note_ids: noteIds, filename }),
            });
            const blob = await res.blob();
            const url  = URL.createObjectURL(blob);
            const a    = Object.assign(document.createElement('a'), {
                href: url, download: filename,
            });
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        },
    },
};
