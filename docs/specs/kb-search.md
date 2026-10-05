# Knowledge Base search — KB-SEARCH

This area specifies the registry-owned derived search boundary. The Harness owns qmd adoption and mirror-content policy; this repository owns its concrete CLI and generated mapping. The pinned pilot and portable interface are published; CLI verification passes and independent review and acceptance are pending.

Generated model settings use absolute already-provisioned GGUF paths under `model_cache/qmd/models`; lexical mode needs no models, vector needs embedding, CLI hybrid needs all three and REST hybrid needs embedding and reranking. Missing models fail clearly before a read invokes retrieval. No read downloads models or provisions runtime state. qmd retrieval may update its private derived LLM cache; read purity means no canonical KB or registry mutation, installation, index refresh or daemon provisioning. Engine line numbers are hints; returned snippets and citations use independently selected current local line arrays. Input is limited to 10,000 documents, 1 MiB per document and 100 MiB of current source bytes; response transport is limited to 2 MiB and 200 candidates. CLI options precede an argv terminator and the literal query.

## Authority and projection

### KB-SEARCH-001 — Explicit isolated assignment

Each searchable Knowledge Base MUST have one stable local registry key and an explicitly assigned, unique `search_boundary`. Indexing MUST reject absent, invalid, shared or contradictory assignments; repository paths, caller aliases, basenames and Agora membership MUST NOT supply authority. `ki registry add --search-boundary <id>` assigns exactly one selected registered KB and preserves its identity and store bindings. The generated named index is `ki-kb-<registry-key>` and contains only that KB.

_Conformance:_ conforming

_Evidence:_ Public CLI fixtures in `src/tests/cli/kb/`, portable contract tests and the [synthetic native receipt](references/kb-search-synthetic.json); complete suite and coverage pass with 1,025 tests and 100% in every metric.

_Verify:_ isolated public CLI fixtures for assignment, duplicate boundaries, project rejection, registration preservation and missing assignment.

### KB-SEARCH-002 — Authorized sources before indexing

The engine MUST read only an owned projection of Markdown inside the KB's configured zones. Authority is `[skills.ki-repo-kb.zones]`, with five canonical zone keys and quoted `"+"`/`"-"` staging keys projected as `inbound`/`outbound`; retired `[knowledgeislands-kb.zones]` is rejected for indexing until explicitly migrated. Dot paths, root repository metadata, symlinks, nested repository checkouts, undeclared folders and binary source stores MUST be excluded before any indexing or embedding. Projection publication MUST reject unmanaged collisions and unsafe ancestry; pruning MUST only remove previously owned derived files and never original sources.

_Conformance:_ conforming

_Evidence:_ Public CLI fixtures in `src/tests/cli/kb/`, portable contract tests and the [synthetic native receipt](references/kb-search-synthetic.json); complete suite and coverage pass with 1,025 tests and 100% in every metric.

_Verify:_ synthetic sibling bases, hidden and undeclared content, symlink escapes, nested repositories and unmanaged-state collision fixtures.

### KB-SEARCH-003 — Stable generated mapping

The machine-local mapping MUST use schema `ki/kb-search/v1` and record `registry_id`, canonical `repository`, physical `root`, explicit `trust_boundary`, independent `index`, pinned `engine`, exact collection identity, zone map, owned qmd configuration/database paths, current generation identity, per-document complete content digests, and an optional strictly loopback daemon endpoint. MCP clients MUST bind their aliases explicitly to the registry identity and match the physical root; aliases MUST NOT be mapped by name inference.

_Conformance:_ conforming

_Evidence:_ Public CLI fixtures in `src/tests/cli/kb/`, portable contract tests and the [synthetic native receipt](references/kb-search-synthetic.json); complete suite and coverage pass with 1,025 tests and 100% in every metric.

_Verify:_ deterministic mapping output, identity mismatch, physical-root mismatch and endpoint validation fixtures.

## Mapping wire shape

`mapping.json` is generated inside the selected KB's owned search-state directory. Unknown fields or contradictory identity/path assignments are rejected. Publication rechecks ownership and destination identity, using exclusive create or snapshot-checked atomic replacement. It does not reserve a refresh-wide lock: two valid concurrent generations may finish in either order, with the last completed valid publication becoming current. Source checks are bounded validations before and after retrieval, not an atomic filesystem snapshot or immunity to concurrent replacement. Each generation has a fresh database and a private exclusive projection; retained prior generations never become an implicit input.

| Field | Type | Contract |
| --- | --- | --- |
| `schema` | string | Exactly `ki/kb-search/v1`. |
| `registry_id` | string | Stable safe registry key; never an inferred alias. |
| `repository`, `root` | strings | Canonical repository identity and exact physical notes root. |
| `trust_boundary` | string | Unique explicit registry assignment. |
| `index` | string | Exactly `ki-kb-<registry_id>`. |
| `generation` | string | Safe exclusive owned generation identifier. |
| `engine` | object | `name: qmd`, `version: 2.8.3`, and the pinned full `revision`. |
| `collections` | string array | Exactly one entry equal to `index`. |
| `purpose` | object | Exact declared `title` and `description`. |
| `zones` | object | Seven canonical zone keys mapped to their configured relative folders. |
| `declaration_sha256` | string | Complete SHA-256 of the authoritative raw `.ki.toml`. |
| `projection` | string | Owned generation's absolute `projection` directory. |
| `config` | string | Owned generation's absolute `config/<index>.yml`. |
| `database` | string | Owned generation's absolute `index.sqlite`. |
| `model_cache` | string | KI cache directory for public model assets. |
| `daemon_url` | string or null | Explicit operator-assigned numeric loopback HTTP origin. |
| `source_store_declared` | boolean | Explicit `store_roles` includes `sources`. |
| `source_store_binding_declared` | boolean | An explicit registry sources binding is declared. |
| `documents` | object | Engine path to original-path/full-digest record. |

