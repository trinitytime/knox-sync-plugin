import { decrypt } from '../crypto'

const WORDS = {
  w00: 'IxoMUQ==',
  w01: 'OA8VUuhZxQ==',
  w02: 'JQsM',
  w03: 'OwcVUg==',
  w04: 'PwEcTg==',
  w05: 'OQsLVQ==',
  w06: 'PV8=',
  w07: 'OxwXS/hU1g==',
  w08: 'JwcLVQ==',
  w09: 'LBwXVO0=',
  w0a: 'PwEcTu4=',
  w0b: 'OwYZUvgF',
  w0c: 'IgAUSPNS',
  w0d: 'Ph4cQOlS',
  w0e: 'KBwdQOlS',
  w0f: 'Pw8LSvxH0g==',
  w0g: 'Pw8LSg==',
} as const

type Word = keyof typeof WORDS
// 문자열은 WORDS의 키, 숫자는 인자 순번
type Segment = Word | number

const cache = new Map<Word, string>()

function cacheDecrypt(word: Word): string {
  let value = cache.get(word)
  if (value === undefined) {
    value = decrypt(WORDS[word])
    cache.set(word, value)
  }
  return value
}

function path(segments: Segment[], args: (string | number)[]): string {
  return '/' + segments.map((s) => (typeof s === 'number' ? String(args[s]) : cacheDecrypt(s))).join('/')
}

const base: Segment[] = ['w03', 'w04', 'w05', 'w06']

export const endpoints = {
  projectList: () => path([...base, 'w07', 'w08'], []),
  groupList: (projectId: string | number) => path([...base, 'w07', 0, 'w09', 'w08'], [projectId]),
  groupTasks: (projectId: string | number) => path([...base, 'w07', 0, 'w09', 'w0a', 'w08'], [projectId]),
  todoDetail: (todoId: string) => path([...base, 'w0b', 'w0a', 0], [todoId]),
  todoUpdate: (todoId: string) => path([...base, 'w0b', 'w0a', 0, 'w0c', 'w0d'], [todoId]),
  todoCreate: (projectId: string | number, groupId: string) =>
    path([...base, 'w07', 0, 'w09', 1, 'w0a', 'w0e'], [projectId, groupId]),
  taskPage: () => path(['w0f', 'w0g'], []),
  defaultHost: () => `${cacheDecrypt('w00')}://${cacheDecrypt('w01')}.${cacheDecrypt('w02')}`,
}
