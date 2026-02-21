import Database from 'better-sqlite3';
import { DB_PATH, ensureDirs } from '../config.js';
import { log } from '../logger.js';
let db = null;
export function getDb() {
    if (!db) {
        ensureDirs();
        db = new Database(DB_PATH);
        db.pragma('journal_mode = WAL');
        db.pragma('foreign_keys = ON');
        initSchema(db);
    }
    return db;
}
function initSchema(db) {
    db.exec(`
    CREATE TABLE IF NOT EXISTS files (
      file_path TEXT PRIMARY KEY,
      file_type TEXT NOT NULL,
      last_modified REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      error_message TEXT
    );

    CREATE TABLE IF NOT EXISTS chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_path TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      content TEXT NOT NULL,
      metadata_json TEXT,
      content_hash TEXT NOT NULL,
      embedding_blob BLOB,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (file_path) REFERENCES files(file_path) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_chunks_file ON chunks(file_path);
    CREATE INDEX IF NOT EXISTS idx_chunks_hash ON chunks(content_hash);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);
    log.verbose('Database schema initialized');
}
export function closeDb() {
    if (db) {
        db.close();
        db = null;
    }
}
// File operations
export function upsertFile(filePath, fileType, lastModified, status, errorMessage) {
    const d = getDb();
    d.prepare(`
    INSERT INTO files (file_path, file_type, last_modified, status, error_message)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(file_path) DO UPDATE SET
      file_type = excluded.file_type,
      last_modified = excluded.last_modified,
      status = excluded.status,
      error_message = excluded.error_message
  `).run(filePath, fileType, lastModified, status, errorMessage ?? null);
}
export function getFile(filePath) {
    return getDb().prepare('SELECT * FROM files WHERE file_path = ?').get(filePath);
}
export function getAllFiles() {
    return getDb().prepare('SELECT * FROM files ORDER BY file_path').all();
}
export function removeFile(filePath) {
    const d = getDb();
    d.prepare('DELETE FROM chunks WHERE file_path = ?').run(filePath);
    d.prepare('DELETE FROM files WHERE file_path = ?').run(filePath);
}
// Chunk operations
export function deleteChunksForFile(filePath) {
    getDb().prepare('DELETE FROM chunks WHERE file_path = ?').run(filePath);
}
export function insertChunk(filePath, chunkIndex, content, metadataJson, contentHash, embeddingBlob) {
    getDb().prepare(`
    INSERT INTO chunks (file_path, chunk_index, content, metadata_json, content_hash, embedding_blob)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(filePath, chunkIndex, content, metadataJson, contentHash, embeddingBlob);
}
export function getAllChunksWithEmbeddings() {
    return getDb().prepare('SELECT id, file_path, chunk_index, content, metadata_json, embedding_blob FROM chunks WHERE embedding_blob IS NOT NULL').all();
}
export function getFileCount() {
    const row = getDb().prepare('SELECT COUNT(*) as count FROM files').get();
    return row.count;
}
export function getChunkCount() {
    const row = getDb().prepare('SELECT COUNT(*) as count FROM chunks').get();
    return row.count;
}
// Settings
export function getSetting(key) {
    const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return row?.value;
}
export function setSetting(key, value) {
    getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
}
//# sourceMappingURL=database.js.map