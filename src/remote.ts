import { BaseProviderType } from './base'

export class Remote {
  provider: BaseProviderType
  groups: GroupInfoType[]

  constructor(provider: BaseProviderType) {
    this.provider = provider
  }

  open() {
    return this.provider.open()
  }

  close() {
    return this.provider.close()
  }

  fetchGroupList() {
    return this.provider.fetchGroupList()
  }

  async fetchList() {
    const items = await this.provider.fetchItemList()
    return items
  }

  downloadFile(key: string) {
    console.debug('Downloading file:', key)
    return this.provider.downloadFile(key)
  }

  uploadFile(item: ItemInfoType, data: ArrayBuffer) {
    console.debug('Uploading file:', item.key)
    return this.provider.uploadFile(item, data)
  }

  deleteFile(item: ItemInfoType) {
    console.debug('Deleting file:', item.key)
    return this.provider.deleteFile(item)
  }
}

export function createRemote(provider: BaseProviderType): Remote {
  return new Remote(provider)
}
