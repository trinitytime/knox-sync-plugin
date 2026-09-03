import { BaseProviderType } from '../base'
import { Browser, createBrowser } from '../browser'
import { FileInfo, RemoteFileInfo } from '../file'

const ONE_MONTH_MS = 30 * 24 * 60 * 60 * 1000

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  const chunkSize = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const len = binary.length
  const bytes = new Uint8Array(len)
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

interface ParsedKnoxContent {
  version: number
  mTime: number
  cTime: number
  status: string
  size: number
  path: string
  content: string | null
}

// v1 포맷 (버전 없음): mTime;cTime;status;size;content;
// v2 포맷            : 2:mTime;cTime;status;size;path;content;
function parseKnoxContent(text: string | null): ParsedKnoxContent | null {
  if (!text) return null

  const match = text.match(/\[\[\[([\s\S]*?)\]\]\]/)
  if (!match?.[1]) return null

  const raw = match[1]
  const versionMatch = raw.match(/^(\d+):(.*)$/s)
  const version = versionMatch ? parseInt(versionMatch[1]) : 1
  const data = versionMatch ? versionMatch[2] : raw
  const fields = data.split(';')

  if (version === 1) {
    const [mTime = '0', cTime = '0', status = 'N', size = '0', content = ''] = fields
    return {
      version: 1,
      mTime: parseInt(mTime),
      cTime: parseInt(cTime),
      status,
      size: parseInt(size),
      path: '',
      content: content || null,
    }
  }

  const [mTime = '0', cTime = '0', status = 'N', size = '0', path = '', content = ''] = fields
  return {
    version,
    mTime: parseInt(mTime),
    cTime: parseInt(cTime),
    status,
    size: parseInt(size),
    path: decodeURIComponent(path),
    content: content || null,
  }
}

function buildKnoxData(
  mTime: number,
  cTime: number,
  status: string,
  size: number,
  path: string,
  content: string,
  version = 2,
): string {
  if (version === 1) {
    return `${mTime};${cTime};${status};${size};${content};`
  }
  return `${version}:${mTime};${cTime};${status};${size};${encodeURIComponent(path)};${content};`
}

function encodeKnoxContent(text: string): string {
  const html = `<!DOCTYPE html>
<html>
<head></head>
<body><p><span style="font-family:Arial, sans-serif; font-size:13.3333px;">[[[${text}]]]</span></p></body></html>`
  const base64 = btoa(html)
  const lines = base64.match(/.{1,76}/g) || []

  return `Content-Transfer-Encoding: base64

${lines.join('\n')}


--`
}

export class KnoxProvider implements BaseProviderType {
  browser: Browser = createBrowser()
  host: string
  groups: Record<string, GroupInfoType> = {}
  items: Record<string, RemoteFileInfo> = {}

  constructor(host: string) {
    this.host = host
  }

  protected async fetch<T>(url: string, options: FetchOptionType = { method: 'GET' }): Promise<T> {
    const safeUrl = JSON.stringify(url)
    const safeMethod = JSON.stringify(options.method)

    if ('GET' === options.method) {
      return this.browser.webContents.executeJavaScript(`
        fetch(window.location.origin + ${safeUrl}, {
          method: ${safeMethod},
          headers: { 'content-type': 'application/json' },
        }).then(r => r.json())
      `)
    }

    const safeBody = JSON.stringify(JSON.stringify(options.body))
    return this.browser.webContents.executeJavaScript(`
      fetch(window.location.origin + ${safeUrl}, {
        method: ${safeMethod},
        headers: { 'content-type': 'application/json' },
        body: ${safeBody},
      }).then(r => r.json())
    `)
  }

  async open(): Promise<boolean> {
    const result = await this.browser
      .loadURL(this.host)
      .then(() => true)
      .catch(() => false)

    await sleep(1_000)

    return result
  }

