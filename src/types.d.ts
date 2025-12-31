interface ItemInfoType {
  key: string
  status: string // 'C' | 'U' | 'D' | 'N'
  cTime: number
  mTime: number
  size: number
}

interface ProviderItemInfoType extends ItemInfoType {
  id: string
  groupId: string
  content: string | null
}

interface GroupInfoType {
  id: string
  projectId: string
  name: string
}
