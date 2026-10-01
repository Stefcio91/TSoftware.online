// Ustawienia serwisu: scalanie z domyślnymi, walidacja, maskowanie sekretów,
// publiczny podzbiór dla strony (GET /api/config).

import { DEFAULT_SETTINGS } from './config.js';
import { isPlainObject, clone } from './util.js';

export const MASK = '••••';
const MAX_STRING = 500;
/** Klucze w `notify`, których wartości są maskowane w odpowiedziach API. */
const SECRET_KEYS = ['webhookUrl', 'telegramToken'];

/**
 * Nakłada `patch` na `base`, akceptując tylko klucze znane z DEFAULT_SETTINGS
 * (nieznane są ignorowane) i pilnując typów: liczby ≥ 0, teksty ≤ 500 znaków,
 * boolean. Wartości zamaskowane ("••••…") nie nadpisują zapisanych sekretów.
 * strict=true → błędy trafiają do `errors`; strict=false → złe wartości są pomijane.
 */
export function mergeSettings(base, patch, { strict = false } = {}) {
  const settings = clone(base);
  const errors = [];
  walk(DEFAULT_SETTINGS, settings, patch, '', errors, strict);
  return { settings, errors };
}

function walk(schema, target, patch, prefix, errors, strict) {
  if (!isPlainObject(patch)) {
    if (strict) errors.push(`${prefix || 'ustawienia'}: oczekiwano obiektu`);
    return;
  }
  for (const key of Object.keys(schema)) {
    if (!Object.hasOwn(patch, key)) continue;
    const def = schema[key];
    const val = patch[key];
    const label = prefix ? `${prefix}.${key}` : key;

    if (isPlainObject(def)) {
      if (!isPlainObject(target[key])) target[key] = clone(def);
      walk(def, target[key], val, label, errors, strict);
    } else if (typeof def === 'number') {
      if (typeof val === 'number' && Number.isFinite(val) && val >= 0) target[key] = val;
      else if (strict) errors.push(`${label}: oczekiwano liczby ≥ 0`);
    } else if (typeof def === 'string') {
      if (typeof val === 'string' && val.length <= MAX_STRING) {
        if (!val.startsWith(MASK)) target[key] = val;
      } else if (strict) errors.push(`${label}: oczekiwano tekstu (max ${MAX_STRING} znaków)`);
    } else if (typeof def === 'boolean') {
      if (typeof val === 'boolean') target[key] = val;
      else if (strict) errors.push(`${label}: oczekiwano true/false`);
    }
  }
}

/** Pełne ustawienia z zamaskowanymi sekretami ("••••" + 4 ostatnie znaki). */
export function maskSettings(settings) {
  const out = clone(settings);
  if (isPlainObject(out.notify)) {
    for (const key of SECRET_KEYS) {
      const v = out.notify[key];
      if (typeof v === 'string' && v) out.notify[key] = MASK + v.slice(-4);
    }
  }
  return out;
}

/** Publiczny podzbiór ustawień, który czyta strona (bez `notify`). */
export function publicConfig(settings) {
  const s = clone(settings);
  return {
    plans: s.plans,
    configurator: s.configurator,
    contact: s.contact,
    features: s.features,
    theme: s.theme,
    magnet: { title: s.magnet.title, url: s.magnet.url, enabled: s.magnet.enabled },
  };
}
