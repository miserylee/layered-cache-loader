import DataLoader = require('dataloader');
import { BatchLoadFn } from 'dataloader';
import * as Debug from 'debug';

const debug = Debug('LayeredCacheLoader');

export interface ICacheLayer<K, V> {
  batchGet(keys: readonly K[]): Promise<Array<V | Error>>;

  batchSet(map: Map<K, V>): void;
}

class EmptyLayer<K, V> implements ICacheLayer<K, V> {
  public async batchGet(keys: K[]): Promise<Array<V | Error>> {
    return keys.map(key => new Error(`${key}: value not found.`));
  }

  public batchSet(map: Map<K, V>) {
    // noop.
  }
}

interface ILoaderChain<K, V> {
  loader: DataLoader<K, V>;
  nextLoader?: DataLoader<K, V>;
}

export default class LayeredCacheLoader<K, V> {
  private get _loader() {
    return this._loaderChain[0].loader;
  }

  private _loaderChain: Array<ILoaderChain<K, V>> = [];
  private _finalLoader: DataLoader<K, V, K> = new DataLoader<K, V, K>(async keys => {
    throw new Error(`Failed load keys: ${keys}. A final loader should set.`);
  });

  constructor() {
    this.use(new EmptyLayer());
  }

  public use(layer: ICacheLayer<K, V>) {
    const layerName = `${layer.constructor.name}_${this._loaderChain.length}`;
    debug('Use layer:', layerName);
    const currentLoader: ILoaderChain<K, V> = {
      loader: new DataLoader<K, V>(async keys => {
        currentLoader.loader.clearAll();
        debug(`[${layerName}]Begin batch get keys:`, keys);
        try {
          const results = await layer.batchGet(keys);
          const newCacheMap = new Map<K, V>();
          const finalResults = await Promise.all(results.map(async (result, index) => {
            if (result instanceof Error) {
              const key = keys[index];
              try {
                const value = await (currentLoader.nextLoader || this._finalLoader).load(key);
                newCacheMap.set(key, value);
                return value;
              } catch (e) {
                throw e;
              }
            }
            return result;
          }));
          if (newCacheMap.size > 0) {
            debug(`[${layerName}]Cache keys from next layer:`, newCacheMap.keys());
            layer.batchSet(newCacheMap);
          }
          return finalResults;
        } catch (e) {
          throw e;
        }
      }),
    };
    const prevLoader = this._loaderChain[this._loaderChain.length - 1];
    if (prevLoader) {
      prevLoader.nextLoader = currentLoader.loader;
    }
    this._loaderChain.push(currentLoader);
    return this;
  }

  public final(batchLoadFn: BatchLoadFn<K, V>) {
    const finalLoader = new DataLoader<K, V>(async keys => {
      finalLoader.clearAll();
      debug(`[FinalLoader]Begin batch get keys:`, keys);
      return batchLoadFn(keys);
    });
    this._finalLoader = finalLoader;
    return this;
  }

  public load(key: K) {
    return this._loader.load(key);
  }

  public loadMany(keys: K[]) {
    return this._loader.loadMany(keys);
  }
}
