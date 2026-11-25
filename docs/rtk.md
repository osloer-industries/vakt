# RTK integration

Optional integration with [RTK](https://github.com/rtk-ai/rtk) (Rust Token Killer) for compressing command output and audit exports.

## Library API

- `isRtkAvailable()` — probe for the `rtk` CLI
- `rtkWrap({ command, args, ... })` — run a subprocess via `rtk wrap --` when available; otherwise run the command directly
- `compressWithRtk(text)` — compress text for LLM analysis (falls back to line deduplication)

## CLI

`vakt audit export --compress-rtk` pipes JSON export through `compressWithRtk` when RTK is installed.

RTK is optional: vakt never requires it at install time.
