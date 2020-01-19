import Timeout = NodeJS.Timeout;
import * as Debug from 'debug';

const debug = Debug('LayeredCacheLoader:TTLMap');

export default class TTLMap<K, V> extends Map<K, V> {
  private _ttls: Map<K, NodeJS.Timeout>;

  constructor(entries?: ReadonlyArray<readonly [K, V]> | null) {
    super(entries);
    this._ttls = new Map<K, Timeout>();
  }

  public setTTL(key: K, value: V, ttl: number): this {
    super.set(key, value);
    this._clearTimer(key);
    if (Number.isSafeInteger(ttl)) {
      this._ttls.set(key, setTimeout(() => {
        debug(`TTL: ${key}`);
        this._clearTimer(key);
      }, ttl));
    }
    return this;
  }

  public delete(key: K): boolean {
    this._clearTimer(key);
    return super.delete(key);
  }

  public clear(): void {
    this._clearAllTimers();
    return super.clear();
  }

  private _clearTimer(key: K) {
    const timer = this._ttls.get(key);
    if (timer !== undefined) {
      this._ttls.delete(key);
      super.delete(key);
      clearTimeout(timer);
    }
  }

  private _clearAllTimers() {
    this._ttls.forEach(value => clearTimeout(value));
    this._ttls.clear();
  }
}
