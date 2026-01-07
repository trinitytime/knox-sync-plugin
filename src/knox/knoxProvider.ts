import { BaseProviderType } from '../base'
import { Browser, createBrowser } from '../browser'

const ONE_MONTH_MS = 30 * 24 * 60 * 60 * 1000

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
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

function extractText(text: string | null): string[] | null {
  if (text) {
    const match = text.match(/\[\[\[(.*?)\]\]\]/)
    if (match && match[1]) {
      const data = match[1]
      return data.split(';')
    }
  }

  return null
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
  items: Record<string, ProviderItemInfoType> = {}

  constructor(host: string) {
    this.host = host
  }

  protected async fetch<T>(url: string, options: FetchOptionType = { method: 'GET' }): Promise<T> {
    if ('GET' === options.method) {
      return this.browser.webContents.executeJavaScript(`
        fetch(window.location.origin + "${url}" , {
          method: '${options.method}',
          headers: {
            'content-type': 'application/json',
          },
        }).then(response => response.json())
    `)
    }

    return this.browser.webContents.executeJavaScript(`
      fetch(window.location.origin + "${url}" , {
        method: '${options.method}',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(${JSON.stringify(options.body)}),
      }).then(response => response.json())
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

      await this.browser.executeScript(
        `window.location.href = window.location.origin + '/taskapp/task';`,
      )

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
    const projList: KnoxProjectListType = await this.fetch(
      `/pims/todo/rest/v1/project/list?${params}`,
    )

    const filteredProjects = projList.elements.filter((proj) => proj.projectName.startsWith('+'))

    return filteredProjects
  }

  protected async fetchDefaultGroup(project: KnoxProjectType): Promise<GroupInfoType | null> {
    const groupList: KnoxGroupType[] = await this.fetch(
      `/pims/todo/rest/v1/project/${project.projectId}/group/list`,
    )

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

  protected async fetchGroupItemList(group: GroupInfoType): Promise<ProviderItemInfoType[]> {
    let finished = false
    let page = 0
    const taskPromises: Promise<ProviderItemInfoType | null>[] = []
    while (!finished) {
      const params = new URLSearchParams({
        groupId: group.id,
        page: `${page}`,
        size: '30',
        orderField: 'REG_UPDATE_TIME',
        orderType: 'ASCEND',
        complete: 'INCLUSION',
      }).toString()

      const resp: TaskSummaryListType = await this.fetch(
        `/pims/todo/rest/v1/project/${group.projectId}/group/todos/list?${params}`,
      )

      for (const item of resp.elements) {
        taskPromises.push(this.fetchItemInfo(item.uid, group.name))
      }

      ++page
      if (page >= resp.totalPages) {
        finished = true
      }
    }

    const tasks = await Promise.all(taskPromises)
    const filteredTasks = tasks.filter((task): task is ProviderItemInfoType => task !== null)

    return filteredTasks
  }

  async fetchItemList(): Promise<ItemInfoType[]> {
    const itemList: ProviderItemInfoType[] = []
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

  async fetchItemInfo(id: string, groupName: string): Promise<ProviderItemInfoType | null> {
    const params = new URLSearchParams({
      type: 'ALL',
      orderType: 'ASCEND',
      orderField: 'REG_UPDATE_TIME',
    }).toString()
    const task: TaskDetailType = await this.fetch(`/pims/todo/rest/v1/phase2/todos/${id}?${params}`)

    const data = extractText(task.contents)
    if (!data) {
      return null
    }

    const [mTime, cTime, , size, content] = data
    const status = task.status === 'COMPLETED' ? 'D' : 'N'

    const info: ProviderItemInfoType = {
      id: task.uid,
      key: `${groupName}/${task.subject}`,
      status,
      cTime: parseInt(cTime),
      mTime: parseInt(mTime),
      size: parseInt(size),
      groupId: task.groupId,
      content: content,
    }

    if (
      task.status !== 'COMPLETED' &&
      new Date(task.modified).valueOf() + ONE_MONTH_MS < Date.now()
    ) {
      this.fetch(`/pims/todo/rest/v1/phase2/todos/${task.uid}/inline/update`, {
        method: 'POST',
        body: {
          inlineType: 'STATUS',
          status: 'NEED_ACTION',
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

  protected findGroup(key: string): GroupInfoType | null {
    const projectName = key.split('/')[0]
    const group = this.groups[projectName] ?? null

    return group
  }
  protected async createItem(item: ItemInfoType): Promise<ProviderItemInfoType | null> {
    const projectName = item.key.split('/')[0]
    // Find the group for the project
    const group = this.findGroup(item.key)
    if (!group) {
      // No group found for the project
      return null
    }

    const subject = item.key.substring(projectName.length + 1)

    const resp: TaskDetailType = await this.fetch(
      `/pims/todo/rest/v1/project/${group.projectId}/group/${group.id}/todos/create`,
      {
        method: 'POST',
        body: {
          subject,
        },
      },
    )

    const info: ProviderItemInfoType = {
      id: resp.uid,
      key: item.key,
      status: 'N',
      cTime: item.cTime,
      mTime: item.mTime,
      size: item.size,
      groupId: group.id,
      content: null,
    }

    return info
  }

  async uploadFile(item: ItemInfoType, data: ArrayBuffer): Promise<boolean> {
    const group = this.findGroup(item.key)
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
    const knoxContent = encodeKnoxContent(`${item.mTime};${item.cTime};N;${item.size};${content};`)

    const result = await this.fetch(`/pims/todo/rest/v1/phase2/todos/${task.id}/inline/update`, {
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

  async deleteFile(item: ItemInfoType): Promise<boolean> {
    const group = this.findGroup(item.key)
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
    const result = await this.fetch(`/pims/todo/rest/v1/phase2/todos/${task.id}/inline/update`, {
      method: 'POST',
      body: {
        inlineType: 'STATUS',
        status: 'COMPLETED',
      },
    })
      .then(() => true)
      .catch(() => false)

    return result
  }
}

export function createKnoxProvider(host: string): KnoxProvider {
  return new KnoxProvider(host)
}
