import {
  App,
  ButtonComponent,
  PluginSettingTab,
  Setting,
  TextComponent,
  Platform,
  Notice,
} from 'obsidian'
import KnoxSyncPlugin from './main'
import { createKnoxProvider, KnoxProvider } from './knoxProvider'
import { event } from '../event'

export interface KnoxSyncPluginSettings {
  host: string
  syncInterval: number
  onSaveInterval: number
}

export class KnoxSettingTab extends PluginSettingTab {
  plugin: KnoxSyncPlugin

  constructor(app: App, plugin: KnoxSyncPlugin) {
    super(app, plugin)
    this.plugin = plugin
  }

  clear() {
    this.containerEl.empty()
  }

  async displayAsync() {
    this.clear()

    new Setting(this.containerEl).setName('Knox Portal Host').addText((text) =>
      text
        .setPlaceholder('Enter Knox Portal Host')
        .setValue(this.plugin.settings.host)
        .onChange((value) => {
          event.emit('saveSettings', { host: value })
        }),
    )

    new Setting(this.containerEl)
      .setName('Schedule for auto run')
      .setDesc('The plugin tries to schedule the running after every interval.')
      .addDropdown((dropdown) => {
        dropdown
          .addOptions({
            0: '(not set)',
            300000: 'Every 5 minutes',
            600000: 'Every 10 minutes',
            1800000: 'Every 30 minutes',
            3600000: 'Every 1 hour',
          })
          .setValue(this.plugin.settings.syncInterval.toString())
          .onChange((value) => {
            const interval = parseInt(value)
            event.emit('saveSettings', { syncInterval: interval })
          })
      })

    new Setting(this.containerEl)
      .setName('Sync on save')
      .setDesc('If you change your files, the plugin tries to sync after this time')
      .addDropdown((dropdown) => {
        dropdown
          .addOptions({
            0: '(not set)',
            60000: 'Every 1 minutes',
            180000: 'Every 3 minutes',
            300000: 'Every 5 minutes',
            600000: 'Every 10 minutes',
          })
          .setValue(this.plugin.settings.onSaveInterval.toString())
          .onChange((value) => {
            const interval = parseInt(value)
            event.emit('saveSettings', { onSaveInterval: interval })
          })
      })
  }

  display() {
    void this.displayAsync()
  }

  hide(): void {
    this.clear()
  }
}
