import * as SQLite from "expo-sqlite";
import { Note, TextLabel, WallNode, WallSegment } from "../canvas/types";

export type CanvasMeta = {
  id: number;
  name: string;
  created_at: string;
  updated_at: string;
};

export type CanvasRecord = CanvasMeta & {
  data: string;
};

const db = SQLite.openDatabaseSync("canvases.db");

export function initDB() {
  db.execSync(`
        CREATE TABLE IF NOT EXISTS canvases (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            data TEXT NOT NULL, -- JSON: {nodes, segments}
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
    `);
}

export function saveCanvas(
  name: string,
  nodes: WallNode[],
  segments: WallSegment[],
  notes: Note[],
  textLabels: TextLabel[],
): number {
  const data = JSON.stringify({ nodes, segments, notes, textLabels });
  const result = db.runSync(`INSERT INTO canvases (name, data) VALUES (?, ?)`, [
    name,
    data,
  ]);
  return result.lastInsertRowId;
}

export function updateCanvas(
  id: number,
  nodes: WallNode[],
  segments: WallSegment[],
  notes: Note[],
  textLabels: TextLabel[],
) {
  const data = JSON.stringify({ nodes, segments, notes, textLabels });
  db.runSync(
    `UPDATE canvases SET data = ?, updated_at = datetime('now') WHERE id = ?`,
    [data, id],
  );
}

export function listCanvases(): CanvasMeta[] {
  return db.getAllSync<CanvasMeta>(
    "SELECT id, name, created_at, updated_at FROM canvases ORDER BY updated_at DESC",
  );
}

export function loadCanvas(
  id: number,
): {
  name: string;
  nodes: WallNode[];
  segments: WallSegment[];
  notes: Note[];
  textLabels: TextLabel[];
} | null {
  const row = db.getFirstSync<{ name: string; data: string }>(
    "SELECT name, data FROM canvases WHERE id = ?",
    [id],
  );

  if (!row) return null;
  const parsed = JSON.parse(row.data);

  return {
    name: row.name,
    nodes: parsed.nodes || [],
    segments: parsed.segments || [],
    notes: parsed.notes || [],
    textLabels: parsed.textLabels || [],
  };
}

export function deleteCanvas(id: number) {
  db.runSync("DELETE FROM canvases WHERE id = ?", [id]);
}

export function renameCanvas(id: number, name: string) {
  db.runSync(
    `UPDATE canvases SET name = ?, updated_at = datetime('now') WHERE id = ?`,
    [name, id],
  );
}
