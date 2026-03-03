# Auris

Web-based audio monitoring and recording app. Streams live audio via Icecast2 and records to disk. Next.js UI for control and monitoring.

## Architecture

```
Browser (React/Next.js)
  ↕ API routes
Next.js (port 3075) ──rewrite /stream/*──→ Icecast2 (port 8000, localhost)
  ↕ sudo systemctl                            ↑
systemd: auris-stream                    ffmpeg (ALSA → MP3)
  → stream.sh (ALSA → Icecast)              ↑
                                          Audio Input (USB/ALSA)
systemd: auris-record
  → record.sh (Icecast → file, -c copy)
```

Two independent systemd services:
- **`auris-stream`**: ALSA → MP3 → Icecast. Runs when user is listening OR recording.
- **`auris-record`**: Reads Icecast `http://localhost:8000/mic` with `-c copy` (no re-encoding). Only runs when recording.

Toggling recording starts/stops only `auris-record` — the Icecast stream is never interrupted. Config flags `CAPTURE_STREAM` and `CAPTURE_RECORD` in `/etc/default/auris` track user intent (listening/recording) so the stream service knows when it's safe to stop.

## Tech Stack

- **Frontend:** React 19, TypeScript, Tailwind CSS 4, shadcn/ui (Radix), sonner (toasts), next-themes (dark/light mode)
- **Backend:** Next.js 16 App Router API routes
- **Database:** SQLite (better-sqlite3) with Drizzle ORM — stores recording metadata
- **Audio:** ffmpeg (ALSA capture, libmp3lame encoding), Icecast2 (streaming)
- **System:** systemd services, ALSA mixer (amixer), PM2 (production), Nginx (reverse proxy)
- **Browser audio:** HTML5 Audio element + WebAudio API (AnalyserNode for level metering)

## Key Files

| Path | Purpose |
|------|---------|
| `src/app/page.tsx` | Main dashboard UI (all state, controls, recordings) |
| `src/components/level-meter.tsx` | WebAudio RMS/dB level meter |
| `src/components/waveform-player.tsx` | Canvas waveform player with seek, play/pause, level meter |
| `src/lib/systemctl.ts` | Start/stop/restart systemd units via sudo |
| `src/lib/alsa.ts` | ALSA device enumeration & mixer control |
| `src/lib/device-config.ts` | Persist selected ALSA device to `/etc/default/auris` |
| `src/lib/waveform.ts` | Shared waveform generation (ffmpeg PCM → peaks JSON) |
| `src/lib/db/schema.ts` | Drizzle ORM schema (recordings table) |
| `src/lib/db/index.ts` | DB singleton, auto-migration, disk→DB sync |
| `drizzle.config.ts` | Drizzle Kit config for migrations |
| `stream.sh` | ffmpeg ALSA → Icecast streaming script |
| `record.sh` | ffmpeg Icecast → file recording script (-c copy) |
| `scripts/generate-waveforms.mjs` | CLI: generate/clear waveform data in DB |
| `src/app/api/` | All API routes (status, stream, record, audio, recordings) |
| `system/` | systemd units (auris-stream, auris-record), icecast.xml, nginx config, sudoers |
| `next.config.ts` | Rewrites `/stream/*` → Icecast localhost:8000 |
| `setup.sh` | Automated setup script (installs system packages, configs, builds) |
| `ecosystem.config.js` | PM2 process manager config |

## Development

```bash
npm run dev                # Start dev server (port 3000)
npm run build              # Production build
npm run start              # Production server
npm run stop               # Kill process on port 3000
npm run db:generate        # Generate DB migrations after schema changes
npm run db:push            # Push schema directly to DB (dev only)
npm run waveforms:generate    # Generate missing waveforms
npm run waveforms:regenerate  # Regenerate all waveforms
npm run waveforms:clear       # Remove all waveforms from DB
```

Requires Icecast2 running on localhost:8000 for streaming features.

## Patterns

- API routes use `@/lib/systemctl` for service control (all via `sudo`)
- ALSA operations go through `@/lib/alsa.ts` (parses `arecord -l`, `amixer` output)
- UI components from `src/components/ui/` (shadcn/ui — do not edit directly)
- Audio encoding: MP3 128kbps, 44.1kHz, mono everywhere
- Icecast mount: `/mic` (source password: `sourcepass`)
- Config file: `/etc/default/auris` — `ALSA_DEVICE`, `CAPTURE_STREAM`, `CAPTURE_RECORD`, `RECORDINGS_DIR`
- Sudoers at `system/auris-sudoers` — update when adding new privileged commands
- DB path: `DATABASE_PATH` env var or `./data/auris.db` (must be local filesystem, not CIFS/NFS)
- Recordings dir: `RECORDINGS_DIR` env var or `/recordings`

## Development workflow

A Playwright MCP browser is available. After making UI changes, use it to:
- Open http://localhost:3000 (or the relevant route)
- Verify the changes look and behave as expected
- Check for console errors
- Iterate if something looks off

Always verify visual/interactive changes in the browser before considering a task done.
