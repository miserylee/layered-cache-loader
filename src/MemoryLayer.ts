import { ICacheLayer } from './index';
import TTLMap from './TTLMap';

export interface IMemoryLayerOptions<K, V, CK> {
  ttl?: number;

  keyFn?(key: K): CK;
}

export default class MemoryLayer<K, V, CK = K> implements ICacheLayer<K, V> {
  public get map() {
    return this._map;
  }

  private _map = new TTLMap<CK, V>();
  private _options: Required<IMemoryLayerOptions<K, V, CK>>;

  constructor(options: IMemoryLayerOptions<K, V, CK> = {}) {
    this._options = {
      ttl: Infinity,
      keyFn(key: K): CK {
        return key as unknown as CK;
      },
      ...options,
    };
  }

  public async batchGet(keys: readonly K[]): Promise<Array<V | Error>> {
    return keys.map(key => {
      const value = this._map.get(this._options.keyFn(key));
      if (!value) {
        return new Error(`No cache value of key: ${key}`);
      }
      return value;
    });
  }

  public async batchSet(map: Map<K, V>) {
    map.forEach((value, key) => {
      this._map.setTTL(this._options.keyFn(key), value, this._options.ttl);
    });
  }
}
