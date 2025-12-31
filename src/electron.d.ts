declare namespace Electron {
  class WebContents {
    getURL(): string

    loadURL(url: string): Promise<void>

    once(event: 'did-finish-load', listener: () => void): this

    executeJavaScript<T>(code: string): Promise<T>
  }

  interface BrowserWindowConstructorOptions {
    width: number
    height: number
    webPreferences: {
      nodeIntegration: boolean
      contextIsolation: boolean
    }
    show: boolean
  }

  class BrowserWindow {
    webContents: WebContents

    constructor(options?: Partial<BrowserWindowConstructorOptions>)
    close(): void

    once(event: 'close', listener: () => void): this
  }

  interface Remote {
    BrowserWindow: typeof BrowserWindow
  }

  const remote: Remote
}

declare module 'electron' {
  export = Electron
}
