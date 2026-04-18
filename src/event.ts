import { TFile } from 'obsidian'
import { db, ItemInfoType } from './database'
import { syncState } from './syncState'
import { EventEmitter } from 'eventemitter3'
import { FileInfo } from './file'


function toItemInfoType(info: FileInfo): ItemInfoType {
  return {
    key: info.key,
    path: info.fullPath,
    status: info.status,
    cTime: info.cTime,
    mTime: info.mTime,
    size: info.size,
  }
}

export const event = new EventEmitter()

event.on('create', async (file: TFile) => {
  if (syncState.lockFile.has(file.path)) return

  if (file instanceof TFile && file.path.startsWith('+')) {
    const info = await FileInfo.fromTFile(file, 'C')
    const item: ItemInfoType = toItemInfoType(info)

    void db.file.put(item)
  }
})

event.on('modify', async (file: TFile) => {
  if (syncState.lockFile.has(file.path)) return

  if (file instanceof TFile && file.path.startsWith('+')) {
    const info = await FileInfo.fromTFile(file, 'U')
    const item: ItemInfoType = toItemInfoType(info)

    void db.file.put(item)
  }
})

event.on('delete', async (file: TFile) => {
  if (syncState.lockFile.has(file.path)) return

  if (file instanceof TFile && file.path.startsWith('+')) {
    const info = await FileInfo.create(file.path, 'D', file.stat.ctime, Date.now(), file.stat.size)
    const item: ItemInfoType = toItemInfoType(info)

    void db.file.put(item)
  }
})

event.on('rename', async (file: TFile, oldPath: string) => {
  if (syncState.lockFile.has(oldPath)) return

  if (file instanceof TFile) {
    if (file.path.startsWith('+')) {
      const info = await FileInfo.fromTFile(file, 'C')
      const item: ItemInfoType = toItemInfoType(info)

      void db.file.put(item)
    }

    if (oldPath.startsWith('+')) {
      const oldInfo = await FileInfo.create(oldPath, 'D', file.stat.ctime, Date.now(), file.stat.size)
      const oldItem: ItemInfoType = toItemInfoType(oldInfo)

      void db.file.put(oldItem)
    }
  }
})

event.on('updateLastSyncTime', () => {
  // update sync start time
  void db.state.put({ key: 'lastSyncTime', value: Date.now() })
})
