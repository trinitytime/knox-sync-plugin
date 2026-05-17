class SyncState {
  #isSyncing = false
  readonly #lockFile = new Set<string>()

  get isSyncing(): boolean {
    return this.#isSyncing
  }

  startSync(): void {
    this.#isSyncing = true
  }

  isLocked(path: string): boolean {
    return this.#lockFile.has(path)
  }

  addLock(path: string): void {
    this.#lockFile.add(path)
  }

  removeLock(path: string): void {
    this.#lockFile.delete(path)
  }

  reset(): void {
    this.#isSyncing = false
    this.#lockFile.clear()
  }
}

export const syncState = new SyncState()