  close(): Promise<boolean> {
    try {
      this.browser.close()
    } catch {
      return Promise.resolve(false)
    }

    return Promise.resolve(true)
  }

  async isReady(): Promise<boolean> {
    try {
      const url = this.browser.webContents.getURL()
      if (url.includes('login')) {
        return Promise.resolve(false)
      }

      await this.browser.loadURL(new URL(url).origin + '/taskapp/task')

      await sleep(1_000)

      return true
    } catch {
      return false
    }
  }

  protected async fetchProjectList(): Promise<KnoxProjectType[]> {
    const params = new URLSearchParams({
      size: '100',
      orderField: 'CREATE_DATE',
      orderType: 'DESC',
    }).toString()
    const url = `/pims/todo/rest/v1/project/list?${params}`
    const projList: KnoxProjectListType = await this.fetch(url)

    const filteredProjects = projList.elements.filter((proj) => proj.projectName.startsWith('+'))

    return filteredProjects
  }

  protected async fetchDefaultGroup(project: KnoxProjectType): Promise<GroupInfoType | null> {
    const url = `/pims/todo/rest/v1/project/${project.projectId}/group/list`
    const groupList: KnoxGroupType[] = await this.fetch(url)

    const defaultGroups = groupList.filter((group) => group.defaultYn === 'Y')
    if (defaultGroups.length === 0) {
      return null
    }

    return {
      id: defaultGroups[0].uid,
      projectId: project.projectId,
      name: project.projectName,
    }
  }

  async fetchGroupList(): Promise<GroupInfoType[]> {
    const projects = await this.fetchProjectList()

    this.groups = {}
    for (const project of projects) {
      const defaultGroup = await this.fetchDefaultGroup(project)
      if (defaultGroup) {
        this.groups[defaultGroup.name] = defaultGroup
      }
    }

    return Object.values(this.groups)
  }

  protected async fetchGroupItemList(group: GroupInfoType): Promise<RemoteFileInfo[]> {
    let page = 0
    let totalPages = 1
    const taskPromises: Promise<RemoteFileInfo | null>[] = []

    do {
      const params = new URLSearchParams({
        groupId: group.id,
        page: `${page}`,
        size: '30',
        orderField: 'REG_UPDATE_TIME',
        orderType: 'ASCEND',
        complete: 'INCLUSION',
      }).toString()

      const url = `/pims/todo/rest/v1/project/${group.projectId}/group/todos/list?${params}`
      const resp: TaskSummaryListType = await this.fetch(url)

      for (const item of resp.elements) {
        taskPromises.push(this.fetchItemInfo(item.uid, group.name))
      }

      totalPages = resp.totalPages
      ++page
    } while (page < totalPages)

    const tasks = await Promise.all(taskPromises)
    return tasks.filter((task): task is RemoteFileInfo => task !== null)
  }

  async fetchItemList(): Promise<RemoteFileInfo[]> {
    const itemList: RemoteFileInfo[] = []
    for (const group of Object.values(this.groups)) {
      const items = await this.fetchGroupItemList(group)
      itemList.push(...items)
    }

    this.items = {}
    for (const item of itemList) {
      this.items[item.key] = item
    }

    return itemList
  }

