/**
 * @file lruCache.ts
 * @description LRU（最近最少使用）缓存实现，支持基于条目数和内存容量的双重淘汰策略。
 * 利用 Map 的插入顺序特性实现 O(1) 的缓存访问与淘汰操作。
 */

/** 缓存条目，包含存储值及其近似内存占用大小 */
interface CacheEntry<T> {
  value: T;
  approximateSize: number;
}

/**
 * LRU 缓存类，支持按最大条目数和最大内存字节数进行淘汰
 *
 * @typeParam T - 缓存值的类型
 *
 * @example
 * ```ts
 * const cache = new LRUCache<string>(100, 1024 * 1024); // 最多 100 条，1MB
 * cache.set("key", "value", 6);
 * cache.get("key"); // "value"
 * ```
 */
export class LRUCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private totalSize = 0;

  /**
   * 创建 LRU 缓存实例
   *
   * @param maxEntries - 最大缓存条目数
   * @param maxMemoryBytes - 最大内存占用字节数
   */
  constructor(
    private readonly maxEntries: number,
    private readonly maxMemoryBytes: number,
  ) {}

  /**
   * 获取缓存值，同时将该条目提升为最近使用
   *
   * @param key - 缓存键
   * @returns 缓存值，若不存在则返回 null
   */
  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }

    this.promote(key, entry);
    return entry.value;
  }

  /**
   * 设置缓存值，若超出容量限制则自动淘汰最久未使用的条目
   *
   * @param key - 缓存键
   * @param value - 缓存值
   * @param approximateSize - 该条目的近似内存占用字节数
   */
  set(key: string, value: T, approximateSize: number): void {
    const existing = this.cache.get(key);
    if (existing) {
      this.totalSize -= existing.approximateSize;
      this.cache.delete(key);
    }

    this.evictIfNeeded(approximateSize);
    this.cache.set(key, { value, approximateSize });
    this.totalSize += approximateSize;
  }

  /** 清空缓存，释放所有条目 */
  clear(): void {
    this.cache.clear();
    this.totalSize = 0;
  }

  /**
   * 将指定条目提升为最近使用（删除后重新插入以更新 Map 迭代顺序）
   *
   * @param key - 缓存键
   * @param entry - 缓存条目
   */
  private promote(key: string, entry: CacheEntry<T>): void {
    this.cache.delete(key);
    this.cache.set(key, entry);
  }

  /**
   * 当缓存条目数或内存占用超出限制时，淘汰最久未使用的条目
   *
   * @param incomingSize - 即将插入条目的内存占用字节数
   */
  private evictIfNeeded(incomingSize: number): void {
    while (
      (this.cache.size >= this.maxEntries || this.totalSize + incomingSize > this.maxMemoryBytes) &&
      this.cache.size > 0
    ) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey === undefined) {
        break;
      }

      const oldestEntry = this.cache.get(oldestKey);
      if (oldestEntry) {
        this.totalSize -= oldestEntry.approximateSize;
      }
      this.cache.delete(oldestKey);
    }
  }
}