// src/routes/tasks.js
// WHY: Separating routes from app.js keeps code modular and testable

const express = require('express');
const router = express.Router();
const { statements } = require('../database');
const { activeTasksGauge } = require('../middleware/metrics');

// Helper: Update Prometheus gauge after any task change
const updateTaskMetrics = () => {
  const stats = statements.getStats.get();
  activeTasksGauge.set({ status: 'pending' }, stats.pending || 0);
  activeTasksGauge.set({ status: 'in-progress' }, stats.in_progress || 0);
  activeTasksGauge.set({ status: 'completed' }, stats.completed || 0);
};

// ─────────────────────────────────────────────
// GET /api/tasks — Fetch all tasks
// ─────────────────────────────────────────────
router.get('/', (req, res) => {
  try {
    const { status, priority } = req.query;
    let tasks = statements.getAllTasks.all();

    // Optional filtering
    if (status) tasks = tasks.filter(t => t.status === status);
    if (priority) tasks = tasks.filter(t => t.priority === priority);

    res.json({
      success: true,
      count: tasks.length,
      data: tasks
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─────────────────────────────────────────────
// GET /api/tasks/stats — Get task statistics
// ─────────────────────────────────────────────
router.get('/stats', (req, res) => {
  try {
    const stats = statements.getStats.get();
    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─────────────────────────────────────────────
// GET /api/tasks/:id — Fetch single task
// ─────────────────────────────────────────────
router.get('/:id', (req, res) => {
  try {
    const task = statements.getTaskById.get(req.params.id);
    if (!task) {
      return res.status(404).json({ success: false, error: 'Task not found' });
    }
    res.json({ success: true, data: task });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─────────────────────────────────────────────
// POST /api/tasks — Create a new task
// ─────────────────────────────────────────────
router.post('/', (req, res) => {
  try {
    const { title, description = '', status = 'pending', priority = 'medium' } = req.body;

    // Validation
    if (!title || title.trim() === '') {
      return res.status(400).json({ success: false, error: 'Title is required' });
    }

    const validStatuses = ['pending', 'in-progress', 'completed'];
    const validPriorities = ['low', 'medium', 'high'];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ 
        success: false, 
        error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` 
      });
    }

    if (!validPriorities.includes(priority)) {
      return res.status(400).json({ 
        success: false, 
        error: `Invalid priority. Must be one of: ${validPriorities.join(', ')}` 
      });
    }

    const result = statements.createTask.run({ 
      title: title.trim(), description, status, priority 
    });
    
    const newTask = statements.getTaskById.get(result.lastInsertRowid);
    updateTaskMetrics();

    res.status(201).json({ success: true, data: newTask });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─────────────────────────────────────────────
// PUT /api/tasks/:id — Update a task
// ─────────────────────────────────────────────
router.put('/:id', (req, res) => {
  try {
    const existing = statements.getTaskById.get(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Task not found' });
    }

    // Merge existing values with updates (PATCH-like behavior)
    const { 
      title = existing.title, 
      description = existing.description, 
      status = existing.status, 
      priority = existing.priority 
    } = req.body;

    statements.updateTask.run({ 
      id: req.params.id, title, description, status, priority 
    });

    const updatedTask = statements.getTaskById.get(req.params.id);
    updateTaskMetrics();

    res.json({ success: true, data: updatedTask });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─────────────────────────────────────────────
// DELETE /api/tasks/:id — Delete a task
// ─────────────────────────────────────────────
router.delete('/:id', (req, res) => {
  try {
    const existing = statements.getTaskById.get(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Task not found' });
    }

    statements.deleteTask.run(req.params.id);
    updateTaskMetrics();

    res.json({ success: true, message: 'Task deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;