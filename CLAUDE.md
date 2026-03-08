# Auris

Remote audio console for monitoring, recording, and two-way communication. Streams live audio via Icecast2, records to disk (server and client), and provides push-to-talk intercom. Controlled through a Next.js web UI.

## Architecture

```
Browser (React/Next.js)
  ↕ API routes
Next.js (port 3075) ──proxy /stream/*──→ Icecast2 (port 8000, localhost)
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
- **Auth:** Auth.js v5 (next-auth) with Credentials provider, JWT sessions, bcryptjs — optional, disabled when no credentials configured
- **Database:** SQLite (better-sqlite3) with Drizzle ORM — stores recording metadata
- **Audio:** ffmpeg (ALSA capture, libmp3lame encoding), Icecast2 (streaming)
- **System:** systemd services, ALSA mixer (amixer), PM2 (production), Nginx (reverse proxy)
- **Browser audio:** HTML5 Audio element + WebAudio API (AnalyserNode for level metering)
- **URL state:** nuqs (query string persistence for filters)

## Key Files

| Path | Purpose |
|------|---------|
| `src/app/page.tsx` | Server component wrapper (resolves auth state) |
| `src/app/dashboard.tsx` | Main dashboard UI (all state, controls, recordings) |
| `src/app/login/page.tsx` | Login page (redirects to `/` when auth disabled) |
| `src/auth.ts` | Auth.js v5 config (Credentials provider, JWT sessions) |
| `src/proxy.ts` | Route protection (skips auth when disabled) |
| `src/components/login-form.tsx` | Login form (client component) |
| `src/components/level-meter.tsx` | WebAudio RMS/dB level meter (supports audioElement or direct analyserNode) |
| `src/components/live-waveform.tsx` | Real-time waveform visualization |
| `src/components/waveform-player.tsx` | Canvas waveform player with seek, play/pause, level meter |
| `src/components/card-mixer.tsx` | ALSA mixer card component (capture, playback, boost, input source) |
| `src/hooks/use-local-storage.ts` | Generic localStorage hook (SSR-safe, deferred read) |
| `src/lib/systemctl.ts` | Start/stop/restart systemd units via sudo |
| `src/lib/alsa.ts` | ALSA device enumeration & mixer control (capture + playback volume) |
| `src/lib/device-config.ts` | Persist selected ALSA devices to `/etc/default/auris` (record, listen, playback) |
| `src/lib/auth-config.ts` | Read auth credentials from `/etc/default/auris` |
| `src/lib/server-playback.ts` | Server-side playback: ffmpeg MP3 → ALSA output (globalThis singleton) |
| `src/lib/talkback.ts` | Browser-to-server talkback: receives PCM audio, plays via ALSA (globalThis singleton) |
| `src/app/api/talkback/stop/route.ts` | POST — force-stop talkback (kills server-side ffmpeg) |
| `server.ts` | Custom HTTP/WebSocket server (talkback WS upgrade, Next.js handler) |
| `src/lib/talkback-effects.ts` | Voice effects definitions and ffmpeg filter chain builder |
| `src/lib/waveform.ts` | Shared waveform generation (ffmpeg PCM → peaks JSON) |
| `src/lib/db/schema.ts` | Drizzle ORM schema (recordings table) |
| `src/lib/db/index.ts` | DB singleton, auto-migration, disk→DB sync |
| `drizzle.config.ts` | Drizzle Kit config for migrations |
| `stream.sh` | ffmpeg ALSA → Icecast streaming script |
| `record.sh` | ffmpeg Icecast → file recording script (-c copy) |
| `scripts/generate-waveforms.mjs` | CLI: generate/clear waveform data in DB |
| `scripts/set-auth.mjs` | CLI: set/disable auth credentials |
| `src/app/api/` | All API routes (status, stream, record, audio, recordings, auth) |
| `src/app/stream/[...path]/route.ts` | Proxies `/stream/*` to Icecast localhost:8000 |
| `system/` | systemd units (auris-stream, auris-record), icecast.xml, nginx config, sudoers |
| `next.config.ts` | Next.js config (serverExternalPackages) |
| `setup.sh` | Automated setup script (installs system packages, configs, auth, builds) |
| `ecosystem.config.js` | PM2 process manager config |

## Development

```bash
npm run dev                # Start dev server (port 3000)
npm run build              # Production build
npm run start              # Production server
npm run stop               # Kill process on port 3000
npm run auth:set           # Set or disable auth credentials
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
- Config file: `/etc/default/auris` — `ALSA_DEVICE`, `LISTEN_DEVICE`, `PLAYBACK_DEVICE`, `CAPTURE_STREAM`, `CAPTURE_RECORD`, `RECORDINGS_DIR`, `AUTH_USERNAME`, `AUTH_PASSWORD_HASH`
- Server playback and talkback both use `globalThis` singletons to survive HMR in dev mode and share state with API routes
- Server playback and talkback are mutually exclusive (talkback takes priority)
- Voice effects (pitch shift, echo, chorus, flanger, vibrato, tempo, autotune) apply to both talkback and client recordings via ffmpeg filters (`buildFilterChain` in `talkback-effects.ts`)
- Client recordings upload with effects metadata stored as JSON in the `metadata` column; effects are applied server-side during webm→MP3 transcode
- Recordings support optional display names (`name` column) with inline editing in the UI
- Use refs (e.g. `talkbackEffectsRef`) for values accessed in stale closures (keyboard handlers, MediaRecorder callbacks)
- Keyboard shortcuts use `e.repeat` guard to prevent rapid toggling when keys are held down; K (talkback) uses `talkbackAbortRef` to handle quick tap cancellation
- Pitch shift and tempo both use `rubberband` filter (real-time capable); combined into one filter when both active
- `LevelMeter` component supports two modes: `audioElement`+`audioContext` (monitor/playback) or direct `analyserNode` (talkback/client recording)
- Auth is optional: omit `AUTH_USERNAME`/`AUTH_PASSWORD_HASH` to disable. `src/proxy.ts` checks `isAuthEnabled()` and skips auth when unconfigured.
- `.env.local` — `AUTH_SECRET` (required when auth enabled), `AUTH_TRUST_HOST=true`
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

After you are done testing, clean up any screenshot files generated by Playwright (e.g. `.playwright-mcp/*.png`).
