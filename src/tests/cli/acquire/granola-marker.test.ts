import { createHash } from 'node:crypto'
import { lstat, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { describe, expect, test } from 'vitest'
import { sandbox } from '../_cli_helper.ts'

const id = '10000000-0000-4000-8000-000000000001'
const shared = '10000000-0000-4000-8000-000000000002'
const assetId = (index: number): string => `20000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jDbkAAAAASUVORK5CYII=',
  'base64'
)
const opaqueHash = (bytes: Uint8Array): string => createHash('sha1').update(bytes).digest('hex')
const exists = (path: string): Promise<boolean> =>
  lstat(path).then(
    () => true,
    () => false
  )

interface Settings {
  images?: number
  marker?: boolean
  text?: boolean
  pagedFolders?: boolean
  folderError?: string
  transcriptError?: string
  imageError?: string
  markerError?: string
  private?: boolean
  captured?: boolean
}

const fixture = async (settings: Settings = {}) => {
  const box = await sandbox()
  await box.setupCanonicalHarness()
  box.setEnv({ KI_GRANOLA_REQUEST_INTERVAL_MS: '0', KI_GRANOLA_RETRY_BASE_MS: '0' })
  await box.data.write(
    'ki/harnesses/knowledgeislands/ki-agentic-harness/skills/environment/ki-acquire-granola/SKILL.md',
    [
      '---',
      'name: ki-acquire-granola',
      'ki-depends-on: []',
      'ki-acquire-adapter: granola',
      'ki-acquire-actions: [import, status, reconcile, reset, mark]',
      'ki-acquire-repository-properties: [folder_ids, duplicate_folder_ids, unfoldered, residual, capture_root, folder_territories, acquired_folder_id]',
      'ki-acquire-invocation-properties: [refresh-transcripts, refresh-acquired]',
      'ki-acquire-capabilities: [account, folders, meetings, details, transcripts, attachments]',
      'ki-acquire-omissions: [audio]',
      'ki-acquire-mutation-boundary: explicit-marker',
      'ki-acquire-checkpoint: detail-transcript',
      'ki-acquire-reset-scopes: [adapter, source, component, rebuild]',
      '---'
    ].join('\n')
  )
  await box.project.write(
    '.ki.toml',
    [
      '[repo]',
      'harnesses = ["knowledgeislands/ki-agentic-harness"]',
      '[skills.ki-repo-project]',
      '[skills.ki-repo]',
      'repo_type = "project"',
      'primary_shape = "ki-repo-project"',
      'repository = "https://github.com/example/granola-marker"',
      '[skills.ki-acquire-granola]',
      'folder_ids = ["personal"]',
      'capture_root = "captures"',
      'unfoldered = "flag"',
      'residual = "flag"',
      ...(settings.marker === false ? [] : ['acquired_folder_id = "acquired"']),
      '[skills.ki-acquire-granola.folder_territories]',
      'personal = "personal"'
    ].join('\n')
  )
  await box.state.write(
    'ki/registry.toml',
    `schema = 1\n[repositories.target]\nrepository = "https://github.com/example/granola-marker"\npath = ${JSON.stringify(box.project.path)}\n`
  )
  const note = {
    id,
    folders: settings.captured ? ['personal', 'acquired'] : ['personal'],
    notes: '## Notes\nOwner note',
    transcript: 'Me: hello\nThem: reply',
    images: settings.images ?? 0
  }
  const calls: { tool: string; args: Record<string, unknown> }[] = []
  const committed = new Map<string, Buffer>()
  const responses = new Map<string, { exitCode: number; output: string }>()
  let imageBytes: Buffer = png
  const json = (value: unknown) => ({ exitCode: 0, output: JSON.stringify(value) })
  const reply = (value: unknown) =>
    settings.text ? json({ content: [{ type: 'text', text: `Data notice.\n${JSON.stringify(value)}` }] }) : json(value)
  const folder = {
    id: 'acquired',
    title: 'Acquired',
    visibility: settings.private === false ? 'workspace' : 'private',
    role: 'owner',
    audience: settings.private === false ? 'everyone' : 'only you'
  }
  box.setRunner(async (command, arguments_) => {
    if (command === 'git') {
      const verb = arguments_[2]
      const response = responses.get(`git:${verb}`)
      if (response) return response
      if (verb === 'show') {
        const path = String(arguments_[3]).replace(/^HEAD:/, '')
        const data = committed.get(path)
        return data ? { exitCode: 0, output: data.toString() } : { exitCode: 1, output: 'not committed' }
      }
      const path =
        verb === 'rev-parse'
          ? String(arguments_[4]).replace(/^HEAD:/, '')
          : relative(box.project.path, String(arguments_.at(-1)))
      const bytes =
        verb === 'rev-parse' ? committed.get(path) : await readFile(join(box.project.path, path)).catch(() => undefined)
      return bytes ? { exitCode: 0, output: opaqueHash(bytes) } : { exitCode: 1, output: 'missing' }
    }
    if (command !== 'mcporter') return { exitCode: 1, output: 'unexpected command' }
    const schemaResponse = responses.get('schema')
    if (arguments_[0] === 'list' && schemaResponse) return schemaResponse
    if (arguments_[0] === 'list')
      return json({
        tools: [
          'get_account_info',
          'list_meetings',
          'list_meeting_folders',
          'get_meetings',
          'get_meeting_transcript',
          'get_meeting_attachment',
          'add_note_to_folder',
          'sign_out',
          'remove_note_from_folder'
        ].map((name) => ({ name, inputSchema: { type: 'object' } }))
      })
    const tool = String(arguments_[1]).replace('granola.', '')
    const args = JSON.parse(String(arguments_[arguments_.indexOf('--args') + 1])) as Record<string, unknown>
    calls.push({ tool, args })
    const response = responses.get(tool)
    if (response) return response
    if (tool === 'get_account_info')
      return json({ email: 'owner@example.test', active_workspace: 'workspace', mcp_note_access: ['personal'] })
    if (tool === 'list_meeting_folders') {
      const folders = [{ id: 'personal', title: 'Personal' }, folder]
      if (settings.folderError === 'shape') return reply({ folders: {} })
      if (settings.folderError === 'missing') return reply({ folders: [{}] })
      if (settings.folderError === 'duplicate') return reply({ folders: [folder, folder] })
      if (settings.pagedFolders && !args['offset'])
        return reply({
          folders: folders.slice(0, 1),
          truncated: true,
          next_offset: settings.folderError === 'offset' ? 0 : 1
        })
      return reply({ folders: settings.pagedFolders ? folders.slice(1) : folders })
    }
    if (tool === 'list_meetings') {
      const owned = (args['involvement'] as Record<string, unknown> | undefined)?.['captured_by_me'] === true
      const listing = {
        id,
        date: '2026-10-06',
        title: 'Owner note',
        folders: note.folders.map((id) => ({ id })),
        ...(note.images ? { screenshot_count: note.images } : {})
      }
      const visible = !args['folder_id'] || note.folders.includes(String(args['folder_id']))
      const meetings = [
        ...(visible ? [listing] : []),
        ...(!owned ? [{ id: shared, title: 'Incoming shared', date: '2026-10-06' }] : [])
      ]
      if (settings.text)
        return json({
          content: [
            {
              type: 'text',
              text: `<meetings_data count="${meetings.length}">${meetings.map((item) => `<meeting id="${item.id}" title="${item.title}" date="2026-10-06"${note.images ? ` screenshot_count="${note.images}"` : ''}><folders>${note.folders.map((folder) => `<folder id="${folder}"/>`).join('')}</folders></meeting>`).join('')}</meetings_data>`
            }
          ]
        })
      return reply({ meetings })
    }
    if (tool === 'get_meetings') {
      const ids = args['meeting_ids'] as string[]
      if (settings.text)
        return json({
          content: [
            {
              type: 'text',
              text: `<meetings_data count="${ids.length}">${ids.map((id) => `<meeting id="${id}" title="Owner note" date="2026-10-06"><summary>${note.notes}</summary><attachments>${Array.from({ length: note.images }, (_, index) => `<attachment id="${assetId(index)}" type="screenshot"/>`).join('')}</attachments></meeting>`).join('')}</meetings_data>`
            }
          ]
        })
      return reply({
        meetings: ids.map((id) => ({
          id,
          title: 'Owner note',
          date: '2026-10-06',
          notes: note.notes,
          attachments: Array.from({ length: note.images }, (_, index) => ({
            id: settings.imageError === 'bad-id' ? 'unsafe' : assetId(settings.imageError === 'duplicate' ? 0 : index)
          }))
        }))
      })
    }
    if (tool === 'get_meeting_transcript') {
      if (settings.transcriptError === 'unavailable') return { exitCode: 1, output: 'No transcript available' }
      if (settings.transcriptError) {
        const offset = Number(args['offset'] ?? 0)
        if (!offset)
          return reply({
            transcript: settings.transcriptError === 'empty' ? undefined : 'Me: first',
            ...(settings.transcriptError === 'paged-default' ? {} : { offset: 0 }),
            total_chars: 30,
            truncated: true,
            next_offset: settings.transcriptError === 'offset' ? 0 : 10
          })
        return reply({
          transcript: 'Them: last',
          offset: settings.transcriptError === 'range' ? 11 : offset,
          total_chars: 30,
          truncated: false
        })
      }
      return reply({ transcript: note.transcript })
    }
    if (tool === 'get_meeting_attachment') {
      const ids = args['attachment_ids'] as string[]
      if (settings.imageError === 'failure')
        return json({ isError: true, content: [{ type: 'text', text: 'failure' }] })
      return json({
        content: ids.flatMap((attachment, index) => [
          ...(settings.imageError === 'missing' && !index
            ? []
            : [
                {
                  type: 'image',
                  mimeType: settings.imageError === 'mime' ? 'image/jpeg' : 'image/png',
                  data: settings.imageError === 'base64' ? '!!' : imageBytes.toString('base64')
                }
              ]),
          {
            type: 'text',
            text: `Data notice.\n${JSON.stringify({ meeting_id: id, attachment_id: settings.imageError === 'identity' ? shared : attachment, description: 'synthetic screenshot' })}`
          }
        ])
      })
    }
    if (tool === 'add_note_to_folder') {
      if (settings.markerError === 'failure') return { exitCode: 1, output: 'Marker write rejected' }
      if (!settings.markerError) note.folders = [...new Set([...note.folders, String(args['folder_id'])])]
      return reply({ outcome: 'added', note_id: id, folder })
    }
    return { exitCode: 1, output: 'unexpected tool' }
  })
  const command = ['ki', 'acquire', 'import', '--adapter', 'granola', '--since', '2026-10-06', '--until', '2026-10-16']
  const mark = ['ki', 'acquire', 'mark', '--adapter', 'granola', '--since', '2026-10-06', '--until', '2026-10-16']
  const commit = async () => {
    for (const name of await readdir(box.project.path, { recursive: true, withFileTypes: true })) {
      if (name.isFile()) {
        const path = relative(box.project.path, join(name.parentPath, name.name))
        committed.set(path, await readFile(join(box.project.path, path)))
      }
    }
  }
  const ledger = async () => JSON.parse(await box.project.read('.acquire/granola/ledger.json'))
  const respond = (tool: string, value: unknown, exitCode = 0) =>
    responses.set(tool, { exitCode, output: exitCode ? String(value) : JSON.stringify(value) })
  return {
    respond,
    responses,
    box,
    note,
    calls,
    command,
    mark,
    commit,
    ledger,
    committed,
    folder,
    setImageBytes: (value: Buffer) => {
      imageBytes = value
    }
  }
}

describe('[Granola screenshots and Acquired markers]', () => {
  test('captures owned notes and exact images in batches, commits proof, and adds only marker membership', async () => {
    const f = await fixture({ images: 8, pagedFolders: true })
    const imported = await f.box.run(f.command)
    expect(imported.exitCode, imported.stderr).toBe(0)
    expect(imported.stdout).toContain('8 screenshots')
    expect(
      f.calls
        .filter((call) => call.tool === 'get_meeting_attachment')
        .map((call) => (call.args['attachment_ids'] as string[]).length)
    ).toEqual([5, 3])
    expect(
      f.calls
        .filter((call) => call.tool === 'list_meetings')
        .every((call) => (call.args['involvement'] as Record<string, unknown>)['captured_by_me'] === true)
    ).toBe(true)
    expect(
      f.calls.some((call) => ['add_note_to_folder', 'sign_out', 'remove_note_from_folder'].includes(call.tool))
    ).toBe(false)
    const entry = (await f.ledger()).meetings[id]
    const directory = join(f.box.project.path, entry.path, '..')
    const manifest = JSON.parse(await readFile(join(directory, `${id}--attachments.json`), 'utf8'))
    expect(manifest.assets).toHaveLength(8)
    expect(await readFile(join(directory, manifest.assets[0].file))).toEqual(png)
    expect(await f.box.project.read(entry.path)).toContain('attachment_state: verified-mcp')
    const uncommitted = await f.box.run([...f.mark, '--confirm'])
    expect(uncommitted.exitCode).toBe(1)
    expect(f.note.folders).toEqual(['personal'])
    await f.commit()
    const preview = await f.box.run(f.mark)
    expect(preview.exitCode).toBe(0)
    expect(preview.stdout).toContain('1 verified, 0 marked')
    const marked = await f.box.run([...f.mark, '--source', id, '--confirm'])
    expect(marked.exitCode).toBe(0)
    expect(marked.stdout).toContain('1 marked')
    expect(f.note.folders).toEqual(['personal', 'acquired'])
    const before = f.calls.length
    const repeated = await f.box.run(f.command)
    expect(repeated.exitCode).toBe(0)
    expect(repeated.stdout).toContain('1 skipped')
    expect(
      f.calls
        .slice(before)
        .some((call) => ['get_meetings', 'get_meeting_transcript', 'get_meeting_attachment'].includes(call.tool))
    ).toBe(false)
    expect((await f.box.run([...f.mark, '--confirm'])).stdout).toContain('1 already acquired')
    expect((await f.box.run([...f.command, '--refresh-acquired', '--refresh-transcripts'])).exitCode).toBe(0)
    expect(Object.keys((await f.ledger()).meetings)).toEqual([id])
    expect(
      f.calls.some((call) => call.tool === 'get_meetings' && (call.args['meeting_ids'] as string[]).includes(shared))
    ).toBe(false)
  })

  test('records an explicit empty image inventory and leaves dry runs unchanged', async () => {
    const f = await fixture({ text: true })
    const preview = await f.box.run([...f.command, '--dry-run'])
    expect(preview.exitCode).toBe(0)
    expect(await exists(join(f.box.project.path, '.acquire'))).toBe(false)
    expect((await f.box.run(f.command)).exitCode).toBe(0)
    await f.commit()
    expect((await f.box.run([...f.mark, '--confirm'])).exitCode).toBe(0)
    expect(f.calls.some((call) => call.tool === 'get_meeting_attachment')).toBe(false)
  })

  test.each(['paged', 'paged-default'])(
    'joins all transcript pages without treating the first page as complete: %s',
    async (transcriptError) => {
      const f = await fixture({ transcriptError, text: true })
      expect((await f.box.run(f.command)).exitCode).toBe(0)
      const entry = (await f.ledger()).meetings[id]
      const document = await f.box.project.read(entry.path)
      expect(document).toContain('Me: first')
      expect(document).toContain('Them: last')
      expect(
        f.calls.filter((call) => call.tool === 'get_meeting_transcript').map((call) => call.args['offset'])
      ).toEqual([undefined, 10])
    }
  )

  test.each(['shape', 'missing', 'duplicate', 'offset'])(
    'refuses incomplete folder enumeration: %s',
    async (folderError) => {
      const f = await fixture({ pagedFolders: true, folderError })
      expect((await f.box.run(f.command)).exitCode).toBe(1)
      expect(f.calls.some((call) => call.tool === 'add_note_to_folder')).toBe(false)
    }
  )

  test.each(['empty', 'offset', 'range'])('refuses incomplete transcript pagination: %s', async (transcriptError) => {
    const f = await fixture({ transcriptError })
    expect((await f.box.run(f.command)).exitCode).toBe(1)
    expect(await exists(join(f.box.project.path, '.acquire/granola/ledger.json'))).toBe(false)
  })

  test.each(['bad-id', 'duplicate', 'failure', 'missing', 'mime', 'base64', 'identity'])(
    'preserves source and refuses an invalid image projection: %s',
    async (imageError) => {
      const f = await fixture({ images: 2, imageError })
      expect((await f.box.run(f.command)).exitCode).toBe(1)
      expect(await exists(join(f.box.project.path, '.acquire/granola/ledger.json'))).toBe(false)
      expect(f.calls.some((call) => call.tool === 'add_note_to_folder')).toBe(false)
    }
  )

  test('flags an Acquired marker without local evidence instead of silently dropping or importing it', async () => {
    const f = await fixture({ captured: true })
    const result = await f.box.run(f.command)
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('acquired-without-proof')
    expect(f.calls.some((call) => call.tool === 'get_meetings')).toBe(false)
    expect((await f.box.run([...f.command, '--refresh-acquired'])).exitCode).toBe(0)
  })

  test.each(['failure', 'ignored'])(
    'does not report success for a failed marker operation: %s',
    async (markerError) => {
      const f = await fixture({ markerError })
      expect((await f.box.run(f.command)).exitCode).toBe(0)
      await f.commit()
      const result = await f.box.run([...f.mark, '--confirm'])
      expect(result.exitCode).toBe(1)
      expect(result.stdout).toContain('0 marked')
      expect(f.note.folders).toEqual(['personal'])
    }
  )

  test('keeps source amendments and changed screenshot bytes unmarked', async () => {
    const f = await fixture({ images: 1 })
    expect((await f.box.run(f.command)).exitCode).toBe(0)
    await f.commit()
    f.note.notes = 'Changed after capture'
    expect((await f.box.run([...f.mark, '--confirm'])).stdout).toContain('source note changed')
    f.note.notes = '## Notes\nOwner note'
    f.note.transcript = 'Changed transcript'
    expect((await f.box.run([...f.mark, '--confirm'])).stdout).toContain('transcript changed')
    f.note.transcript = 'Me: hello\nThem: reply'
    f.setImageBytes(Buffer.concat([png, Buffer.from([0])]))
    expect((await f.box.run([...f.mark, '--confirm'])).stdout).toContain('screenshots differ')
    expect(f.note.folders).toEqual(['personal'])
  })

  test('retains prior manifest evidence on refresh and refuses changed bytes for an immutable attachment ID', async () => {
    const f = await fixture({ images: 1 })
    expect((await f.box.run(f.command)).exitCode).toBe(0)
    const entry = (await f.ledger()).meetings[id]
    f.note.notes = 'Updated source'
    expect((await f.box.run([...f.command, '--refresh-transcripts'])).exitCode).toBe(0)
    const directory = join(f.box.project.path, entry.path, '..')
    expect((await readdir(join(directory, 'source-evidence'))).length).toBe(1)
    f.setImageBytes(Buffer.concat([png, Buffer.from([0])]))
    expect((await f.box.run(f.command)).stderr).toContain('changed bytes')
  })

  test('refuses unsafe folder settings, a missing marker selector and unrelated source identities', async () => {
    const unsafe = await fixture({ private: false })
    expect((await unsafe.box.run(unsafe.command)).stderr).toContain('private folder')
    const missing = await fixture({ marker: false })
    expect((await missing.box.run([...missing.mark, '--confirm'])).stderr).toContain('acquired_folder_id')
    const f = await fixture()
    expect((await f.box.run(f.command)).exitCode).toBe(0)
    await f.commit()
    expect((await f.box.run([...f.mark, '--source', shared, '--confirm'])).stderr).toContain('distinct owned note')
    expect((await f.box.run([...f.mark, '--source', id, id, '--confirm'])).exitCode).toBe(1)
  })

  test('refuses local mutations, a missing staged file and an interrupted journal before marking', async () => {
    const f = await fixture({ images: 1 })
    expect((await f.box.run(f.command)).exitCode).toBe(0)
    await f.commit()
    const entry = (await f.ledger()).meetings[id]
    const content = await f.box.project.read(entry.path)
    await f.box.project.write(entry.path, `${content}\nchanged`)
    expect((await f.box.run([...f.mark, '--confirm'])).exitCode).toBe(1)
    await f.box.project.write(entry.path, content)
    await rm(join(f.box.project.path, entry.path))
    expect((await f.box.run([...f.mark, '--confirm'])).exitCode).toBe(1)
    await f.box.project.write(entry.path, content)
    f.committed.clear()
    expect((await f.box.run([...f.mark, '--confirm'])).exitCode).toBe(1)
    await writeFile(join(f.box.project.path, '.acquire/granola/journal.json'), '{}')
    expect((await f.box.run([...f.mark, '--confirm'])).exitCode).toBe(1)
    expect(f.note.folders).toEqual(['personal'])
  })

  test('requires an explicitly selected marker action and a current source-bound receipt', async () => {
    const f = await fixture()
    expect((await f.box.run(['ki', 'acquire', 'mark'])).exitCode).toBe(2)
    expect((await f.box.run([...f.mark, '--confirm'])).stderr).toContain('current preservation checkpoint')
    expect((await f.box.run(f.command)).exitCode).toBe(0)
    await f.commit()
    f.respond('get_account_info', {
      email: 'changed@example.test',
      active_workspace: 'workspace',
      mcp_note_access: ['personal']
    })
    expect((await f.box.run([...f.mark, '--confirm'])).stderr).toContain('account does not match')
    f.responses.clear()
    const schema = (tools: string[]) => ({ tools: tools.map((name) => ({ name, inputSchema: {} })) })
    const reads = [
      'get_account_info',
      'list_meetings',
      'list_meeting_folders',
      'get_meetings',
      'get_meeting_transcript'
    ]
    f.respond('schema', schema(reads))
    expect((await f.box.run([...f.mark, '--confirm'])).stderr).toContain('screenshot access')
    f.respond('schema', schema([...reads, 'get_meeting_attachment']))
    expect((await f.box.run([...f.mark, '--confirm'])).stderr).toContain('folder-marker tool')
  })

  test('uses the current UTC date for an omitted marker end and refuses a missing source identity', async () => {
    const f = await fixture()
    await f.box.run(f.command)
    await f.commit()
    const preview = await f.box.run(f.mark.slice(0, -2), { now: () => Date.parse('2026-10-16T12:00:00Z') })
    expect(preview.exitCode).toBe(0)
    expect(preview.stdout).toContain('1 verified')
    f.respond('list_meetings', { meetings: [{}] })
    expect((await f.box.run(f.command)).stderr).toContain('no stable identity')
  })

  test('checks ledger and committed blobs independently of local checksums', async () => {
    const f = await fixture({ images: 1 })
    await f.box.run(f.command)
    await f.commit()
    const ledger = await f.ledger()
    const entry = ledger.meetings[id]
    const path = entry.path as string
    f.committed.delete(path)
    expect((await f.box.run(f.mark)).stdout).toContain('not committed at HEAD')
    await f.commit()
    f.committed.set(path, Buffer.from('different committed bytes'))
    expect((await f.box.run(f.mark)).stdout).toContain('not committed at HEAD')
    await f.commit()
    f.respond('git:hash-object', '', 1)
    expect((await f.box.run(f.mark)).exitCode).toBe(1)
    f.respond('git:rev-parse', '')
    f.responses.delete('git:hash-object')
    expect((await f.box.run(f.mark)).exitCode).toBe(1)
    f.responses.clear()
    ledger.meetings[id].acquired_at = '2026-10-01T00:00:00Z'
    await f.box.project.write('.acquire/granola/ledger.json', JSON.stringify(ledger))
    expect((await f.box.run(f.mark)).stdout).toContain('receipt differs')
  })

  test.each(['provider', 'version', 'count'])('refuses stale screenshot preservation proof: %s', async (change) => {
    const f = await fixture({ images: 1 })
    await f.box.run(f.command)
    const entry = (await f.ledger()).meetings[id]
    const path = join(entry.path, '..', `${id}--attachments.json`)
    const manifest = JSON.parse(await f.box.project.read(path))
    if (change === 'provider') delete manifest.provider
    if (change === 'version') manifest.detail_sha256 = '0'.repeat(64)
    if (change === 'count') f.note.images = 2
    await f.box.project.write(path, JSON.stringify(manifest))
    await f.commit()
    expect((await f.box.run(f.mark)).stdout).toContain('screenshot inventory is not verified')
  })

  test('leaves unavailable transcripts, missing receipts, changed folders and unavailable details unmarked', async () => {
    const unavailable = await fixture({ transcriptError: 'unavailable' })
    await unavailable.box.run(unavailable.command)
    await unavailable.commit()
    expect((await unavailable.box.run(unavailable.mark)).stdout).toContain('available transcript')
    const f = await fixture()
    await f.box.run(f.command)
    await f.commit()
    f.note.folders = ['personal', 'new-folder']
    expect((await f.box.run(f.mark)).stdout).toContain('memberships changed')
    f.note.folders = ['personal']
    f.respond('get_meetings', { meetings: [], not_found: [id] })
    expect((await f.box.run(f.mark)).stdout).toContain('source detail is unavailable')
    f.responses.clear()
    const ledger = await f.ledger()
    delete ledger.meetings[id]
    await f.box.project.write('.acquire/granola/ledger.json', JSON.stringify(ledger))
    await f.commit()
    expect((await f.box.run(f.mark)).stdout).toContain('No preservation receipt')
  })

  test.each([
    { folders: undefined },
    { folder_ids: ['personal'] },
    { folders: ['personal', 'personal'] },
    { folders: [{}] },
    { folders: ['personal'] }
  ])('requires authoritative unambiguous source memberships: %j', async (membership) => {
    const f = await fixture()
    await f.box.run(f.command)
    await f.commit()
    f.respond('list_meetings', { meetings: [{ id, date: '2026-10-06', title: 'Owner note', ...membership }] })
    const result = await f.box.run(f.mark)
    expect(result.stdout).toContain('0 marked')
    expect(f.note.folders).toEqual(['personal'])
  })

  test.each(['<folders><folder/></folders>', '<summary>note</summary>'])(
    'refuses incomplete XML folder evidence: %s',
    async (body) => {
      const f = await fixture()
      await f.box.run(f.command)
      await f.commit()
      f.respond('list_meetings', {
        content: [
          {
            type: 'text',
            text: `<meetings_data count="1"><meeting id="${id}" title="Owner note" date="2026-10-06">${body}</meeting></meetings_data>`
          }
        ]
      })
      expect((await f.box.run(f.mark)).exitCode).toBe(1)
    }
  )

  test.each([
    ['list_meeting_folders', []],
    ['list_meeting_folders', { data: { folders: [] } }],
    ['list_meeting_folders', { content: [{ type: 'text', text: 'notice {invalid}' }] }],
    ['list_meetings', { meetings: [{ id, folders: [{ id: 'personal' }], screenshot_count: -1 }] }],
    ['list_meetings', { meetings: [{ id, folders: [{ id: 'personal' }], screenshot_count: 'invalid' }] }],
    ['get_meetings', { meetings: [{ id, attachments: {} }] }],
    ['get_meetings', { meetings: [{ id, attachments: [{}] }] }],
    [
      'get_meetings',
      {
        content: [
          { type: 'text', text: `<meetings_data count="1"><meeting id="${id}"><attachment/></meeting></meetings_data>` }
        ]
      }
    ]
  ])('refuses malformed or incomplete source evidence without marking: %s', async (tool, value) => {
    const f = await fixture({ images: 1 })
    f.respond(String(tool), value)
    expect((await f.box.run([...f.command, '--refresh-acquired'])).exitCode).toBe(1)
    expect(f.calls.some((call) => call.tool === 'add_note_to_folder')).toBe(false)
  })

  test.each(['empty', 'count', 'noncanonical', 'transport', 'wrapper'])(
    'handles image transport variants safely: %s',
    async (kind) => {
      const f = await fixture({ images: 1 })
      const image = {
        type: 'image',
        mimeType: 'image/png',
        data: kind === 'noncanonical' ? 'AB==' : png.toString('base64')
      }
      const metadata = { type: 'text', text: JSON.stringify({ meeting_id: id, attachment_id: assetId(0) }) }
      const response = {
        content: kind === 'empty' ? [] : kind === 'count' ? [image, metadata, image, metadata] : [image, metadata]
      }
      f.respond(
        'get_meeting_attachment',
        kind === 'wrapper' ? { result: response } : response,
        kind === 'transport' ? 1 : 0
      )
      expect((await f.box.run(f.command)).exitCode).toBe(kind === 'wrapper' ? 0 : 1)
    }
  )

  test('validates marker declarations and rejects routing the progress folder', async () => {
    const f = await fixture()
    const path = 'ki/harnesses/knowledgeislands/ki-agentic-harness/skills/environment/ki-acquire-granola/SKILL.md'
    const original = await f.box.data.read(path)
    await f.box.data.write(path, original.replace('explicit-marker', 'read-only'))
    expect((await f.box.run(f.mark)).exitCode).not.toBe(0)
    await f.box.data.write(path, original)
    const config = await f.box.project.read('.ki.toml')
    for (const value of ['"personal"', '""', '123']) {
      await f.box.project.write(
        '.ki.toml',
        config.replace('acquired_folder_id = "acquired"', `acquired_folder_id = ${value}`)
      )
      expect((await f.box.run(f.command)).exitCode).not.toBe(0)
    }
  })

  test('retains handled proof without recreating removed captures or granting a new marker', async () => {
    const f = await fixture()
    await f.box.run(f.command)
    const ledger = await f.ledger()
    const entry = ledger.meetings[id]
    entry.disposition = {
      ...entry.disposition,
      state: 'harvested-locally',
      canonical_destination: 'handled/meeting.md'
    }
    await f.box.project.write('.acquire/granola/ledger.json', JSON.stringify(ledger))
    await f.commit()
    expect((await f.box.run(f.mark)).stdout).toContain('complete local capture')
    await rm(join(f.box.project.path, entry.path))
    await f.commit()
    expect((await f.box.run(f.mark)).stdout).toContain('complete local capture')
    f.note.folders.push('acquired')
    expect((await f.box.run(f.command)).stdout).toContain('1 skipped')
    expect(await exists(join(f.box.project.path, entry.path))).toBe(false)
  })

  test('refuses a valid interrupted journal before any provider write', async () => {
    const f = await fixture()
    await f.box.run(f.command)
    await f.commit()
    f.respond('get_meeting_transcript', 'transport disconnected', 1)
    expect((await f.box.run([...f.command, '--refresh-transcripts'])).exitCode).toBe(1)
    expect((await f.box.run(f.mark)).stderr).toContain('interrupted acquisition journal')
  })

  test('reuses immutable images and archived manifests and detects corrupted archive evidence', async () => {
    const f = await fixture({ images: 1 })
    await f.box.run(f.command)
    const entry = (await f.ledger()).meetings[id]
    const path = join(entry.path, '..', `${id}--attachments.json`)
    const original = await f.box.project.read(path)
    expect((await f.box.run(f.command)).stdout).toContain('1 unchanged')
    f.note.notes = 'new version'
    await f.box.run(f.command)
    f.note.notes = '## Notes\nOwner note'
    await f.box.run(f.command)
    f.note.notes = 'new version'
    expect((await f.box.run(f.command)).exitCode).toBe(0)
    f.note.notes = '## Notes\nOwner note'
    await f.box.run(f.command)
    const hash = createHash('sha256').update(original).digest('hex')
    await f.box.project.write(join(entry.path, '..', 'source-evidence', `images-${hash}.json`), 'corrupted')
    f.note.notes = 'new version'
    expect((await f.box.run(f.command)).stderr).toContain('archive changed bytes')
  })

  test('accepts advertised JPEG bytes and excludes invalid meeting identities', async () => {
    const f = await fixture({ images: 1, text: true })
    f.respond('get_meeting_attachment', {
      content: [
        { type: 'image', mimeType: 'image/jpeg', data: Buffer.from([255, 216, 255, 0]).toString('base64') },
        { type: 'text', text: JSON.stringify({ meeting_id: id, attachment_id: assetId(0) }) }
      ]
    })
    expect((await f.box.run(f.command)).exitCode).toBe(0)
    const invalid = await fixture()
    invalid.respond('list_meetings', {
      meetings: [{ id: 'invalid', date: '2026-10-06', folders: [{ id: 'personal' }] }]
    })
    invalid.respond('get_meetings', { meetings: [{ id: 'invalid' }] })
    expect((await invalid.box.run([...invalid.command, '--refresh-acquired'])).stderr).toContain(
      'destination identity is unsafe'
    )
  })

  test('keeps acquired-only memberships independent of unfoldered routing', async () => {
    const f = await fixture()
    const config = await f.box.project.read('.ki.toml')
    await f.box.project.write(
      '.ki.toml',
      config.replace('unfoldered = "flag"', 'unfoldered = true').replace('residual = "flag"', 'residual = false')
    )
    f.note.folders = []
    expect((await f.box.run(f.command)).exitCode).toBe(0)
    await f.commit()
    expect((await f.box.run([...f.mark, '--confirm'])).exitCode).toBe(0)
    expect(f.note.folders).toEqual(['acquired'])
    expect((await f.box.run(f.command)).stdout).toContain('1 skipped')
    expect((await f.box.run([...f.command, '--refresh-acquired'])).exitCode).toBe(0)
  })

  test('rejects a progress folder selected as a different receiver territory', async () => {
    const f = await fixture()
    const peer = await f.box.root.mkdir('peer')
    const config = await f.box.project.read('.ki.toml')
    await writeFile(
      join(peer, '.ki.toml'),
      config
        .replace('example/granola-marker', 'example/granola-peer')
        .replace('acquired_folder_id = "acquired"', '')
        .replace('folder_ids = ["personal"]', 'folder_ids = ["acquired"]')
        .replace('personal = "personal"', 'acquired = "personal"')
    )
    await f.box.state.write(
      'ki/registry.toml',
      `schema = 1\n[repositories.target]\nrepository = "https://github.com/example/granola-marker"\npath = ${JSON.stringify(f.box.project.path)}\n[repositories.peer]\nrepository = "https://github.com/example/granola-peer"\npath = ${JSON.stringify(peer)}\n`
    )
    expect((await f.box.run(f.command)).stderr).toContain('separate from every receiver')
  })

  test.each(['present', 'missing', 'stale', 'unavailable-detail'])(
    'verifies MCP screenshot evidence before journal reuse: %s',
    async (state) => {
      const f = await fixture({ images: 1 })
      if (state === 'unavailable-detail') f.respond('get_meetings', { meetings: [], not_found: [id] })
      await f.box.run(f.command)
      const ledger = await f.ledger()
      const entry = ledger.meetings[id]
      const journal = {
        schema: 1,
        phase: 'in-progress',
        run_id: 'test-run',
        adapter: 'granola',
        repository: ledger.repository,
        account_sha256: ledger.account_sha256,
        source_schema_sha256: ledger.source_schema_sha256,
        discovery_interval: ledger.interval,
        identity_checkpoint_sha256: ledger.identity_checkpoint_sha256,
        selected_identities: [id],
        remaining_identities: [],
        failures: [],
        retry_state: {},
        created_at: ledger.updated_at,
        updated_at: ledger.updated_at,
        components: {
          [id]: {
            detail_sha256: entry.detail_sha256,
            transcript_sha256: entry.transcript_sha256,
            transcript_state: entry.transcript_state,
            transcript_observed_at: entry.transcript_observed_at,
            staged_document_path: entry.path,
            staged_document_sha256: entry.document_sha256,
            verified_at: ledger.updated_at,
            checkpoint: entry
          }
        }
      }
      await f.box.project.write('.acquire/granola/journal.json', JSON.stringify(journal))
      const path = join(entry.path, '..', `${id}--attachments.json`)
      if (state === 'missing') await rm(join(f.box.project.path, path))
      if (state === 'stale') {
        const manifest = JSON.parse(await f.box.project.read(path))
        manifest.detail_sha256 = '0'.repeat(64)
        await f.box.project.write(path, JSON.stringify(manifest))
      }
      const result = await f.box.run(f.command)
      expect(result.exitCode, result.stderr).toBe(['present', 'unavailable-detail'].includes(state) ? 0 : 1)
      if (['present', 'unavailable-detail'].includes(state)) expect(result.stdout).toContain('1 resumed')
      else expect(await exists(join(f.box.project.path, '.acquire/granola/journal.json'))).toBe(true)
    }
  )
})
