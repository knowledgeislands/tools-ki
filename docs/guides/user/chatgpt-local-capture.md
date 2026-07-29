# ChatGPT local-capture format

`ki acquire chatgpt import` accepts only a user-prepared local capture directory. It never signs in to ChatGPT, controls a browser, contacts a network service, reads a browser profile or credentials, discovers a repository, or extracts knowledge.

The capture is an input adapter, not a KEP. The importer validates it before creating the selected KEP output directory.

## Layout

```text
capture/
├── capture.toml
├── originals/
│   └── export.json
├── records/
│   └── conversation.md
├── assets/
│   └── attachment.png
└── relationships/
    └── native.jsonl
```

`originals/` and `records/` each require at least one regular file. `assets/` may be empty, but it must exist. Record paths must end in `.md`. Every path is relative, contains only letters, numbers, `.`, `_`, `-`, and `/`, and must not be a symbolic link or escape its directory.

## Capture metadata

`capture.toml` must contain exactly these fields, in any order, with no extra fields:

```toml
format = "ki-chatgpt-capture"
format_version = "0.1.0"
capture_boundary = "One exported conversation: example-001"
omissions = ["No project membership was available"]
```

The capture boundary names the bounded material selected by the user. `omissions` is always present: use `[]` only when the capture has no known omission.

## Source-native relationships

`relationships/native.jsonl` contains one compact JSON object per line. The importer accepts only these source-native forms:

```json
{"type":"conversation-order","record":"records/conversation.md","position":1}
{"type":"message-asset","record":"records/conversation.md","asset":"assets/attachment.png","message_id":"message-001"}
{"type":"project-conversation","record":"records/conversation.md","project_id":"project-001"}
```

Every referenced record and asset must exist. `conversation-order` positions are unique. The importer sorts relationship records deterministically and rejects duplicate, blank, malformed, inferred, or semantic relationship records.

## Result

The importer copies originals and assets byte-for-byte, places records below `source/records/`, normalises relationship record paths below `source/records/`, and creates the KIS-0002 `kep.toml` plus lexicographically ordered SHA-256 checksums. Repeating an import with identical capture content produces byte-identical KEP payloads and the same `kep:sha256:` identity.

Use `--dry-run` to validate and report the proposed package without creating the output directory.
