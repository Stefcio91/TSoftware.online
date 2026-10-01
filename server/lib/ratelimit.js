// Limity żądań w pamięci: okno przesuwne (lista znaczników czasu) per klucz, np. "lead:1.2.3.4".

export class RateLimiter {
  #buckets = new Map();
  #timer = null;

  constructor({ sweepMs = 60_000 } = {}) {
    if (sweepMs > 0) {
      this.#timer = setInterval(() => this.sweep(), sweepMs);
      this.#timer.unref();
    }
  }

  #bucket(key, windowMs) {
    const now = Date.now();
    let b = this.#buckets.get(key);
    if (!b) {
      b = { hits: [], windowMs };
      this.#buckets.set(key, b);
    }
    b.windowMs = windowMs;
    b.hits = b.hits.filter((t) => t > now - windowMs);
    return b;
  }

  /** Czy klucz mieści się jeszcze w limicie (nie zalicza próby). */
  check(key, limit, windowMs) {
    const b = this.#bucket(key, windowMs);
    if (b.hits.length >= limit) {
      const retryAfter = Math.max(1, Math.ceil((b.hits[0] + windowMs - Date.now()) / 1000));
      return { ok: false, retryAfter };
    }
    return { ok: true };
  }

  /** Zalicza próbę; `{ok:false, retryAfter}` gdy limit został przekroczony. */
  hit(key, limit, windowMs) {
    const result = this.check(key, limit, windowMs);
    if (result.ok) this.#buckets.get(key).hits.push(Date.now());
    return result;
  }

  /** Usuwa klucze bez aktywnych wpisów (wywoływane okresowo). */
  sweep() {
    const now = Date.now();
    for (const [key, b] of this.#buckets) {
      if (!b.hits.length || b.hits[b.hits.length - 1] <= now - b.windowMs) this.#buckets.delete(key);
    }
  }

  stop() {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = null;
  }
}
