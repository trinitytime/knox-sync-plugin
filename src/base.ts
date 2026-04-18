import { FileInfo, RemoteFileInfo } from "./file"

export interface BaseProviderType {
  open(): Promise<boolean>
  close(): Promise<boolean>
  isReady(): Promise<boolean>
  fetchGroupList(): Promise<GroupInfoType[]>
  fetchItemList(): Promise<RemoteFileInfo[]>
  fetchItemInfo(id: string, groupName: string): Promise<RemoteFileInfo | null>
  downloadFile(key: string): Promise<ArrayBuffer | null>
  uploadFile(item: FileInfo, data: ArrayBuffer): Promise<boolean>
  deleteFile(item: FileInfo): Promise<boolean>
}
