import { execFile } from 'node:child_process'
import { lstat, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'

const runMkfifo = promisify(execFile)

// A capture directory, addressed by paths relative to its root — so no test computes a
// filesystem path with `join` against the capture tree, mirroring how `SandboxArea` in
// _cli_helper.ts addresses a sandbox root.
export interface CaptureArea {
  readonly path: string
  readonly write: (relativePath: string, content: string | Buffer) => Promise<void>
  readonly read: (relativePath: string) => Promise<string>
  readonly remove: (relativePath: string, options?: { readonly recursive?: boolean }) => Promise<void>
  readonly mkdir: (relativePath: string) => Promise<void>
  readonly symlink: (targetRelativePath: string, linkRelativePath: string) => Promise<void>
  readonly mkfifo: (relativePath: string) => Promise<void>
  readonly isSymlink: (relativePath: string) => Promise<boolean>
  readonly writeMetadata: (lines: readonly string[]) => Promise<void>
}

const capture = (path: string): CaptureArea => {
  const resolve = (relativePath: string): string => join(path, relativePath)
  return {
    path,
    write: (relativePath, content) => writeFile(resolve(relativePath), content),
    read: (relativePath) => readFile(resolve(relativePath), 'utf8'),
    remove: (relativePath, options) => rm(resolve(relativePath), options),
    mkdir: (relativePath) => mkdir(resolve(relativePath), { recursive: true }).then(() => undefined),
    symlink: (targetRelativePath, linkRelativePath) => symlink(resolve(targetRelativePath), resolve(linkRelativePath)),
    mkfifo: (relativePath) => runMkfifo('mkfifo', [resolve(relativePath)]).then(() => undefined),
    isSymlink: async (relativePath) => (await lstat(resolve(relativePath))).isSymbolicLink(),
    writeMetadata: (lines) => writeFile(resolve('capture.toml'), `${lines.join('\n')}\n`)
  }
}

// A minimal but valid ki-chatgpt-capture tree, for exercising `ki acquire chatgpt import`
// against a well-formed source:
//
// <root>/capture/
// ├── capture.toml
// ├── originals/export.json         (the raw ChatGPT export)
// ├── records/conversation.md       (the human-readable rendering)
// ├── assets/example.png            (a referenced attachment)
// └── relationships/native.jsonl    (order + asset links between the above)
export const makeCapture = async (root: string): Promise<CaptureArea> => {
  const area = capture(join(root, 'capture'))
  await Promise.all(['originals', 'records', 'assets', 'relationships'].map((directory) => area.mkdir(directory)))
  await area.writeMetadata([
    'format = "ki-chatgpt-capture"',
    'format_version = "0.1.0"',
    'capture_boundary = "One exported conversation: cli-002"',
    'omissions = ["No project membership was available"]'
  ])
  await area.write('originals/export.json', '{"conversation_id":"cli-002"}\n')
  await area.write('records/conversation.md', '# CLI-002 conversation\n\nuser: Please preserve this source record.\n')
  await area.write('assets/example.png', Buffer.from([0x89, 0x50, 0x4e, 0x47]))
  await area.write(
    'relationships/native.jsonl',
    [
      '{"type":"conversation-order","record":"records/conversation.md","position":1}',
      '{"type":"message-asset","record":"records/conversation.md","asset":"assets/example.png","message_id":"message-001"}',
      ''
    ].join('\n')
  )
  return area
}
