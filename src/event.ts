import { TFile } from 'obsidian'
import { db } from './database'
import { syncState } from './syncState'
import { EventEmitter } from 'eventemitter3'

function getFileInfo(file: TFile) {
  return {
    key: file.path,
    cTime: file.stat.ctime,
    mTime: file.stat.mtime,
    size: file.stat.size,
  }
}

export const event = new EventEmitter()

event.on('create', (file: TFile) => {
  if (syncState.lockFile.has(file.path)) return

  if (file instanceof TFile) {
    const item = {
      status: 'C',
      ...getFileInfo(file),
    }

    void db.file.put(item)
  }
})

event.on('modify', (file: TFile) => {
  if (syncState.lockFile.has(file.path)) return

  if (file instanceof TFile) {
    const item = {
      status: 'U',
      ...getFileInfo(file),
    }

    void db.file.put(item)
  }
})

event.on('delete', (file: TFile) => {
  if (syncState.lockFile.has(file.path)) return

  if (file instanceof TFile) {
    const item: ItemInfoType = {
      status: 'D',
      ...getFileInfo(file),
      mTime: Date.now(),
    }

    void db.file.put(item)
  }
})

event.on('rename', (file: TFile, oldPath: string) => {
  if (syncState.lockFile.has(oldPath)) return

  if (file instanceof TFile) {
    const item = {
      status: 'C',
      ...getFileInfo(file),
    }
    void db.file.put(item)

    const oldItem: ItemInfoType = {
      status: 'D',
      ...getFileInfo(file),
      key: oldPath,
      mTime: Date.now(),
    }
    void db.file.put(oldItem)
  }
})

event.on('updateLastSyncTime', () => {
  // update sync start time
  void db.state.put({ key: 'lastSyncTime', value: Date.now() })
})
