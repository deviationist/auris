# Auris

Remote audio console for monitoring, recording, and two-way communication. Streams live audio via Icecast2, records to disk (server and client), and provides push-to-talk intercom. Controlled through a Next.js web UI.

## Architecture

```
Browser (React/Next.js)
  ↕ API routes
Next.js (port 3000) ──proxy /stream/*──→ Icecast2 (port 8000, localhost)
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

Recording start ensures `auris-stream` is running first (since `auris-record` reads from Icecast). Recording stop shuts down `auris-stream` only if the user isn't also listening. Config flags `CAPTURE_STREAM` and `CAPTURE_RECORD` in `/etc/default/auris` track user intent (listening/recording) so the stream service knows when it's safe to stop.

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
| `src/app/dashboard.tsx` | Main dashboard UI (composes card components) |
| `src/app/login/page.tsx` | Login page (redirects to `/` when auth disabled) |
| `src/auth.ts` | Auth.js v5 config (Credentials provider, JWT sessions) |
| `src/proxy.ts` | Route protection (skips auth when disabled) |
| `src/components/login-form.tsx` | Login form (client component) |
| `src/components/level-meter.tsx` | WebAudio RMS/dB level meter (supports audioElement or direct analyserNode) |
| `src/components/live-waveform.tsx` | Real-time waveform visualization |
| `src/components/waveform-player.tsx` | Canvas waveform player with seek, play/pause, level meter |
| `src/components/card-mixer.tsx` | ALSA mixer card component (capture, playback, boost, input source) |
| `src/components/card-recordings-table.tsx` | Recordings table card (filters, table shell, pagination) |
| `src/components/recording-row.tsx` | Single recording table row (inline edit, actions, expanded player) |
| `src/components/recording-expanded.tsx` | Expanded recording view (waveform player, transcription panel) |
| `src/components/transcription-panel.tsx` | Transcription display with prose and timeline views |
| `src/components/transcription-dialog.tsx` | Transcription dialog (language settings, translate toggle, queue with active job + pending, 1s poll) |
| `src/components/language-picker.tsx` | Shared language selection components (searchable combobox, inline search list, name resolver) |
| `src/contexts/dashboard-context.tsx` | Dashboard context provider (composes domain hooks) |
| `src/hooks/use-data-fetching.ts` | Central data fetching (status, recordings, devices, mixers polling) |
| `src/hooks/use-audio-context.ts` | AudioContext/HTMLAudioElement refs and auto-resume |
| `src/hooks/use-listening.ts` | Live audio listening, reconnection, test tone |
| `src/hooks/use-recording.ts` | Server-side recording state and toggle |
| `src/hooks/use-talkback.ts` | Push-to-talk talkback (WebSocket, AudioWorklet) |
| `src/hooks/use-client-recording.ts` | Browser-side recording (MediaRecorder, upload) |
| `src/hooks/use-vox.ts` | VOX config and toggle |
| `src/hooks/use-compressor.ts` | Compressor config state and debounced save |
| `src/hooks/use-devices.ts` | Device selection, mixer updates, bitrate/chunk settings |
| `src/hooks/use-recordings-list.ts` | Recordings list UI (filters, pagination, playback, delete, rename) |
| `src/hooks/use-transcription.ts` | Transcription state, polling, trigger, cancel |
| `src/hooks/use-keyboard-shortcuts.ts` | Global keyboard shortcut handler |
| `src/hooks/use-local-storage.ts` | Generic localStorage hook (SSR-safe, deferred read) |
| `src/lib/systemctl.ts` | Start/stop/restart systemd units via sudo |
| `src/lib/alsa.ts` | ALSA device enumeration & mixer control (capture + playback volume) |
| `src/lib/device-config.ts` | Persist selected ALSA devices to `/etc/default/auris` (record, listen, playback) |
| `src/lib/auth-config.ts` | Read auth credentials from `/etc/default/auris` |
| `src/lib/server-playback.ts` | Server-side playback: ffmpeg MP3 → ALSA output (globalThis singleton) |
| `src/lib/talkback.ts` | Browser-to-server talkback: receives PCM audio, plays via ALSA (globalThis singleton) |
| `src/app/api/talkback/stop/route.ts` | POST — force-stop talkback (kills server-side ffmpeg) |
| `server.ts` | Custom HTTP/WebSocket server (talkback WS upgrade with auth, Next.js handler) |
| `src/lib/talkback-effects.ts` | Voice effects definitions and ffmpeg filter chain builder |
| `src/lib/waveform.ts` | Shared waveform generation (ffmpeg PCM → peaks JSON) |
| `src/lib/db/schema.ts` | Drizzle ORM schema (recordings table) |
| `src/lib/db/index.ts` | DB singleton, auto-migration, disk→DB sync |
| `drizzle.config.ts` | Drizzle Kit config for migrations |
| `stream.sh` | ffmpeg ALSA → Icecast streaming script (optional compressor via acompressor filter) |
| `record.sh` | ffmpeg Icecast → file recording script (-c copy) |
| `src/lib/transcription.ts` | Whisper.cpp integration: MP3→WAV→transcription with serial queue |
| `src/lib/whisper-languages.ts` | Static list of whisper-supported languages (code + display name) |
| `src/lib/stream-idle.ts` | Auto-stop idle audio stream when no Icecast listeners |
| `scripts/generate-waveforms.mjs` | CLI: generate/clear waveform data in DB |
| `scripts/generate-transcriptions.mjs` | CLI: generate/clear transcriptions via whisper.cpp |
| `scripts/set-auth.mjs` | CLI: set/disable auth credentials |
| `src/app/api/audio/compressor/route.ts` | GET/POST — compressor config (restarts stream on change) |
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
npm run transcriptions:generate    # Transcribe recordings missing transcriptions
npm run transcriptions:regenerate  # Re-transcribe all recordings
npm run transcriptions:clear       # Remove all transcriptions from DB
```

