import { Notice, Plugin, TAbstractFile, TFile } from 'obsidian'
import { event } from '../event'
import { KnoxSettingTab, KnoxSyncPluginSettings } from './settings'
import { sync } from '../sync'
import { createRemote } from '../remote'
import { createKnoxProvider } from './knoxProvider'
import { db } from '../database'

const local = {
  lastModifiedTime: 0,
}

export default class KnoxSyncPlugin extends Plugin {
  settings: KnoxSyncPluginSettings = {
    host: 'http://samsung.net',
    syncInterval: 0,
    onSaveInterval: 0,
  }

  async isIntervalSyncTime() {
    const settings = this.settings
    if (0 === settings.syncInterval) return false

    const state = await db.state.get('lastSyncTime')
    const lastSyncTime = state?.value ?? 0

    return Date.now() - lastSyncTime >= settings.syncInterval
  }

  isModifiedSyncTime() {
    const settings = this.settings

    if (0 === settings.onSaveInterval) return false
    if (0 === local.lastModifiedTime) return false

    return Date.now() - local.lastModifiedTime >= settings.onSaveInterval
  }

  async checkSync() {
    if (await this.isIntervalSyncTime()) {
      local.lastModifiedTime = 0
      await this.sync()
      return
    }

    if (this.isModifiedSyncTime()) {
      local.lastModifiedTime = 0
      await this.sync()
      return
    }
  }

  async sync() {
    const settings = this.settings
    const vault = this.app.vault
    const provider = createKnoxProvider(settings.host)

    try {
      const startTime = Date.now()
      await provider.open()
      const ready = await provider.isReady()
      if (!ready) {
        return
      }

      const groups = await provider.fetchGroupList()
      for (const group of groups) {
        if (!vault.getFolderByPath(group.name)) {
          await vault.createFolder(group.name).catch(() => { })
        }
      }

      const remote = createRemote(provider)
      await sync(vault, remote, this.app.fileManager)
      console.debug('Sync completed in', Date.now() - startTime, 'ms')
    } catch (e) {
      console.error('Sync error:', e)
      new Notice(e instanceof Error ? e.message : 'Unknown sync error')
      return
    } finally {
      void provider.close()
    }
  }

  async onload() {
    await this.loadSettings()

    const statusBarItemEl = this.addStatusBarItem()
    statusBarItemEl.setText('')

    // This creates an icon in the left ribbon.
    this.addRibbonIcon('refresh-ccw-dot', 'Sync with knox', (_evt: MouseEvent) => {
      void this.sync()
    })

    this.addCommand({
      id: 'sync-knox',
      name: 'Start sync',
      callback: () => void this.sync(),
    })

    // This adds a settings tab so the user can configure various aspects of the plugin
    this.addSettingTab(new KnoxSettingTab(this.app, this))

    this.app.workspace.onLayoutReady(() => {
      local.lastModifiedTime = 0

      this.registerEvent(
        this.app.vault.on('create', (file) => {
          event.emit('create', file)
          local.lastModifiedTime = Date.now()
        }),
      )

      this.registerEvent(
        this.app.vault.on('modify', (file: TAbstractFile) => {
          event.emit('modify', file)
          local.lastModifiedTime = Date.now()
        }),
      )

      this.registerEvent(
        this.app.vault.on('delete', (file: TAbstractFile) => {
          event.emit('delete', file)
          local.lastModifiedTime = Date.now()
        }),
      )
      this.registerEvent(
        this.app.vault.on('rename', (file: TAbstractFile, oldPath: string) => {
          event.emit('rename', file, oldPath)
          local.lastModifiedTime = Date.now()
        }),
      )

      event.on('saveSettings', (params: Record<string, string | number>) => {
        this.settings = Object.assign({}, this.settings, params)
        void this.saveData(this.settings)
      })

      // When registering intervals, this function will automatically clear the interval when the plugin is disabled.
      this.registerInterval(window.setInterval(() => void this.checkSync(), 10 * 1000))
      this.registerInterval(
        window.setInterval(() => {
          void db.state.get('lastSyncTime').then((state) => {
            const lastSyncTime = state?.value ?? 0
            if (lastSyncTime > 0) {
              const d = new Date(lastSyncTime)
              const formattedTime = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`

              statusBarItemEl.setText(`Knox Sync: ${formattedTime}`)
            }
          })
        }, 10 * 1000),
      )

      console.debug('KnoxSyncPlugin loaded')
    })
  }

  onunload() {
    event.off('saveSettings')

    console.debug('KnoxSyncPlugin unloaded')
  }

  async loadSettings() {
    const DEFAULT_SETTINGS: KnoxSyncPluginSettings = {
      host: 'http://samsung.net',
      syncInterval: 0,
      onSaveInterval: 0,
    }

    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData())
  }

  async saveSettings() {
    await this.saveData(this.settings)
  }
}
