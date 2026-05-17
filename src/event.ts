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

async function onCreateEvent(file: TFile) {
  if (file.path.startsWith('+')) {
    const info = await FileInfo.fromTFile(file, 'C')
    const item: ItemInfoType = toItemInfoType(info)

    await db.file.put(item)
  }
}

async function onModifyEvent(file: TFile) {
  if (file.path.startsWith('+')) {
    const info = await FileInfo.fromTFile(file, 'U')
    const item: ItemInfoType = toItemInfoType(info)

    await db.file.put(item)
  }
}

async function onDeleteEvent(file: TFile) {
  if (file.path.startsWith('+')) {
    const info = await FileInfo.create(file.path, 'D', file.stat.ctime, Date.now(), file.stat.size)
    const item: ItemInfoType = toItemInfoType(info)

    await db.file.put(item)
  }
}

async function onRenameEvent(file: TFile, oldPath: string) {
  if (file.path.startsWith('+')) {
    const info = await FileInfo.fromTFile(file, 'C')
    const item: ItemInfoType = toItemInfoType(info)

    await db.file.put(item)
  }

  if (oldPath.startsWith('+')) {
    const oldInfo = await FileInfo.create(oldPath, 'D', file.stat.ctime, Date.now(), file.stat.size)
    const oldItem: ItemInfoType = toItemInfoType(oldInfo)

    await db.file.put(oldItem)
  }
}

export const event = new EventEmitter()

event.on('create', (file: TFile) => {
  // 싱크중이면 무시
  if (syncState.isLocked(file.path)) return

  void onCreateEvent(file)
})

event.on('modify', (file: TFile) => {
  // 싱크중이면 무시
  if (syncState.isLocked(file.path)) return

  void onModifyEvent(file)
})

event.on('delete', (file: TFile) => {
  // 싱크중이면 무시
  if (syncState.isLocked(file.path)) return

  void onDeleteEvent(file)
})

event.on('rename', (file: TFile, oldPath: string) => {
  // 싱크중이면 무시
  if (syncState.isLocked(oldPath)) return

  void onRenameEvent(file, oldPath)
})

event.on('updateLastSyncTime', () => {
  // update sync start time
  void db.state.put({ key: 'lastSyncTime', value: Date.now() })
})
