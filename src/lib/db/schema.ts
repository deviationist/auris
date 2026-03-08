import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

export const recordings = sqliteTable("recordings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  filename: text("filename").notNull().unique(),
  name: text("name"),
  size: integer("size"),
  duration: real("duration"),
  device: text("device"),
  metadata: text("metadata"),
  waveform: text("waveform"),
  waveformHash: text("waveform_hash"),
  transcription: text("transcription"),
  transcriptionLang: text("transcription_lang"),
  transcriptionStatus: text("transcription_status"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});
