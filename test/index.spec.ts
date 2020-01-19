import * as assert from 'assert';
import LayeredCacheLoader from '../src';
import MemoryLayer from '../src/MemoryLayer';
import RedisLayer from '../src/RedisLayer';

const delay = (duration: number) => new Promise(resolve => setTimeout(resolve, duration));

describe('LayeredCacheLoader', () => {
  it('default using emptyLayer', done => {
    const layeredCacheLoader = new LayeredCacheLoader<string, string>();
    layeredCacheLoader.load('foo').then(() => {
      done(new Error('Should throw an error.'));
    }).catch(e => {
      console.error(e.message);
      done();
    });
  });
  it('MemoryLayer should ok', async () => {
    const memoryLayer = new MemoryLayer<string, string>();
    const layeredCacheLoader = new LayeredCacheLoader<string, string>()
      .use(memoryLayer);
    memoryLayer.map.set('foo', 'bar');
    const result = await layeredCacheLoader.load('foo');
    assert(result === 'bar');
  });
  it('Layer cache should ok.', async () => {
    const layer1 = new MemoryLayer<string, string>();
    const layer2 = new MemoryLayer<string, string>();
    const layeredCacheLoader = new LayeredCacheLoader<string, string>()
      .use(layer1)
      .use(layer2);
    layer2.map.set('foo', 'bar');
    const result = await layeredCacheLoader.load('foo');
    assert(result === 'bar');
    assert(layer1.map.get('foo') === 'bar');
    const again = await layeredCacheLoader.load('foo');
    assert(again === 'bar');
  });
  it('Get unknown keys from next layer', async () => {
    const layer1 = new MemoryLayer<string, string>();
    const layer2 = new MemoryLayer<string, string>();
    const layeredCacheLoader = new LayeredCacheLoader<string, string>()
      .use(layer1)
      .use(layer2);
    layer1.map.set('foo', 'bar');
    layer2.map.set('foo2', 'hahaha');
    const [result1, result2] = await Promise.all([
      layeredCacheLoader.load('foo'),
      layeredCacheLoader.load('foo2'),
    ]);
    assert(result1 === 'bar');
    assert(result2 === 'hahaha');
    assert(layer1.map.get('foo2') === 'hahaha');
  });
  it('Use redis layer should ok', async () => {
    const layer1 = new MemoryLayer<string, string>();
    const layer2 = new RedisLayer<string, string>({
      uri: 'redis://localhost:6379',
      ttl: 10000,
    });
    const finalMap = new Map<string, string>([
      ['foo', 'bar'],
      ['foo2', 'hahaha'],
      ['hello', 'world'],
    ]);
    const layeredCacheLoader = new LayeredCacheLoader<string, string>()
      .use(layer1)
      .use(layer2)
      .final(async keys => keys.map(key => finalMap.get(key) ?? new Error('Value not found.')));
    const results = await layeredCacheLoader.loadMany(['foo', 'foo2', 'hello']);
    assert(results[0] === 'bar');
    assert(results[1] === 'hahaha');
    assert(results[2] === 'world');
    layer2.redis.disconnect();
  });
  it('Use ttl map should ok', async () => {
    const layer = new MemoryLayer<string, string>({
      ttl: 500,
    });
    const layeredCacheLoader = new LayeredCacheLoader<string, string>()
      .use(layer)
      .final(keys => Promise.resolve(keys.map(() => 'bar')));
    const result = await layeredCacheLoader.load('foo');
    assert(result === 'bar');
    // Change the final loader
    layeredCacheLoader.final(keys => Promise.resolve(keys.map(() => 'zzz')));
    const again = await layeredCacheLoader.load('foo');
    // should return cache
    assert(again === 'bar');
    await delay(800);
    // cache is expired
    const again2 = await layeredCacheLoader.load('foo');
    assert(again2 === 'zzz');
  });
});
