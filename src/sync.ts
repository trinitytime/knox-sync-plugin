import { FileManager, TAbstractFile, TFile, Vault } from 'obsidian'
import { db } from './database'
import { Remote } from './remote'
import { syncState } from './syncState'
import { event } from './event'

function getFileByPath(vault: Vault, path: string): TFile | null {
  const file: TAbstractFile | null = vault.getAbstractFileByPath(path)
  return file instanceof TFile ? file : null
}

async function loadLocalFiles(vault: Vault): Promise<Map<string, ItemInfoType>> {
  const files = new Map<string, ItemInfoType>()

  // 로컬 볼트에서 '+' 경로로 시작하는 파일을 신규 항목으로 등록
  vault.getFiles().forEach((file) => {
    if (file.path.startsWith('+')) {
      files.set(file.path, {
        key: file.path,
        status: 'N',
        cTime: file.stat.ctime,
        mTime: file.stat.mtime,
        size: file.stat.size,
      })
    }
  })

  // DB에 저장된 변경 이력으로 덮어쓰기
  const dbItems = await db.file.toArray()
  dbItems.forEach((item) => files.set(item.key, item))

  return files
}

async function ensureFolderExists(vault: Vault, filePath: string): Promise<void> {
  const folderPath = filePath.substring(0, filePath.lastIndexOf('/'))
  if (folderPath && !vault.getFolderByPath(folderPath)) {
    await vault.createFolder(folderPath).catch(() => {})
  }
}

async function writeFileWithLock(
  vault: Vault,
  key: string,
  file: TFile | null,
  content: ArrayBuffer | null,
  stat: { ctime: number; mtime: number },
): Promise<void> {
  syncState.lockFile.add(key)
  try {
    if (file) {
      if (content) await vault.modifyBinary(file, content, stat)
    } else if (content) {
      await vault.createBinary(key, content, stat)
    } else {
      await vault.create(key, '', stat)
    }
  } finally {
    syncState.lockFile.delete(key)
  }
}

async function downloadSingleFile(
  vault: Vault,
  remote: Remote,
  fileManager: FileManager,
  remoteItem: ItemInfoType,
  pendingUploads: Map<string, ItemInfoType>,
): Promise<boolean> {
  const key = remoteItem.key
  const stat = { ctime: remoteItem.cTime, mtime: remoteItem.mTime }

  // 업로드 대기 중인 항목이 있는 경우: 원격이 더 최신이면 업로드 목록에서 제거, 로컬이 최신이면 다운로드 건너뜀
  if (pendingUploads.has(key)) {
    if (pendingUploads.get(key)!.mTime <= remoteItem.mTime) {
      pendingUploads.delete(key)
    } else {
      return false
    }
  }

  const localFile = getFileByPath(vault, key)

  if (localFile) {
    if (localFile.stat.mtime >= remoteItem.mTime) return false // 로컬이 더 최신이면 건너뜀

    if (remoteItem.status === 'D') {
      syncState.lockFile.add(key)
      await fileManager.trashFile(localFile)
      syncState.lockFile.delete(key)
    } else {
      const content = await remote.downloadFile(key)
      if (content) {
        syncState.lockFile.add(key)
        await vault.modifyBinary(localFile, content, stat)
        syncState.lockFile.delete(key)
      }
    }
  } else {
    if (remoteItem.status === 'D') return false // 원격에서 삭제된 파일은 로컬에도 없으므로 건너뜀

    const content = await remote.downloadFile(key)
    await ensureFolderExists(vault, key)

    // 다운로드 대기 중 다른 Promise가 같은 파일을 생성했을 수 있으므로 재확인
    const raceFile = getFileByPath(vault, key)
    await writeFileWithLock(vault, key, raceFile, content, stat)
  }

  return true
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
  const results = await Promise.all(
    remoteList.map(async (remoteItem) => {
      const success = await downloadSingleFile(vault, remote, fileManager, remoteItem, files)
      return success ? remoteItem.key : null
    }),
  )

  return new Set(results.filter((key): key is string => key !== null))
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
  const results = await Promise.all(
    Array.from(files.entries()).map(async ([key, localItem]) => {
      if (localItem.status === 'D') {
        await remote.deleteFile(localItem)
        return key
      }

      const file = getFileByPath(vault, key)
      if (!file) return null

      const content = await vault.readBinary(file)
      await remote.uploadFile(localItem, content)
      return key
    }),
  )

  return new Set(results.filter((key): key is string => key !== null))
}

export async function sync(vault: Vault, remote: Remote, fileManager: FileManager) {
  if (syncState.isSyncing) return
  syncState.isSyncing = true

  try {
    const files = await loadLocalFiles(vault)
    const remoteList: ItemInfoType[] = await remote.fetchList()

    const downloadedKeys = await downloadFiles({ vault, remote, fileManager, remoteList, files })
    const downloadCount = await db.file.where('key').anyOf(Array.from(downloadedKeys)).delete()

    const uploadedKeys = await uploadFiles({ vault, files, remote })
    const uploadCount = await db.file.where('key').anyOf(Array.from(uploadedKeys)).delete()

    console.debug(
      `Sync summary: downloaded ${downloadedKeys.size} files (${downloadCount} db records deleted), uploaded ${uploadedKeys.size} files (${uploadCount} db records deleted)`,
    )

    event.emit('updateLastSyncTime')
  } finally {
    syncState.reset()
  }
}
