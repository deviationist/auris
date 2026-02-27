# Auris

Web-based audio monitoring and recording app. Streams live audio via Icecast2 and records to disk. Next.js UI for control and monitoring.

## Architecture

```
Browser (React/Next.js)
  ↕ API routes
Next.js (port 3000) ──rewrite /stream/*──→ Icecast2 (port 8000, localhost)
  ↕ sudo systemctl                            ↑
systemd: auris-capture                    ffmpeg (ALSA → MP3)
  → capture.sh (reads /etc/default/auris)    ↑
  → outputs to Icecast and/or file         USB Microphone
```

A single `auris-capture` service runs one ffmpeg process. State flags in `/etc/default/auris` (`CAPTURE_STREAM`, `CAPTURE_RECORD`) control whether ffmpeg outputs to Icecast, a recording file, or both. Toggling stream/record restarts the service with updated outputs (~1s dropout).

## Tech Stack

- **Frontend:** React 19, TypeScript, Tailwind CSS 4, shadcn/ui (Radix), next-themes (dark/light mode)
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
| `src/lib/systemctl.ts` | Start/stop/restart systemd units via sudo |
| `src/lib/alsa.ts` | ALSA device enumeration & mixer control |
| `src/lib/device-config.ts` | Persist selected ALSA device to `/etc/default/auris` |
| `src/lib/db/schema.ts` | Drizzle ORM schema (recordings table) |
| `src/lib/db/index.ts` | DB singleton, auto-migration, disk→DB sync |
| `drizzle.config.ts` | Drizzle Kit config for migrations |
| `capture.sh` | ffmpeg capture script (reads `/etc/default/auris`) |
| `src/app/api/` | All API routes (status, stream, record, audio, recordings) |
| `system/` | systemd unit, icecast.xml, nginx config, sudoers |
| `next.config.ts` | Rewrites `/stream/*` → Icecast localhost:8000 |

## Development

```bash
npm run dev      # Start dev server (port 3000)
npm run build    # Production build
npm run start    # Production server
npm run db:generate  # Generate DB migrations after schema changes
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
