import { Dexie, EntityTable } from 'dexie'

interface State {
  key: string
  value: number
}

export interface ItemInfoType {
  key: string
  path: string
  status: string // 'C' | 'U' | 'D' | 'N'
  cTime: number
  mTime: number
  size: number
}

export const db = new Dexie('knox-sync') as Dexie & {
  state: EntityTable<State, 'key'>
  file: EntityTable<ItemInfoType, 'key'>
}

db.version(1).stores({
  state: '&key, value',
  file: '&key',
})