  async fetchItemInfo(id: string, groupName: string): Promise<RemoteFileInfo | null> {
    const params = new URLSearchParams({
      type: 'ALL',
      orderType: 'ASCEND',
      orderField: 'REG_UPDATE_TIME',
    }).toString()
    const task: TaskDetailType = await this.fetch(`/pims/todo/rest/v1/phase2/todos/${id}?${params}`)

    // content가 없는 태스크(이전 동기화 도중 중단된 경우 등)도 this.items에 등록하여
    // 동일 이름으로 중복 생성되는 것을 방지한다.
    const parsed = parseKnoxContent(task.contents)

    // content 파싱에 실패한 항목은 동기화 대상에서 제외한다. (파일이 아닌 일반 태스크일 가능성 있음)
    if (null === parsed) return null

    // v1 포맷 항목은 동기화 대상에서 제외
    if (parsed.version === 1) return null

    const status = task.status === 'COMPLETED' ? 'D' : 'N'
    const itemPath = `${groupName}/${parsed.path}`

    const info = RemoteFileInfo.fromPath(itemPath, status, parsed.cTime, parsed.mTime, parsed.size, task.uid, task.groupId, parsed.content)

    if (
      task.status !== 'COMPLETED' &&
      new Date(task.modified).valueOf() + ONE_MONTH_MS < Date.now()
    ) {
      const url = `/pims/todo/rest/v1/phase2/todos/${task.uid}/inline/update`
      this.fetch(url, {
        method: 'POST',
        body: {
          inlineType: 'STATUS',
          status: 'NEEDS_ACTION',
        },
      }).catch((e) => {
        console.error('Failed to archive old item:', e)
      })
    }

    return info
  }

  downloadFile(key: string): Promise<ArrayBuffer | null> {
    const item = this.items[key]
    if (item?.content) {
      return Promise.resolve(base64ToArrayBuffer(item.content))
    }

    return Promise.resolve(null)
  }

  protected findGroup(groupName: string): GroupInfoType | null {
    return this.groups[groupName] ?? null
  }

  protected async createItem(item: FileInfo): Promise<RemoteFileInfo | null> {
    const group = this.findGroup(item.groupName)
    if (!group) {
      return null
    }

    const url = `/pims/todo/rest/v1/project/${group.projectId}/group/${group.id}/todos/create`
    const resp: TaskDetailType = await this.fetch(
      url,
      {
        method: 'POST',
        body: {
          subject: item.key
        },
      },
    )

    const info = RemoteFileInfo.fromPath(item.fullPath, 'N', item.cTime, item.mTime, item.size, resp.uid, group.id, null)

    return info
  }

  async uploadFile(item: FileInfo, data: ArrayBuffer): Promise<boolean> {
    const group = this.findGroup(item.groupName)
    if (!group) {
      return false
    }

    if (!this.items[item.key]) {
      const itemInfo = await this.createItem(item)
      if (!itemInfo) {
        return false
      }
      this.items[item.key] = itemInfo
    }

    const task = this.items[item.key]
    const content = arrayBufferToBase64(data)
    const knoxContent = encodeKnoxContent(buildKnoxData(item.mTime, item.cTime, 'N', item.size, item.path, content))

    const url = `/pims/todo/rest/v1/phase2/todos/${task.id}/inline/update`
    const result = await this.fetch(url, {
      method: 'POST',
      body: {
        inlineType: 'CONTENTS',
        contentsType: 'MIME',
        contents: knoxContent,
      },
    })
      .then(() => true)
      .catch(() => false)

    return result
  }

  async deleteFile(item: FileInfo): Promise<boolean> {
    const group = this.findGroup(item.groupName)
    if (!group) {
      return false
    }

    if (!this.items[item.key]) {
      const itemInfo = await this.createItem(item)
      if (!itemInfo) {
        return false
      }
      this.items[item.key] = itemInfo
    }

    const task = this.items[item.key]

    const knoxContent = encodeKnoxContent(buildKnoxData(item.mTime, item.cTime, 'D', item.size, item.path, ''))
    const url = `/pims/todo/rest/v1/phase2/todos/${task.id}/inline/update`
    try {
      await this.fetch(url, {
        method: 'POST',
        body: { inlineType: 'CONTENTS', contentsType: 'MIME', contents: knoxContent },
      })
      await this.fetch(url, {
        method: 'POST',
        body: { inlineType: 'STATUS', status: 'COMPLETED' },
      })
      return true
    } catch {
      return false
    }
  }
}

export function createKnoxProvider(host: string): KnoxProvider {
  return new KnoxProvider(host)
}
