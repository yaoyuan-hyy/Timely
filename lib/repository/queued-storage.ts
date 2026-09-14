export type AsyncStorage = { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void> };
export function createQueuedStorage(storage: AsyncStorage): AsyncStorage {
  let queue: Promise<void> = Promise.resolve();
  return {
    getItem: async key => { await queue; return storage.getItem(key); },
    setItem(key, value) {
      const next = queue.then(() => storage.setItem(key, value));
      queue = next.catch(() => undefined);
      return next;
    }
  };
}
