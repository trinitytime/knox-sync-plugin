# Knox Sync

English | [한국어](./README_ko.md)

A plugin that synchronizes Obsidian documents and files using the Knox portal.

## Features

- Sync across devices using Knox as a backup storage
- Share documents between users via Knox's sharing feature
- Synchronize at regular intervals
- Synchronize when no changes are made for a set period after the last edit
- Refresh Knox documents monthly to prevent document deletion

## Usage

1. Create a new project in Knox portal's "To-Do"
  The project name must start with +. Example: +Obsidian, +Friends
2. Knox Settings → General Settings → Auto login in other browsers → Enable
3. Install the plugin in your vault's plugin folder
4. Select "sync start" from the command palette

## Privacy Protection

- This plugin does not collect any information
- No information is transmitted externally

## Precautions

- Always back up before using
- If the file size is too large due to unclear capacity policies, synchronization may fail
- In case of document conflicts, the last modified document will be overwritten (Last Write Wins)

## Disclaimer

- You are solely responsible for any issues that occur while using this plugin.

## Feedback

Please report bugs and request features on GitHub Issues.
