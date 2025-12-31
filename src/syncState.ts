export interface SyncStateType {
  isSyncing: boolean
  lockFile: Set<string>

  reset: () => void
}

export const syncState: SyncStateType = {
  isSyncing: false,
  lockFile: new Set<string>(),

  reset() {
    this.isSyncing = false
    this.lockFile.clear()
  },
}
