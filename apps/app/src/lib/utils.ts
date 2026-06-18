export function singleton<T>(fn: () => Promise<T>): () => Promise<T> {
  let instance: Promise<T> | undefined
  return () => (instance ??= fn())
}

export function dedupe<T>(fn: () => Promise<T>): () => Promise<T> {
  let inflight: Promise<T> | undefined
  return () => {
    if (!inflight) {
      inflight = fn().finally(() => {
        inflight = undefined
      })
    }
    return inflight
  }
}
