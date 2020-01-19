import * as IORedis from 'ioredis';
import { ICacheLayer } from './index';

export interface IRedisLayerOptions<K, V> {
  uri: string;
  keyPrefix?: string;
  ttl?: number;

  keyFn?(key: K): string;

  serializer?(value: V): string;

  deserializer?(data: string): V | Error;
}

export default class RedisLayer<K, V> implements ICacheLayer<K, V> {
  public readonly redis: IORedis.Redis;
  private _options: Required<IRedisLayerOptions<K, V>>;

  constructor(options: IRedisLayerOptions<K, V>) {
    this.redis = new IORedis(options.uri);
    if (options.ttl !== undefined && options.ttl < 0) {
      throw new Error('ttl should be ≥ 0');
    }
    this._options = {
      ttl: Infinity,
      keyPrefix: 'cacheloader',
      keyFn: key => String(key),
      serializer(value: V): string {
        return JSON.stringify(value);
      },
      deserializer(data: string): Error | V {
        try {
          return JSON.parse(data);
        } catch (e) {
          return e;
        }
      },
      ...options,
    };
    this._parseKey = this._parseKey.bind(this);
  }

  public async batchGet(keys: readonly K[]): Promise<Array<V | Error>> {
    const results = await this.redis.mget(...keys.map(this._parseKey));
    return results.map((value, index) => {
      if (!value) {
        return new Error(`${index}: No cache.`);
      }
      return this._options.deserializer(value);
    });
  }

  public batchSet(map: Map<K, V>): void {
    if (this._options.ttl === Infinity) {
      const parsedMap = new Map<string, string>();
      map.forEach((value, key) => {
        parsedMap.set(this._parseKey(key), this._options.serializer(value));
      });
      this.redis.mset(parsedMap).catch(e => {
        console.error('Redis write failed.', e.message);
      });
    } else {
      map.forEach((value, key) => {
        this.redis.psetex(this._parseKey(key), this._options.ttl, this._options.serializer(value)).catch(e => {
          console.error('Redis write failed.', e.message);
        });
      });
    }
  }

  private _parseKey(key: K): string {
    return `${this._options.keyPrefix}.${this._options.keyFn(key)}`;
  }
}
