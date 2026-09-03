import { App, PluginSettingTab, Setting } from 'obsidian'
import KnoxSyncPlugin from './main'
import { event } from '../event'

export interface KnoxSyncPluginSettings {
  host: string
  syncInterval: number
  onSaveInterval: number
}

const SYNC_INTERVAL_OPTIONS: Record<string, string> = {
  0: '(not set)',
  300000: 'Every 5 minutes',
  600000: 'Every 10 minutes',
  1800000: 'Every 30 minutes',
  3600000: 'Every 1 hour',
}

const ON_SAVE_INTERVAL_OPTIONS: Record<string, string> = {
  0: '(not set)',
  60000: 'After 1 minutes',
  180000: 'After 3 minutes',
  300000: 'After 5 minutes',
  600000: 'After 10 minutes',
}

const INTERVAL_KEYS: ReadonlySet<string> = new Set(['syncInterval', 'onSaveInterval'])

export class KnoxSettingTab extends PluginSettingTab {
  plugin: KnoxSyncPlugin

  constructor(app: App, plugin: KnoxSyncPlugin) {
    super(app, plugin)
    this.plugin = plugin
  }

  // Declarative settings API (Obsidian 1.13+). Each `control.key` names a property on
  // `this.plugin.settings`; Obsidian reads and writes it through the hooks below.
  // On Obsidian < 1.13 this is ignored and `display()` renders the tab instead.
  getSettingDefinitions() {
    return [
      {
        name: 'Knox portal host',
        control: {
          type: 'text',
          key: 'host',
          placeholder: 'Enter knox portal host',
        },
      },
      {
        name: 'Schedule for auto run',
        desc: 'The plugin tries to schedule the running after every interval.',
        control: {
          type: 'dropdown',
          key: 'syncInterval',
          options: SYNC_INTERVAL_OPTIONS,
        },
      },
      {
        name: 'Sync on save',
        desc: 'If you change your files, the plugin tries to sync after this time',
        control: {
          type: 'dropdown',
          key: 'onSaveInterval',
          options: ON_SAVE_INTERVAL_OPTIONS,
        },
      },
    ]
  }

  // The plugin stores settings in `this.plugin.settings` but persists them through the
  // shared event bus, and the interval controls are kept as numbers while dropdown
  // controls hand back strings. Override the read/write hooks so the declarative
  // bindings go through that path. See "Custom settings storage" in the docs.
  getControlValue(key: string): unknown {
    const value = this.plugin.settings[key as keyof KnoxSyncPluginSettings]
    return typeof value === 'number' ? value.toString() : value
  }

  setControlValue(key: string, value: unknown): Promise<void> {
    const next = INTERVAL_KEYS.has(key) ? parseInt(value as string, 10) : value
    event.emit('saveSettings', { [key]: next })
    return this.plugin.saveData(this.plugin.settings)
  }

  clear() {
    this.containerEl.empty()
  }

  // Legacy imperative rendering for Obsidian < 1.13, kept because minAppVersion is 1.6.6.
  display() {
    this.clear()

    new Setting(this.containerEl).setName('Knox portal host').addText((text) =>
      text
        .setPlaceholder('Enter knox portal host')
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
          .addOptions(SYNC_INTERVAL_OPTIONS)
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
          .addOptions(ON_SAVE_INTERVAL_OPTIONS)
          .setValue(this.plugin.settings.onSaveInterval.toString())
          .onChange((value) => {
            const interval = parseInt(value)
            event.emit('saveSettings', { onSaveInterval: interval })
          })
      })
  }

  hide(): void {
    this.clear()
  }
}
