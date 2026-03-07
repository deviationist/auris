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
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});
