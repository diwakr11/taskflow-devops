// src/database.js
// WHY: Separating DB logic from routes follows the Single Responsibility Principle
// This makes it easy to swap SQLite for PostgreSQL later (e.g., in production)

const Database = require('better-sqlite3');
const path = require('path');

// Use environment variable for DB path — critical for containerization
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../data/taskflow.db');

// Ensure data directory exists
const fs = require('fs');
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(DB_PATH);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');

// Create tables if they don't exist
// WHY: Idempotent setup — safe to run multiple times (important for container restarts)
db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'in-progress', 'completed')),
    priority TEXT DEFAULT 'medium' CHECK(priority IN ('low', 'medium', 'high')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TRIGGER IF NOT EXISTS update_task_timestamp
  AFTER UPDATE ON tasks
  BEGIN
    UPDATE tasks SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
  END;
`);

// Prepared statements for security (prevents SQL injection)
const statements = {
  getAllTasks: db.prepare('SELECT * FROM tasks ORDER BY created_at DESC'),
  getTaskById: db.prepare('SELECT * FROM tasks WHERE id = ?'),
  createTask: db.prepare(`
    INSERT INTO tasks (title, description, status, priority) 
    VALUES (@title, @description, @status, @priority)
  `),
  updateTask: db.prepare(`
    UPDATE tasks 
    SET title = @title, description = @description, 
        status = @status, priority = @priority 
    WHERE id = @id
  `),
  deleteTask: db.prepare('DELETE FROM tasks WHERE id = ?'),
  getStats: db.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN status = 'in-progress' THEN 1 ELSE 0 END) as in_progress,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed
    FROM tasks
  `)
};

module.exports = { db, statements };