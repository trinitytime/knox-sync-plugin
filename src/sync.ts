import { FileManager, TAbstractFile, TFile, Vault } from 'obsidian'
import { db } from './database'
import { Remote } from './remote'
import { syncState } from './syncState'
import { event } from './event'

function getFileByPath(vault: Vault, path: string): TFile | null {
  const file: TAbstractFile | null = vault.getAbstractFileByPath(path)
  if (file && file instanceof TFile) {
    return file
  }

  return null
}

export async function sync(vault: Vault, remote: Remote, fileManager: FileManager) {
  if (syncState.isSyncing) {
    return
  }
  syncState.isSyncing = true

  // update sync start time
  event.emit('updateLastSyncTime')

  // load local db files
  const files = new Map<string, ItemInfoType>()
  vault.getFiles().forEach((file) => {
    const item: ItemInfoType = {
      key: file.path,
      status: 'N',
      cTime: file.stat.ctime,
      mTime: file.stat.mtime,
      size: file.stat.size,
    }
    files.set(item.key, item)
  })

  await db.file.toArray().then((items) => {
    items.forEach((item) => {
      files.set(item.key, item)
    })
  })

  // clear local db
  await db.file.clear()

  // download list
  const remoteList: ItemInfoType[] = await remote.fetchList()
  const downloadPromises: Promise<void>[] = remoteList.map(async (remoteItem) => {
    const key = remoteItem.key

    if (files.has(key)) {
      const localItem = files.get(key)!
      if (localItem.mTime <= remoteItem.mTime) {
        files.delete(key)
      } else {
        return
      }
    }

    const file: TFile | null = getFileByPath(vault, key)
    // 로컬 파일이 있는 경우
    if (file) {
      if (file.stat.mtime >= remoteItem.mTime) {
        return
      }
      if ('D' === remoteItem.status) {
        syncState.lockFile.add(key)
        await fileManager.trashFile(file)
        syncState.lockFile.delete(key)
      } else {
        const content = await remote.downloadFile(key)
        if (content) {
          syncState.lockFile.add(key)
          await vault.modifyBinary(file, content, {
            ctime: remoteItem.cTime,
            mtime: remoteItem.mTime,
          })
          syncState.lockFile.delete(key)
        }
      }
    } else {
      if ('D' === remoteItem.status) {
        return
      } else {
        const content = await remote.downloadFile(key)
        const folderPath = key.substring(0, key.lastIndexOf('/'))
        if (!vault.getFolderByPath(folderPath)) {
          await vault.createFolder(folderPath).catch(() => {})
        }
        if (content) {
          syncState.lockFile.add(key)
          await vault.createBinary(key, content, {
            ctime: remoteItem.cTime,
            mtime: remoteItem.mTime,
          })
          syncState.lockFile.delete(key)
        } else {
          await vault.create(key, '', {
            ctime: remoteItem.cTime,
            mtime: remoteItem.mTime,
          })
        }
      }
    }
  })

  await Promise.all(downloadPromises)

  // upload list
  const uploadPromises: Promise<void>[] = []
  files.forEach((localItem, key) => {
    uploadPromises.push(
      (async () => {
        if ('D' === localItem.status) {
          await remote.deleteFile(localItem)
          return
        }
        const file = getFileByPath(vault, key)
        if (!file) {
          return
        }
        const content = await vault.readBinary(file)
        await remote.uploadFile(localItem, content)
      })(),
    )
  })

  await Promise.all(uploadPromises)

  // update last sync time
  event.emit('updateLastSyncTime')
  syncState.reset()
}
