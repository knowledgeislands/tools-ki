# Import a local ChatGPT capture

Use this guide to turn conversation material you have already exported from ChatGPT into a Knowledge Exchange Package. The adapter is local only: it never contacts ChatGPT, automates a browser, reads credentials, discovers a repository, or extracts knowledge. Everything it consumes, you assemble yourself first.

That assembly is the whole of the work. `ki` validates the capture strictly and refuses a malformed one rather than publishing a partial package, so it is worth building the tree correctly before the first run.

## Assemble the capture directory

A capture is one directory containing exactly these five entries, and nothing else:

```text
capture/
├── capture.toml                 declaration of format and honest boundary
├── originals/                   the raw export, unmodified
├── records/                     the human-readable rendering
├── assets/                      attachments referenced by the records
└── relationships/native.jsonl   ordering and asset links between the above
```

`capture.toml` carries four fields and no others:

```toml
format = "ki-chatgpt-capture"
format_version = "0.1.0"
capture_boundary = "One exported conversation: cli-002"
omissions = ["No project membership was available"]
```

`capture_boundary` states what this capture covers, and `omissions` lists what it knowingly leaves out. Both are required, and `omissions` may be an empty array — the field exists so that a capture records its own incompleteness rather than implying it is whole. Both accept plain text only; quotation marks, newlines, and other punctuation outside a conservative set are rejected.

`relationships/native.jsonl` holds one compact JSON object per line, each of one of three types:

```text
{"type":"conversation-order","record":"records/conversation.md","position":1}
{"type":"message-asset","record":"records/conversation.md","asset":"assets/example.png","message_id":"message-001"}
{"type":"project-conversation","record":"records/conversation.md","project_id":"project-001"}
```

Every referenced record and asset must exist, each conversation position must be unique, and no line may be blank or repeated.

Throughout the tree, every path segment must be a plain relative name — no absolute paths, no `.` or `..`, no doubled separators, and no characters outside letters, digits, `.`, `_`, and `-`. Symbolic links and non-regular files are rejected anywhere in the capture, including as the capture root itself. These are safety rules rather than style: the adapter copies file content into a package, and it will not follow a link out of the tree you named.

## Import it

Validate before writing anything:

```sh
ki acquire import --adapter chatgpt --capture ./capture --output ./conversation.kep --dry-run
```

The dry run performs every read and every validation and creates no output. When it reports what you expect — record, asset, and relationship counts, and your declared omissions — run it for real:

```sh
ki acquire import --adapter chatgpt --capture ./capture --output ./conversation.kep
```

The output directory must not already exist, and must sit outside the capture tree; the adapter refuses an unsafe or occupied output location rather than merging into it. The package is written to a staging path and moved into place only once complete, so an interrupted run leaves no half-written output. The result is a deterministic Knowledge Exchange Package conforming to the KIS-0002 payload layout: the same capture produces the same package.

## Verify

Check that the reported counts match the capture you built, and that the declared omissions appear in the result. The package directory is ordinary files; inspect it directly.

Re-running the import against the same output path fails rather than overwriting. To rebuild, remove the previous output explicitly and run again.

## Recovery

| Message | Cause | Action |
| --- | --- | --- |
| `capture.toml is required` | Missing, or present as a symbolic link | Provide a regular `capture.toml` at the capture root |
| `capture metadata contains an unsupported field` | A key outside the four permitted ones | Remove it; the format has no extension point |
| `capture metadata format_version must be 0.1.0` | A version this adapter does not accept | Use `0.1.0` |
| `capture_boundary contains unsupported characters` | Punctuation outside the permitted set | Rewrite the sentence in plain text |
| `omissions must be a compact array of plain strings` | Multi-line or loosely formatted array | Write it on one line, or as `[]` |
| `relationship references a missing record` or `missing asset` | A relationship names a file that is not there | Correct the path, or add the file |
| `relationship repeats a conversation position` | Two records claim the same position | Renumber; positions are unique and start at 1 |
| `capture contains an unsafe file` | A symbolic link, FIFO, or similar in the tree | Replace it with a regular file |
| `originals contains an unsafe path` | A path segment outside the permitted character set | Rename the file |
| `output directory already exists` | A previous package occupies that path | Remove it explicitly, or choose another path |
| `output directory must be outside capture-directory` | The output path is inside the capture tree | Choose a sibling or unrelated directory |

Exact grammar is in `ki acquire import --help` and the installed `man ki` manual. The command validates the package layout and the capture boundary before it publishes any output.

For provider-backed acquisition rather than a local capture, see [acquire Granola meetings](granola-acquisition.md).
