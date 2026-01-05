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

async function loadLocalFiles(vault: Vault): Promise<Map<string, ItemInfoType>> {
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

  return files
}

async function downloadFiles({
  vault,
  remote,
  fileManager,
  remoteList,
  files,
}: {
  vault: Vault
  remote: Remote
  fileManager: FileManager
  remoteList: ItemInfoType[]
  files: Map<string, ItemInfoType>
}): Promise<Set<string>> {
  // 추적: 성공한 항목 기록
  const successfulKeys = new Set<string>()

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
      }

      const content = await remote.downloadFile(key)
      const folderPath = key.substring(0, key.lastIndexOf('/'))
      if (!vault.getFolderByPath(folderPath)) {
        await vault.createFolder(folderPath).catch(() => {})
      }

      if (content) {
        await vault.createBinary(key, content, {
          ctime: remoteItem.cTime,
          mtime: remoteItem.mTime,
        })
      } else {
        await vault.create(key, '', {
          ctime: remoteItem.cTime,
          mtime: remoteItem.mTime,
        })
      }
    }

    successfulKeys.add(key)
  })

  await Promise.all(downloadPromises)

  return successfulKeys
}

async function uploadFiles({
  vault,
  files,
  remote,
}: {
  vault: Vault
  files: Map<string, ItemInfoType>
  remote: Remote
}): Promise<Set<string>> {
  // 추적: 성공한 항목 기록
  const successfulKeys = new Set<string>()

  const uploadPromises: Promise<void>[] = Array.from(files.entries()).map(
    async ([key, localItem]) => {
      if ('D' === localItem.status) {
        await remote.deleteFile(localItem)
        successfulKeys.add(key)
        return
      }

      const file = getFileByPath(vault, key)
      if (!file) {
        return
      }

      const content = await vault.readBinary(file)
      await remote.uploadFile(localItem, content)
    },
  )

  await Promise.all(uploadPromises)

  return successfulKeys
}

export async function sync(vault: Vault, remote: Remote, fileManager: FileManager) {
  if (syncState.isSyncing) {
    return
  }
  syncState.isSyncing = true

  try {
    // load local db files
    const files = await loadLocalFiles(vault)

    // download list
    const remoteList: ItemInfoType[] = await remote.fetchList()

    // download remote files
    const downloadedKeys = await downloadFiles({ vault, remote, fileManager, remoteList, files })
    await Promise.all(Array.from(downloadedKeys).map((key) => files.delete(key)))

    // upload remaining local files
    const uploadedKeys = await uploadFiles({ vault, files, remote })
    await Promise.all(Array.from(uploadedKeys).map((key) => files.delete(key)))

    // update last sync time
    event.emit('updateLastSyncTime')
  } finally {
    syncState.reset()
  }
}
