export interface BaseProviderType {
  open(): Promise<boolean>
  close(): Promise<boolean>
  isReady(): Promise<boolean>
  fetchGroupList(): Promise<GroupInfoType[]>
  fetchItemList(): Promise<ItemInfoType[]>
  fetchItemInfo(key: string): Promise<ProviderItemInfoType | null>
  downloadFile(key: string): Promise<ArrayBuffer | null>
  uploadFile(item: ItemInfoType, data: ArrayBuffer): Promise<boolean>
  deleteFile(item: ItemInfoType): Promise<boolean>
}
