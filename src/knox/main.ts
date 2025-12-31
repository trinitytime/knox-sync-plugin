import { Notice, Plugin, TFile } from 'obsidian'
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
  settings: KnoxSyncPluginSettings

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
        new Notice('Knox portal session has expired. Please log in again.')
        return
      }

      await provider.fetchGroupList()
      const remote = createRemote(provider)
      await sync(vault, remote, this.app.fileManager)
      console.debug('Sync completed in', Date.now() - startTime, 'ms')
    } catch (e) {
      if (e instanceof Error) {
        console.error('Sync error:', e)
      }
      new Notice(e.message)
      return
    } finally {
      void provider.close()
    }
  }

  async onload() {
    await this.loadSettings()

    // This creates an icon in the left ribbon.
    this.addRibbonIcon('refresh-ccw-dot', 'Sync with naver', (_evt: MouseEvent) => {
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
        this.app.vault.on('create', (file: TFile) => {
          event.emit('create', file)
          local.lastModifiedTime = Date.now()
        }),
      )

      this.registerEvent(
        this.app.vault.on('modify', (file: TFile) => {
          event.emit('modify', file)
          local.lastModifiedTime = Date.now()
        }),
      )

      this.registerEvent(
        this.app.vault.on('delete', (file: TFile) => {
          event.emit('delete', file)
          local.lastModifiedTime = Date.now()
        }),
      )
      this.registerEvent(
        this.app.vault.on('rename', (file: TFile, oldPath: string) => {
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

      console.debug('KnoxSyncPlugin loaded')
    })
  }

  onunload() {
    event.off('saveSettings')

    console.debug('KnoxSyncPlugin unloaded')
  }

  async loadSettings() {
    const DEFAULT_SETTINGS: KnoxSyncPluginSettings = {
      host: 'https://samsung.net',
      syncInterval: 0,
      onSaveInterval: 0,
    }

    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData())
  }

  async saveSettings() {
    await this.saveData(this.settings)
  }
}
