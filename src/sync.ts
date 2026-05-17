import { FileManager, TFile, Vault } from 'obsidian'
import { db } from './database'
import { Remote } from './remote'
import { syncState } from './syncState'
import { event } from './event'
import { FileInfo, RemoteFileInfo } from './file'

function getFileByPath(vault: Vault, path: string): TFile | null {
  const exact = vault.getAbstractFileByPath(path)
  if (exact instanceof TFile) return exact

  const lower = path.toLowerCase()
  return vault.getFiles().find(f => f.path.toLowerCase() === lower) ?? null
}


async function loadLocalFiles(vault: Vault): Promise<Map<string, FileInfo>> {
  const files = new Map<string, FileInfo>()

  // 로컬 볼트에서 '+' 경로로 시작하는 파일을 신규 항목으로 등록
  const vaultFiles = vault.getFiles().filter((f) => f.path.startsWith('+'))
  await Promise.all(
    vaultFiles.map(async (file) => {
      const fi = await FileInfo.fromTFile(file, 'N')
      files.set(fi.key, fi)
    }),
  )

  // DB에 저장된 변경 이력으로 덮어쓰기
  const dbItems = await db.file.toArray()
  dbItems.forEach((item) => {
    const fi = FileInfo.from(item)
    files.set(item.key, fi)
  })

  return files
}

async function ensureFolderExists(vault: Vault, filePath: string): Promise<void> {
  const folderPath = filePath.substring(0, filePath.lastIndexOf('/'))
  if (folderPath && !vault.getFolderByPath(folderPath)) {
    await vault.createFolder(folderPath).catch(() => { })
  }
}

async function writeFileWithLock(
  vault: Vault,
  path: string,
  file: TFile | null,
  content: ArrayBuffer | null,
  stat: { ctime: number; mtime: number },
): Promise<void> {
  syncState.addLock(path)
  try {
    if (file) {
      if (content) await vault.modifyBinary(file, content, stat)
    } else if (content) {
      await vault.createBinary(path, content, stat)
    } else {
      await vault.create(path, '', stat)
    }
  } finally {
    syncState.removeLock(path)
  }
}

async function downloadSingleFile(
  vault: Vault,
  remote: Remote,
  fileManager: FileManager,
  remoteItem: RemoteFileInfo,
  pendingUploads: Map<string, FileInfo>,
): Promise<boolean> {
  const key = remoteItem.key
  const fullPath = remoteItem.fullPath
  const stat = { ctime: remoteItem.cTime, mtime: remoteItem.mTime }

  // 업로드 대기 중인 항목이 있는 경우: 원격이 더 최신이면 업로드 목록에서 제거, 로컬이 최신이면 다운로드 건너뜀
  if (pendingUploads.has(key)) {
    if (pendingUploads.get(key)!.mTime <= remoteItem.mTime) {
      pendingUploads.delete(key)
    } else {
      return false
    }
  }

  const localFile = getFileByPath(vault, fullPath)

  if (localFile) {
    if (localFile.stat.mtime >= remoteItem.mTime) return false // 로컬이 더 최신이면 건너뜀

    if (remoteItem.status === 'D') {
      syncState.addLock(fullPath)
      try {
        await fileManager.trashFile(localFile)
      } finally {
        syncState.removeLock(fullPath)
      }
    } else {
      const content = await remote.downloadFile(key)
      if (content) {
        syncState.addLock(fullPath)
        try {
          await vault.modifyBinary(localFile, content, stat)
        } finally {
          syncState.removeLock(fullPath)
        }
      }
    }
  } else {
    if (remoteItem.status === 'D') return false // 원격에서 삭제된 파일은 로컬에도 없으므로 건너뜀

    const content = await remote.downloadFile(key)
    await ensureFolderExists(vault, fullPath)

    // 다운로드 대기 중 다른 Promise가 같은 파일을 생성했을 수 있으므로 재확인
    const raceFile = getFileByPath(vault, fullPath)
    await writeFileWithLock(vault, fullPath, raceFile, content, stat)
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
  remoteList: RemoteFileInfo[]
  files: Map<string, FileInfo>
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
  files: Map<string, FileInfo>
  remote: Remote
}): Promise<Set<string>> {
  const results = await Promise.all(
    Array.from(files.entries()).map(async ([key, localItem]) => {
      if (localItem.status === 'D') {
        await remote.deleteFile(localItem)
        return key
      }

      const file = getFileByPath(vault, localItem.fullPath)
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
  syncState.startSync()

  try {
    const files = await loadLocalFiles(vault)
    const remoteList: RemoteFileInfo[] = await remote.fetchList()

    const downloadedKeys = await downloadFiles({ vault, remote, fileManager, remoteList, files })
    const downloadCount = await db.file.where('key').anyOf(Array.from(downloadedKeys)).delete()

    const uploadedKeys = await uploadFiles({ vault, files, remote })
    const uploadCount = await db.file.where('key').anyOf(Array.from(uploadedKeys)).delete()

    console.debug(
      `Sync summary: downloaded ${downloadedKeys.size} files (${downloadCount} db records deleted), uploaded ${uploadedKeys.size} files (${uploadCount} db records deleted)`,
    )

  } finally {
    event.emit('updateLastSyncTime')
    syncState.reset()
  }
}
