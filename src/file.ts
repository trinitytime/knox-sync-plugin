import { TFile } from 'obsidian'
import { ItemInfoType } from './database'

// 파일 경로로 만들어진 유니크한 키값을 생성하는 함수
async function toKey(path: string): Promise<string> {
  const normalized = path.trim().replace(/\\/g, '/').toLowerCase()
  const encoded = new TextEncoder().encode(normalized)
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded)
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// 파일 경로에서 그룹 이름을 제외하고 나머지 부분을 반환하는 함수
function splitFilePath(path: string): string {
  const slash = path.indexOf('/')
  return slash !== -1 ? path.slice(slash + 1) : path
}

export class FileInfo {
  key: string
  fullPath: string
  status: string
  cTime: number
  mTime: number
  size: number

  protected constructor(data: ItemInfoType) {
    this.key = data.key
    this.fullPath = data.path
    this.status = data.status
    this.cTime = data.cTime
    this.mTime = data.mTime
    this.size = data.size
  }

  static async create(
    path: string,
    status: string,
    cTime: number,
    mTime: number,
    size: number,
  ): Promise<FileInfo> {
    return new FileInfo({
      key: await toKey(splitFilePath(path)),
      path,
      status,
      cTime,
      mTime,
      size,
    })
  }

  static async fromTFile(file: TFile, status: string): Promise<FileInfo> {
    return new FileInfo({
      key: await toKey(splitFilePath(file.path)),
      path: file.path,
      status,
      cTime: file.stat.ctime,
      mTime: file.stat.mtime,
      size: file.stat.size,
    })
  }

  static from(data: ItemInfoType): FileInfo {
    return new FileInfo(data)
  }

  get path(): string {
    return splitFilePath(this.fullPath)
  }

  get groupName(): string {
    const slash = this.fullPath.indexOf('/')
    return slash !== -1 ? this.fullPath.slice(0, slash) : ''
  }
}

export interface RemoteFileInfoInput extends ItemInfoType {
  id: string
  groupId: string
  content: string | null
}


export class RemoteFileInfo extends FileInfo {
  id: string
  groupId: string
  content: string | null

  private constructor(data: RemoteFileInfoInput) {
    super(data)
    this.id = data.id
    this.groupId = data.groupId
    this.content = data.content
  }

  static async fromPath(
    path: string,
    status: string,
    cTime: number,
    mTime: number,
    size: number,
    id: string,
    groupId: string,
    content: string | null,
  ): Promise<RemoteFileInfo> {
    return new RemoteFileInfo({
      key: await toKey(splitFilePath(path)),
      path,
      status,
      cTime,
      mTime,
      size,
      id,
      groupId,
      content,
    })
  }

  static override from(data: RemoteFileInfoInput): RemoteFileInfo {
    return new RemoteFileInfo(data)
  }
}
