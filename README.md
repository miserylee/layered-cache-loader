# layered-cache-loader

##  ![NPM version](https://img.shields.io/npm/v/layered-cache-loader.svg?style=flat)


# 这是什么？

`layered-cache-loader`是一个基于[dataloader](https://github.com/graphql/dataloader)的多级缓存解决方案。

# 怎么使用？

```js
// 创建内存缓存层
const layer1 = new MemoryLayer<string, string>();
// 创建Redis缓存层
const layer2 = new RedisLayer<string, string>({
  uri: 'redis://localhost:6379',
  ttl: 10000,
});
// 创建数据源
const finalMap = new Map<string, string>([
  ['foo', 'bar'],
  ['foo2', 'hahaha'],
  ['hello', 'world'],
]);
// 创建loader，并逐个use缓存层（先use的层距离最近，所以建议越快的缓存层越先use）
const layeredCacheLoader = new LayeredCacheLoader<string, string>()
  .use(layer1)
  .use(layer2)
  .final(async keys => keys.map(key => finalMap.get(key) ?? new Error('Value not found.'))); // 未命中任何缓存的情况下，从final loader读取数据
const results = await layeredCacheLoader.loadMany(['foo', 'foo2', 'hello']); // 使用dataloader的数据读取方案，详情可以查看dataloader文档
assert(results[0] === 'bar');
assert(results[1] === 'hahaha');
assert(results[2] === 'world');
```

# API定义

## `LayeredCacheLoader<K, V>`

`K`：`key`值的类型；

`V`: `value`值的类型；

#### `ICacheLayer<K, V>`

```js
export interface ICacheLayer<K, V> {
  batchGet(keys: readonly K[]): Promise<Array<V | Error>>;

  batchSet(map: Map<K, V>): void;
}
```
自定义缓存层按照`ICacheLayer<K, V>`定义

#### `LayeredCacheLoader().use(layer: ICacheLayer<K, V>): this`

使用`use`来配置缓存层，先配置的层距离结果返回最近，建议速度越快的缓存层越先配置。

#### `LayeredCacheLoader().final(batchLoadFn: BatchLoadFn<K, V>): this`

使用`final`来配置最终数据源，当`key`没有命中任何缓存层的情况下，会从`final loader`读取数据。例：在`batchLoadFn`中从`Mongodb`或`Mysql`读取原始数据。

`final`可多次调用，以最后一次调用为准。

#### `LayeredCacheLoader().load(key: K): Promise<V>`

同`dataloader.load`。

#### `LayeredCacheLoader().loadMany(keys: K[]): Promise<Array<(V | Error)>>`

同`dataloader.loadMany`。

## `MemoryLayer<K, V, CK = K>`

`K`：`key`值的类型；

`V`: `value`值的类型；

`CK`: 缓存的`key`的类型；

#### `IMemoryLayerOptions<K, V, CK>`

```js
export interface IMemoryLayerOptions<K, V, CK> {
  ttl?: number; // 缓存存活时间（毫秒），默认为Infinity，即永不过期

  keyFn?(key: K): CK; // key到cacheKey的转换函数
}
```

#### `MemoryLayer(options: IMemoryLayerOptions<K, V, CK> = {})`

构造一个基于内存的缓存层对象。

#### `readonly MemoryLayer().map: TTLMap<K, V>`

内存缓存层用于存储数据的`TTLMap`对象，`TTLMap`见后文。

## `RedisLayer<K, V>`

`K`：`key`值的类型；

`V`: `value`值的类型；

#### `IRedisLayerOptions<K, V>`

```js
export interface IRedisLayerOptions<K, V> {
  uri: string; // redis连接uri
  keyPrefix?: string; // 存储到redis中的key的附加前缀（命名空间），默认为'cacheloader'
  ttl?: number; // 缓存存货时间（毫秒），默认为Infinity，即永不过期

  keyFn?(key: K): string;  // key到cacheKey的转换函数

  serializer?(value: V): string; // 序列化函数，默认为JSON.stringify

  deserializer?(data: string): V | Error; // 反序列化函数，默认为JSON.parse
}
```

#### `RedisLayer(options: IRedisLayerOptions<K, V>)`

构造一个基于Redis的缓存层对象。

#### `readonly RedisLayer().redis: IORedis.Redis`

`redis`缓存层内部使用的`Redis`对象。

## `TTLMap<K, V> extends Map<K, V>`

`K`：`key`值的类型；

`V`: `value`值的类型；

带有`ttl(tive to live)`的`Map`。

#### `TTLMap().setTTL(key: K, value: V, ttl: number): this`

同`Map().set`，第3个参数`ttl`设置该`key`的存活时间。