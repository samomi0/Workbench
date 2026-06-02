/**
 * bus.js  —  Minimal pub/sub event bus (singleton per module).
 *
 * Usage:
 *   import { bus } from '/assets/js/core/bus.js';
 *   bus.on('tags:updated', handler);
 *   bus.emit('tags:updated', payload);
 *   bus.off('tags:updated', handler);
 */

class Bus {
    constructor() {
        this._map = new Map();
    }

    on(event, handler) {
        if (!this._map.has(event)) this._map.set(event, new Set());
        this._map.get(event).add(handler);
        return this;
    }

    off(event, handler) {
        this._map.get(event)?.delete(handler);
        return this;
    }

    emit(event, data) {
        for (const h of (this._map.get(event) ?? [])) {
            try { h(data); } catch (e) { console.error('[bus]', event, e); }
        }
        return this;
    }

    once(event, handler) {
        const wrapper = (data) => { handler(data); this.off(event, wrapper); };
        return this.on(event, wrapper);
    }
}

export const bus = new Bus();
