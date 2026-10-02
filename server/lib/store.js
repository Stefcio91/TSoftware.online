// Magazyn danych: pliki JSON w DATA_DIR (leads.json, magnet.json, settings.json, posts.json)
// z kopią w pamięci i atomowym zapisem (plik tymczasowy + rename).

import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { DEFAULT_SETTINGS } from './config.js';
import { mergeSettings } from './settings.js';
import { isPlainObject, clone } from './util.js';

export class Store {
  #dir;
  #log;
  /** Łańcuch zapisów per plik (serializacja). */
  #queue = new Map();
  /** Pliki, dla których zapis już czeka w kolejce (koalescencja zmian). */
  #pending = new Set();

  leads = [];
  magnet = [];
  /** Wpisy bloga; logika (walidacja, CRUD, licznik odsłon) jest w posts.js. */
  posts = [];
  settings = clone(DEFAULT_SETTINGS);

  constructor(dir, log = console) {
    this.#dir = dir;
    this.#log = log;
  }

  get dir() {
    return this.#dir;
  }

  async init() {
    await fsp.mkdir(this.#dir, { recursive: true });
    const leads = await this.#load('leads');
    this.leads = Array.isArray(leads) ? leads : [];
    const magnet = await this.#load('magnet');
    this.magnet = Array.isArray(magnet) ? magnet : [];
    const posts = await this.#load('posts');
    this.posts = Array.isArray(posts) ? posts : [];
    const settings = await this.#load('settings');
    this.settings = mergeSettings(DEFAULT_SETTINGS, isPlainObject(settings) ? settings : {}).settings;
  }

  #file(name) {
    return path.join(this.#dir, `${name}.json`);
  }

  #data(name) {
    if (name === 'leads') return this.leads;
    if (name === 'magnet') return this.magnet;
    if (name === 'posts') return this.posts;
    return this.settings;
  }

  async #load(name) {
    const file = this.#file(name);
    let text;
    try {
      text = await fsp.readFile(file, 'utf8');
    } catch (err) {
      if (err.code === 'ENOENT') return undefined;
      throw err;
    }
    try {
      return JSON.parse(text);
    } catch (err) {
      // Nie nadpisujemy uszkodzonego pliku: odkładamy go obok i startujemy z pustym.
      const backup = `${file}.uszkodzony-${Date.now()}`;
      this.#log.error(`[store] ${file}: nieprawidłowy JSON (${err.message}); przenoszę do ${backup}`);
      await fsp.rename(file, backup);
      return undefined;
    }
  }

  /** Planuje zapis pliku; kolejne wywołania przed startem zapisu są scalane. */
  persist(name) {
    if (this.#pending.has(name)) return this.#queue.get(name);
    this.#pending.add(name);
    const prev = this.#queue.get(name) || Promise.resolve();
    const next = prev
      .then(async () => {
        this.#pending.delete(name);
        await this.#write(name);
      })
      .catch((err) => this.#log.error(`[store] zapis ${name}.json nie powiódł się: ${err.message}`));
    this.#queue.set(name, next);
    return next;
  }

  async #write(name) {
    const file = this.#file(name);
    const tmp = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
    const json = JSON.stringify(this.#data(name), null, 2);
    try {
      await fsp.writeFile(tmp, json, { encoding: 'utf8', mode: 0o600 });
      await fsp.rename(tmp, file);
    } catch (err) {
      await fsp.rm(tmp, { force: true }).catch(() => {});
      throw err;
    }
  }

  /** Czeka na zakończenie wszystkich zaplanowanych zapisów (przy zamykaniu). */
  async flush() {
    await Promise.all([...this.#queue.values()]);
  }

  /** Sekret sesji: z pliku DATA_DIR/secret albo wygenerowany raz i zapisany. */
  async loadOrCreateSecret() {
    const file = path.join(this.#dir, 'secret');
    try {
      const existing = (await fsp.readFile(file, 'utf8')).trim();
      if (existing.length >= 32) return existing;
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
    const secret = crypto.randomBytes(32).toString('hex');
    await fsp.writeFile(file, secret + '\n', { encoding: 'utf8', mode: 0o600 });
    return secret;
  }

  // ---- leady ----

  addLead(item) {
    this.leads.push(item);
    this.persist('leads');
    return item;
  }

  getLead(id) {
    return this.leads.find((l) => l.id === id) || null;
  }

  updateLead(id, patch) {
    const lead = this.getLead(id);
    if (!lead) return null;
    Object.assign(lead, patch);
    this.persist('leads');
    return lead;
  }

  removeLead(id) {
    const i = this.leads.findIndex((l) => l.id === id);
    if (i < 0) return false;
    this.leads.splice(i, 1);
    this.persist('leads');
    return true;
  }

  // ---- lead magnet ----

  /** Zapis e-maila; duplikat (bez względu na wielkość liter) tylko odświeża `ts`. */
  upsertMagnet({ email, name, marketing, ip }) {
    const key = email.toLowerCase();
    const ts = new Date().toISOString();
    const existing = this.magnet.find((m) => String(m.email).toLowerCase() === key);
    if (existing) {
      existing.ts = ts;
      if (name) existing.name = name;
      if (marketing) existing.marketing = true;
      if (ip) existing.ip = ip;
      this.persist('magnet');
      return { item: existing, created: false };
    }
    const item = { id: crypto.randomUUID(), ts, email, name: name || '', marketing: !!marketing, ip: ip || '' };
    this.magnet.push(item);
    this.persist('magnet');
    return { item, created: true };
  }

  removeMagnet(id) {
    const i = this.magnet.findIndex((m) => m.id === id);
    if (i < 0) return false;
    this.magnet.splice(i, 1);
    this.persist('magnet');
    return true;
  }

  // ---- ustawienia ----

  setSettings(settings) {
    this.settings = settings;
    this.persist('settings');
    return settings;
  }
}
