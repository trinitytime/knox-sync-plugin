import { Dexie, EntityTable } from 'dexie'

interface State {
  key: string
  value: number
}

export const db = new Dexie('naver-sync') as Dexie & {
  state: EntityTable<State, 'key'>
  file: EntityTable<ItemInfoType, 'key'>
}

db.version(1).stores({
  state: '&key, value',
  file: '&key',
})
