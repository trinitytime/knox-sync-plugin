import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { cwd } from 'node:process'

import packageJSON from '../package.json' with { type: 'json' }

interface ObsidianPluginManifest {
  id: string
  name: string
  version: string
  minAppVersion: string
  description: string
  author: string
  authorUrl: string
  isDesktopOnly: boolean
}

export async function generateObsidianPluginManifest() {
  const manifest = {
    id: 'knox-sync',
    name: 'Knox Sync',
    version: packageJSON.version,
    minAppVersion: '1.4.0',
    description: packageJSON.description,
    author: 'Buwon Lee',
    authorUrl: 'https://github.com/trinitytime',
    isDesktopOnly: false,
  } satisfies ObsidianPluginManifest

  const text = JSON.stringify(manifest, null, 2)

  await writeFile(join(cwd(), 'dist', 'manifest.json'), text)
  await writeFile(join(cwd(), 'manifest.json'), text)
}

generateObsidianPluginManifest().catch((error) => {
  console.error('Error generating manifest.json:', error)
  process.exit(1)
})