Requires Icecast2 running on localhost:8000 for streaming features.

## Patterns

- API routes use `@/lib/systemctl` for service control (all via `sudo`); uses `execFile` (no shell) with an allowlist of valid unit names
- ALSA operations go through `@/lib/alsa.ts` (parses `arecord -l`, `amixer` output); uses `execFile` (no shell) with input validation
- UI components from `src/components/ui/` (shadcn/ui — do not edit directly)
- Audio encoding: MP3 128kbps, 44.1kHz, mono everywhere
- Icecast mount: `/mic` (source password from `ICECAST_SOURCE_PASSWORD` in `/etc/default/auris`)
- Config file: `/etc/default/auris` — `ALSA_DEVICE`, `LISTEN_DEVICE`, `PLAYBACK_DEVICE`, `CAPTURE_STREAM`, `CAPTURE_RECORD`, `RECORDINGS_DIR`, `ICECAST_SOURCE_PASSWORD`, `AUTH_USERNAME`, `AUTH_PASSWORD_HASH`, `COMPRESSOR_ENABLED`, `COMPRESSOR_THRESHOLD`, `COMPRESSOR_RATIO`, `COMPRESSOR_MAKEUP`, `COMPRESSOR_ATTACK`, `COMPRESSOR_RELEASE`, `WHISPER_THREADS`, `WHISPER_VAD`, `WHISPER_VAD_MODEL`, `WHISPER_LANGUAGE`, `WHISPER_TRANSLATE`
- Server playback and talkback both use `globalThis` singletons to survive HMR in dev mode and share state with API routes
- Server playback and talkback are mutually exclusive (talkback takes priority)
- Voice effects (pitch shift, echo, chorus, flanger, vibrato, tempo, autotune) apply to both talkback and client recordings via ffmpeg filters (`buildFilterChain` in `talkback-effects.ts`)
- Client recordings upload with effects metadata stored as JSON in the `metadata` column; effects are applied server-side during webm→MP3 transcode
- Recordings support optional display names (`name` column) with inline editing in the UI
- Dashboard state is split into composable domain hooks (`src/hooks/use-*.ts`), composed in `DashboardProvider` (`src/contexts/dashboard-context.tsx`). Cross-hook dependencies use parameter injection (hooks receive needed state/functions as params). Two refs (`setServerPlayingFileRef`, `serverPlaybackPendingRef`) are wired via useEffect for cross-hook communication.
- Transcription panel supports two views: prose (continuous text with word highlighting during playback) and timeline (segments listed vertically with timestamps). View toggle persists in the panel.
- Use refs (e.g. `talkbackEffectsRef`) for values accessed in stale closures (keyboard handlers, MediaRecorder callbacks)
- Keyboard shortcuts use `e.repeat` guard to prevent rapid toggling when keys are held down; K (talkback) uses `talkbackAbortRef` to handle quick tap cancellation
- Pitch shift and tempo both use `rubberband` filter (real-time capable); combined into one filter when both active
- `LevelMeter` component supports two modes: `audioElement`+`audioContext` (monitor/playback) or direct `analyserNode` (talkback/client recording)
- Auth is optional: omit `AUTH_USERNAME`/`AUTH_PASSWORD_HASH` to disable. `src/proxy.ts` checks `isAuthEnabled()` and skips auth when unconfigured.
- WebSocket talkback in `server.ts` validates the `authjs.session-token` JWT cookie when auth is enabled
- `.env.local` — `AUTH_SECRET` (required when auth enabled), `AUTH_TRUST_HOST=true`, `NEXTAUTH_URL` (required behind reverse proxy, e.g. `https://your-hostname.example.com`)
- Sudoers at `system/auris-sudoers` — uses `%%USER%%` placeholder, substituted by `setup.sh`
- Icecast passwords use `%%PLACEHOLDER%%` tokens in `system/icecast.xml`, substituted by `setup.sh` with random values
- DB path: `DATABASE_PATH` env var or `./data/auris.db` (must be local filesystem, not CIFS/NFS)
- Recordings dir: `RECORDINGS_DIR` env var or `/recordings`
- Transcription uses whisper.cpp (local, offline). Config: `WHISPER_BIN` (default: `whisper-cpp`), `WHISPER_MODEL` (default: `/opt/whisper.cpp/models/ggml-small.bin`), `WHISPER_LANGUAGE` (default: `auto`). Global language setting configurable via Transcription dialog; per-recording language override available via "Transcribe as..." submenu and re-transcribe dropdown.
- Transcriptions run in a serial queue (`globalThis` singleton) to avoid CPU overload — one at a time
- Transcription is fire-and-forget after recordings complete (server + client), with on-demand trigger via API/UI
- Transcription supports `--translate` flag (translate to English) via `WHISPER_TRANSLATE` config toggle in the Transcription dialog
- Language selection uses shared `LanguageCombobox` (searchable, with cmdk) and `LanguageSearchList` (inline searchable list) from `language-picker.tsx`
- Transcription panel copy button is view-aware: prose view copies plain text, timeline view copies with timestamps and line breaks
- Audio compressor (dynamic range compression) is applied in `stream.sh` via ffmpeg `acompressor` filter. Config persisted in `/etc/default/auris`. Toggling or changing settings restarts `auris-stream`. Since recordings use `-c copy` from Icecast, compression propagates to all recordings automatically.
- Compressor UI lives in the Monitor card settings popover (`card-monitor.tsx`). Config is lazy-loaded on popover open, changes debounce 500ms before API call (stream restart causes brief audio dropout).
- Stream idle detection in `src/lib/stream-idle.ts` — auto-stops `auris-stream` when `CAPTURE_STREAM=1`, `CAPTURE_RECORD=0`, and 0 Icecast listeners for 60s
- `AUTH_ACTIVE` env var controls auth: `false` disables, `true` or unset uses credentials config, comma-separated env names (e.g. `production,staging`) enables auth only in matching `NODE_ENV`

## Development workflow

A Playwright MCP browser is available. After making UI changes, use it to:
- Open http://localhost:3000 (or the relevant route)
- Verify the changes look and behave as expected
- Check for console errors
- Iterate if something looks off

Always verify visual/interactive changes in the browser before considering a task done.

After you are done testing:
- Clean up any screenshot files generated by Playwright (e.g. `.playwright-mcp/*.png`)
- If you started listening/streaming during testing, stop it before ending the session (POST `/api/stream/stop`). Leaving the stream running wastes CPU (~18% for ffmpeg encoding).
