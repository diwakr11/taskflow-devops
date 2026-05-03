// tests/test-helpers.js
// WHY: DRY (Don't Repeat Yourself) — shared utilities used across
// multiple test files. If the API changes, you fix it in ONE place.

const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';

// ── Request Helpers ──────────────────────────────────────────
// WHY: Wrapping fetch in helpers makes tests more readable
// and lets you add auth headers in one place later

async function apiGet(request, path) {
  return await request.get(`${BASE_URL}${path}`);
}

async function apiPost(request, path, data) {
  return await request.post(`${BASE_URL}${path}`, { data });
}

async function apiPut(request, path, data) {
  return await request.put(`${BASE_URL}${path}`, { data });
}

async function apiDelete(request, path) {
  return await request.delete(`${BASE_URL}${path}`);
}

// ── Data Factories ───────────────────────────────────────────
// WHY: Test data factories create consistent, realistic test data
// Much better than copy-pasting data in every test

function createTaskPayload(overrides = {}) {
  return {
    title: 'Test Task',
    description: 'Created by automated test',
    status: 'pending',
    priority: 'medium',
    ...overrides
  };
}

// ── Assertion Helpers ────────────────────────────────────────
function expectSuccessResponse(response, expectedStatus = 200) {
  if (response.status() !== expectedStatus) {
    throw new Error(
      `Expected status ${expectedStatus}, got ${response.status()}\n` +
      `URL: ${response.url()}`
    );
  }
}

// ── Task Schema Validator ────────────────────────────────────
// WHY: Validates that API response matches expected shape.
// This catches breaking API changes immediately.
function validateTaskSchema(task) {
  const requiredFields = ['id', 'title', 'description', 'status', 'priority', 'created_at', 'updated_at'];
  const validStatuses = ['pending', 'in-progress', 'completed'];
  const validPriorities = ['low', 'medium', 'high'];

  const errors = [];

  requiredFields.forEach(field => {
    if (task[field] === undefined) {
      errors.push(`Missing required field: ${field}`);
    }
  });

  if (task.id && typeof task.id !== 'number') {
    errors.push(`id must be a number, got ${typeof task.id}`);
  }

  if (task.status && !validStatuses.includes(task.status)) {
    errors.push(`Invalid status: ${task.status}`);
  }

  if (task.priority && !validPriorities.includes(task.priority)) {
    errors.push(`Invalid priority: ${task.priority}`);
  }

  return errors;
}

module.exports = {
  BASE_URL,
  apiGet, apiPost, apiPut, apiDelete,
  createTaskPayload,
  expectSuccessResponse,
  validateTaskSchema
};