Every `documents` key is `documents/<sha256(original-relative-path)>.md`; its value has exactly `path` (original repository-relative path) and `sha256` (complete raw source-content SHA-256). This keeps engine URI names unambiguous while preserving the original path for citations. The canonical zone keys are `Calendar`, `Pillars`, `Resources`, `Streams`, `Admin`, `inbound` and `outbound`.

Search returns schema `ki/kb-search-result/v1` with registry identity, explicit boundary, index, generation, mode, profile, candidate limit, `exhaustive: false`, truncation and explicit source-store declaration/binding booleans. Each result carries `path`, locally generated `title` and `snippet`, finite `score`, corroborated local `docid`, positive `line_start`/`line_end`, canonical `mirror_content`, and safely projected `source_path`/`source_sha256`. Invalid absolute, backslash, control-bearing or otherwise unsafe declaration strings become null while `mirror_content: unknown` is retained. Valid provenance remains exact and does not attest source existence, fidelity or freshness. The full source digest establishes indexed-content identity; a six-character docid never establishes access or authenticates backend text.

## Search and external engine

### KB-SEARCH-004 — Bounded faithful adapter

`ki kb search <query>` MUST support `query`, `search` and `vsearch`, strictly bounded query/result inputs and JSON results. qmd v2.8.3 is pinned to commit `facd35e01359e59d938bc9418e93fb9318addee3`. Missing qmd, mismatched version, missing or invalid index mapping and engine failure MUST yield non-zero, clear unavailable errors; silent grep fallback MUST NOT occur. All external execution MUST use argv arrays with explicit configuration and database paths, timeout and output limits. Engine stdout, stderr/error text and HTTP response bodies MUST be size bounded before parsing. Each refreshed generation MUST have a fresh independent database containing only its current authorized projection; deleted or now-protected content MUST NOT carry into expansion or reranking. Mode metadata MUST distinguish CLI native expansion/reranking from REST explicit lexical/vector/reranking profiles; ranking identity MUST NOT be claimed.

_Conformance:_ conforming

_Evidence:_ Public CLI fixtures in `src/tests/cli/kb/`, portable contract tests and the [synthetic native receipt](references/kb-search-synthetic.json); complete suite and coverage pass with 1,025 tests and 100% in every metric.

_Verify:_ injected CLI engine responses, unavailable/version/failure/timeout/output bounds, and actual pinned qmd against synthetic corpora.

### KB-SEARCH-005 — Source-authenticated output

The adapter MUST validate each candidate's exact collection and relative path against the selected mapping and current symlink-aware source boundary before exposing any content. It MUST derive titles, snippets, document identities and mirror labels from authorized, bounded local Markdown; untrusted engine text MUST NOT establish provenance. Document content changes MUST invalidate stale results. Invalid, malformed, cross-base, protected, undeclared or escaped candidates MUST fail closed without exposing their content. Returned scores MUST be finite. Results MUST state bounded retrieval honestly and MUST NOT imply exhaustive corpus coverage.

_Conformance:_ conforming

_Evidence:_ Public CLI fixtures in `src/tests/cli/kb/`, portable contract tests and the [synthetic native receipt](references/kb-search-synthetic.json); complete suite and coverage pass with 1,025 tests and 100% in every metric.

_Verify:_ hostile responses that pair allowed paths with foreign titles/snippets/docids/labels, stale sources, malformed URI encodings and cross-collection candidates.

### KB-SEARCH-006 — Pinned loopback daemon contract

A daemon process serves one independent named index. The pinned HTTP endpoint is `POST /query` with `searches: [{type: "lex" | "vec" | "hyde", query: string}]`, plural `collections`, and bounded `limit`, `candidateLimit`, and `rerank`; its response is `{results: [...]}`. `GET /health` reports availability only, never index identity. `ki kb status` MUST distinguish the configured mapping/index from transport availability and report `index_attested: false`. The explicit operator endpoint assignment is trusted; this protocol cannot distinguish a misassigned daemon that returns no hits from a correctly assigned daemon with no matching notes, so an empty response MUST NOT imply index availability or exhaustive corpus coverage. Generated endpoint bindings MUST remain loopback-only and explicitly operator provisioned. Search MUST NOT create, refresh or install indexes or daemons at a read gate.

_Conformance:_ conforming

_Evidence:_ Public CLI fixtures in `src/tests/cli/kb/`, portable contract tests and the [synthetic native receipt](references/kb-search-synthetic.json); complete suite and coverage pass with 1,025 tests and 100% in every metric.

_Verify:_ pinned source and synthetic daemon evidence, unknown-index/missing daemon fixtures and strict loopback URL rejection.
