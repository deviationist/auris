export interface TalkbackEffects {
  pitchShift: { enabled: boolean; semitones: number };
  echo: { enabled: boolean; delay: number; decay: number };
  chorus: { enabled: boolean; depth: number; speed: number };
  flanger: { enabled: boolean; delay: number; depth: number; speed: number };
  vibrato: { enabled: boolean; frequency: number; depth: number };
  tempo: { enabled: boolean; factor: number };
  autotune: { enabled: boolean; key: string; strength: number };
}

export const DEFAULT_EFFECTS: TalkbackEffects = {
  pitchShift: { enabled: false, semitones: 0 },
  echo: { enabled: false, delay: 200, decay: 0.4 },
  chorus: { enabled: false, depth: 0.5, speed: 2.0 },
  flanger: { enabled: false, delay: 5, depth: 2, speed: 0.5 },
  vibrato: { enabled: false, frequency: 5, depth: 0.5 },
  tempo: { enabled: false, factor: 1.0 },
  autotune: { enabled: false, key: "chromatic", strength: 1.0 },
};

// Musical scale definitions: which of the 12 chromatic notes are ON (1) or OFF (-1)
// Order: A, Bb, B, C, Db, D, Eb, E, F, Gb, G, Ab
// autotalent uses -1 for off, 1 for on (integer range -1.1 to 1.1)
const SCALE_NOTES: Record<string, number[]> = {
  chromatic: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  C:  [ 1, -1,  1,  1, -1,  1, -1,  1,  1, -1,  1, -1], // C major
  Db: [-1,  1, -1,  1,  1, -1,  1, -1,  1,  1, -1,  1], // Db major
  D:  [ 1, -1,  1, -1,  1,  1, -1,  1, -1,  1,  1, -1], // D major
  Eb: [-1,  1, -1,  1, -1,  1,  1, -1,  1, -1,  1,  1], // Eb major
  E:  [ 1, -1,  1, -1,  1, -1,  1,  1, -1,  1, -1,  1], // E major
  F:  [ 1,  1, -1,  1, -1,  1, -1,  1,  1, -1,  1, -1], // F major
  Gb: [-1,  1,  1, -1,  1, -1,  1, -1,  1,  1, -1,  1], // Gb major
  G:  [ 1, -1,  1,  1, -1,  1, -1,  1, -1,  1,  1, -1], // G major
  Ab: [-1,  1, -1,  1,  1, -1,  1, -1,  1, -1,  1,  1], // Ab major
  A:  [ 1, -1,  1, -1,  1,  1, -1,  1, -1,  1, -1,  1], // A major
  Bb: [-1,  1, -1,  1, -1,  1,  1, -1,  1, -1,  1, -1], // Bb major
  B:  [ 1, -1,  1, -1,  1, -1,  1,  1, -1,  1, -1,  1], // B major
  Cm: [ 1, -1, -1,  1, -1,  1,  1, -1,  1, -1,  1, -1], // C minor
  Dm: [ 1, -1,  1, -1, -1,  1, -1,  1,  1, -1,  1, -1], // D minor
  Em: [ 1, -1,  1, -1,  1, -1, -1,  1, -1,  1,  1, -1], // E minor
  Am: [ 1, -1, -1,  1, -1,  1, -1,  1,  1, -1, -1,  1], // A minor
};

export const AUTOTUNE_KEYS = Object.keys(SCALE_NOTES);

export function buildFilterChain(effects: TalkbackEffects): string[] {
  const filters: string[] = [];

  if (effects.pitchShift.enabled && effects.pitchShift.semitones !== 0) {
    const pitch = Math.pow(2, effects.pitchShift.semitones / 12);
    filters.push(`rubberband=pitch=${pitch.toFixed(4)}`);
  }

  if (effects.echo.enabled) {
    const d = Math.round(effects.echo.delay);
    const dec = effects.echo.decay.toFixed(2);
    filters.push(`aecho=0.8:0.88:${d}:${dec}`);
  }

  if (effects.chorus.enabled) {
    const d = effects.chorus.depth.toFixed(2);
    const s = effects.chorus.speed.toFixed(1);
    filters.push(`chorus=0.5:0.9:50|60:${d}|${d}:0.25|0.4:${s}|${s}`);
  }

  if (effects.flanger.enabled) {
    filters.push(
      `flanger=delay=${effects.flanger.delay}:depth=${effects.flanger.depth}:speed=${effects.flanger.speed.toFixed(1)}`
    );
  }

  if (effects.vibrato.enabled) {
    filters.push(
      `vibrato=f=${effects.vibrato.frequency.toFixed(1)}:d=${effects.vibrato.depth.toFixed(2)}`
    );
  }

  if (effects.tempo.enabled && effects.tempo.factor !== 1.0) {
    filters.push(`atempo=${effects.tempo.factor.toFixed(2)}`);
  }

  if (effects.autotune.enabled) {
    const notes = SCALE_NOTES[effects.autotune.key] ?? SCALE_NOTES.chromatic;
    // autotalent LADSPA controls (positional, from `analyseplugin autotalent`):
    //  0: Concert A (Hz)           1: Fixed pitch (semitones)   2: Pull to fixed pitch
    //  3-14: A, Bb, B, C, Db, D, Eb, E, F, Gb, G, Ab  (note on=1, off=-1)
    // 15: Correction strength     16: Correction smoothness    17: Pitch shift (scale notes)
    // 18: Output scale rotate     19: LFO depth                20: LFO rate (Hz)
    // 21: LFO shape               22: LFO symmetry             23: LFO quantization
    // 24: Formant correction      25: Formant warp             26: Mix
    const strength = effects.autotune.strength.toFixed(2);
    const controls = [
      440,       //  0: concert A
      0,         //  1: fixed pitch
      0,         //  2: pull to fixed pitch
      ...notes,  //  3-14: 12 note on/off values
      strength,  // 15: correction strength
      0,         // 16: correction smoothness (0 = hardest snap)
      0,         // 17: pitch shift
      0,         // 18: output scale rotate
      0,         // 19: LFO depth
      5,         // 20: LFO rate
      0,         // 21: LFO shape
      0,         // 22: LFO symmetry
      0,         // 23: LFO quantization
      1,         // 24: formant correction (1 = preserve formants for T-Pain effect)
      0,         // 25: formant warp
      1,         // 26: mix (1 = fully wet)
    ].join("|");
    filters.push(`ladspa=file=autotalent:plugin=autotalent:controls=${controls}`);
  }

  if (filters.length === 0) return [];
  return ["-af", filters.join(",")];
}
