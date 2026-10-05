# Search one Knowledge Base

The `ki kb` commands use a rebuildable derived search cache for one explicitly registered Knowledge Base. qmd is the local implementation engine; original notes remain the knowledge authority. Each KB has an independent named index and an explicitly assigned trust boundary. A caller alias, checkout path or Agora membership does not assign that boundary.

## Register and assign

Install the pinned qmd v2.8.3 engine separately using the Harness's recorded pilot and adoption guidance. `ki` does not install the engine or global launch services. Bounded native execution uses POSIX process groups on the supported macOS/Linux delivery platforms; Windows native execution fails closed. If the executable is outside PATH, set `KI_QMD_BINARY` to its operator-controlled executable path.

Register exactly one declared KB and explicitly assign a unique boundary:

```sh
ki registry --repo /absolute/kb/root add --search-boundary personal-kb
```

The registry's stable key selects the KB. A boundary identifier must be unique across registered repositories. Existing registration and source-store bindings are preserved; a missing boundary fails indexing. Projects cannot receive a search assignment through this command. Use `ki registry list --format json` to inspect registered identity and declared repository kind.

## Build the derived index

Run from the registered KB root, or select its stable registry key explicitly:

```sh
ki kb index --kb kb-key --daemon-url http://127.0.0.1:8181
```

Declare folder overrides under `[skills.ki-repo-kb.zones]`, using the five canonical zone names and quoted `"+"`/`"-"` staging keys. Move any retired `[knowledgeislands-kb.zones]` assignment explicitly before indexing; search never silently defaults over retired authority.

The command copies eligible Markdown from the KB's configured zones into an isolated owned projection, then runs qmd update and embedding for `ki-kb-kb-key`. Hidden paths, symlinks, nested repositories, undeclared folders and binary source stores never enter the engine. Declared title and description supply purpose context. Output records the generated mapping path, configuration and database paths.

The mapping is machine-local state under the KI state directory. It uses schema `ki/kb-search/v1`, binds registry identity, physical root, explicit boundary and independent index, and records content digests. New derived generations are created without overwriting unmanaged paths; retained generations are caches rather than originals. Refresh after editing notes or repository scope. A stale, invalid or missing mapping fails clearly.

Provision qmd 2.8.3 at the documented source revision and its three recorded GGUF files explicitly before indexing. The runtime checks the reported version and any reported short revision, plus regular nonempty local model files; it does not cryptographically attest the engine or recalculate multi-gigabyte model checksums on every search. Verify provisioned assets against the Harness pilot receipt. The generated config points to already-present local files under `KI_CACHE_HOME/qmd/models`; reads never download models. Lexical search requires no model, vector requires embedding, native CLI hybrid requires all three, and HTTP hybrid requires embedding and reranking. Missing assets fail clearly.

## Provision one loopback daemon

The explicit endpoint is an operator assignment, not an engine-attested index identity. Start one daemon per independent index using the exact generated `config`, `database` and `index` values reported by indexing. `QMD_CONFIG_DIR` is the directory containing the generated index YAML; `INDEX_PATH` is the exact generated SQLite database; the KI cache directory holds shared model assets but no shared cross-KB index.

```sh
env QMD_CONFIG_DIR=/absolute/generated/config \
  INDEX_PATH=/absolute/generated/index.sqlite \
  XDG_CACHE_HOME=/absolute/ki/cache \
  qmd --index ki-kb-kb-key mcp --http --host 127.0.0.1 --port 8181
```

Keep the process under operator control. No `ki` read operation starts or refreshes it. Do not expose qmd's MCP transport directly to an agent or bind it outside loopback. Global launchd scheduling and client binding configuration are separate authorised setup work.

```sh
ki kb status --kb kb-key
```

Status distinguishes the configured index from endpoint reachability and reports `index_attested: false`. qmd's health endpoint has no index identity. A wrong endpoint can return an empty result for the requested collection; this protocol cannot diagnose that as an unavailable index. Verify the startup command and generated paths when investigating unexpected empty results.

## Search and read

```sh
ki kb search 'budget approval' --kb kb-key --mode query --limit 10
ki kb search 'KI-EXAMPLE-123' --kb kb-key --mode search --zone Streams
ki kb search 'meeting follow-up' --kb kb-key --mode vsearch --path-prefix Resources/Meetings
```

`query` uses hybrid retrieval, `search` uses lexical retrieval and `vsearch` uses vectors. The CLI invokes qmd’s native query expansion and reranking. MCP uses the pinned REST interface with explicit lexical and vector searches plus reranking, because that interface does not expose the CLI expansion flow. Response mode metadata identifies the profile; the same `query` name does not promise identical ranking. Output is bounded JSON with repository-relative paths, locally generated titles/snippets, line ranges, corroborated document identities and declared-source mirror labels. Cite the repository path and read the indicated range through the existing scoped read surface. Retrieval is never claimed to exhaust the corpus.

Returned text comes from authorized current local Markdown. Engine-supplied titles, snippets and labels are ignored; candidate paths and document identities must match the selected collection, current source boundary and indexed digest before any result is exposed. An invalid or mismatched candidate fails the complete request. Mirror labels distinguish ordinary notes (`null`), substantive declared extracts, valid provenance pointers and unknown/malformed provenance. Labels are a text-coverage heuristic, not evidence that a binary source exists or that an extract is faithful or current.

Missing qmd, wrong version, missing mapping, stale content and engine failures return non-zero. No CLI search silently falls back to grep. The Harness's query procedure owns an explicit fallback when a search surface is unavailable.

## Bind MCP search

After the tools delivery is verified, the MCP implementation consumes the same generated mapping. Bind each declared MCP alias explicitly to the stable registry key and require its configured physical root to match the registry-derived root. Search configuration never adds a base or broadens its zones. A missing explicit binding yields a clear unavailable result. The MCP's documentation owns its exact environment grammar.
