// tests/tasks.spec.js
// WHY: This is your primary test file. It tests the entire
// Task API lifecycle from creation to deletion.

const { test, expect } = require('@playwright/test');
const {
  BASE_URL,
  apiGet, apiPost, apiPut, apiDelete,
  createTaskPayload,
  validateTaskSchema
} = require('./test-helpers');

// ════════════════════════════════════════════════════════════
// SUITE 1: Health & Infrastructure Tests
// WHY: Always test infrastructure endpoints first.
// If health fails, something is fundamentally broken.
// ════════════════════════════════════════════════════════════
test.describe('🏥 Health & Infrastructure', () => {

  test('GET /health → returns 200 with correct shape', async ({ request }) => {
    const response = await apiGet(request, '/health');

    expect(response.status()).toBe(200);

    const body = await response.json();

    expect(body).toMatchObject({
      status: 'healthy',
      uptime: expect.any(Number),
      version: expect.any(String),
      environment: expect.any(String)
    });

    expect(body.timestamp).toBeTruthy();
    // Verify timestamp is a valid ISO date
    expect(new Date(body.timestamp).getTime()).not.toBeNaN();
  });

  test('GET / → returns API documentation', async ({ request }) => {
    const response = await apiGet(request, '/');

    expect(response.status()).toBe(200);
    const body = await response.json();

    expect(body.message).toContain('TaskFlow');
    expect(body.endpoints).toBeDefined();
    expect(body.endpoints.tasks).toBeDefined();
  });

  test('GET /metrics → returns Prometheus metrics format', async ({ request }) => {
    const response = await apiGet(request, '/metrics');

    expect(response.status()).toBe(200);

    const contentType = response.headers()['content-type'];
    expect(contentType).toContain('text/plain');

    const body = await response.text();

    // Verify Prometheus metric format
    expect(body).toContain('# HELP');
    expect(body).toContain('# TYPE');
    expect(body).toContain('http_requests_total');
    expect(body).toContain('http_request_duration_seconds');
    expect(body).toContain('process_cpu_user_seconds_total');
  });

  test('GET /nonexistent → returns 404', async ({ request }) => {
    const response = await apiGet(request, '/nonexistent-route');

    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body.success).toBe(false);
  });

});

// ════════════════════════════════════════════════════════════
// SUITE 2: CREATE Task Tests (POST /api/tasks)
// ════════════════════════════════════════════════════════════
test.describe('✅ POST /api/tasks — Create Task', () => {

  test('creates task with all fields → returns 201 with correct data', async ({ request }) => {
    const payload = createTaskPayload({
      title: 'Implement Docker multi-stage build',
      description: 'Optimize image size using multi-stage builds',
      status: 'in-progress',
      priority: 'high'
    });

    const response = await apiPost(request, '/api/tasks', payload);

    expect(response.status()).toBe(201);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();

    // Validate response matches what we sent
    expect(body.data.title).toBe(payload.title);
    expect(body.data.description).toBe(payload.description);
    expect(body.data.status).toBe(payload.status);
    expect(body.data.priority).toBe(payload.priority);

    // Validate schema
    const schemaErrors = validateTaskSchema(body.data);
    expect(schemaErrors).toHaveLength(0);

    // ID must be auto-generated
    expect(body.data.id).toBeGreaterThan(0);

    // Timestamps must be set
    expect(body.data.created_at).toBeTruthy();
    expect(body.data.updated_at).toBeTruthy();
  });

  test('creates task with only title → uses correct defaults', async ({ request }) => {
    const response = await apiPost(request, '/api/tasks', { title: 'Minimal task' });

    expect(response.status()).toBe(201);

    const body = await response.json();
    expect(body.data.status).toBe('pending');     // Default status
    expect(body.data.priority).toBe('medium');    // Default priority
    expect(body.data.description).toBe('');       // Default description
  });

  test('creates task with title having leading/trailing spaces → trims title', async ({ request }) => {
    const response = await apiPost(request, '/api/tasks', {
      title: '   Setup Kubernetes   '
    });

    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.data.title).toBe('Setup Kubernetes'); // Trimmed
  });

  test('creates task with status=pending → succeeds', async ({ request }) => {
    const response = await apiPost(request, '/api/tasks',
      createTaskPayload({ title: 'Pending task', status: 'pending' })
    );
    expect(response.status()).toBe(201);
  });

  test('creates task with status=in-progress → succeeds', async ({ request }) => {
    const response = await apiPost(request, '/api/tasks',
      createTaskPayload({ title: 'In-progress task', status: 'in-progress' })
    );
    expect(response.status()).toBe(201);
  });

  test('creates task with status=completed → succeeds', async ({ request }) => {
    const response = await apiPost(request, '/api/tasks',
      createTaskPayload({ title: 'Completed task', status: 'completed' })
    );
    expect(response.status()).toBe(201);
  });

  // ── Validation Tests ──────────────────────────────────────
  test('missing title → returns 400 with error message', async ({ request }) => {
    const response = await apiPost(request, '/api/tasks', {
      description: 'No title provided',
      priority: 'high'
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain('Title');
  });

  test('empty title string → returns 400', async ({ request }) => {
    const response = await apiPost(request, '/api/tasks', { title: '' });
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
  });

  test('whitespace-only title → returns 400', async ({ request }) => {
    const response = await apiPost(request, '/api/tasks', { title: '   ' });
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
  });

  test('invalid status value → returns 400', async ({ request }) => {
    const response = await apiPost(request, '/api/tasks', {
      title: 'Test task',
      status: 'invalid-status'
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain('status');
  });

  test('invalid priority value → returns 400', async ({ request }) => {
    const response = await apiPost(request, '/api/tasks', {
      title: 'Test task',
      priority: 'ultra-critical'
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain('priority');
  });

  test('empty body → returns 400', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/tasks`, {
      headers: { 'Content-Type': 'application/json' },
      data: {}
    });

    expect(response.status()).toBe(400);
  });

});

// ════════════════════════════════════════════════════════════
// SUITE 3: READ Task Tests (GET /api/tasks)
// ════════════════════════════════════════════════════════════
test.describe('📖 GET /api/tasks — Read Tasks', () => {

  // Create test tasks before this suite runs
  let task1, task2, task3;

  test.beforeAll(async ({ request }) => {
    // WHY: beforeAll creates shared test data ONCE for the suite
    // Much faster than creating data before EACH test
    const r1 = await apiPost(request, '/api/tasks', createTaskPayload({
      title: 'Read Test Task 1',
      status: 'pending',
      priority: 'high'
    }));
    task1 = (await r1.json()).data;

    const r2 = await apiPost(request, '/api/tasks', createTaskPayload({
      title: 'Read Test Task 2',
      status: 'in-progress',
      priority: 'medium'
    }));
    task2 = (await r2.json()).data;

    const r3 = await apiPost(request, '/api/tasks', createTaskPayload({
      title: 'Read Test Task 3',
      status: 'completed',
      priority: 'low'
    }));
    task3 = (await r3.json()).data;
  });

  test('GET /api/tasks → returns 200 with array of tasks', async ({ request }) => {
    const response = await apiGet(request, '/api/tasks');

    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.count).toBeGreaterThanOrEqual(3);

    // Validate schema of first item
    if (body.data.length > 0) {
      const schemaErrors = validateTaskSchema(body.data[0]);
      expect(schemaErrors).toHaveLength(0);
    }
  });

  test('GET /api/tasks → response includes count field', async ({ request }) => {
    const response = await apiGet(request, '/api/tasks');
    const body = await response.json();

    expect(body.count).toBe(body.data.length);
  });

  test('GET /api/tasks?status=pending → filters by pending', async ({ request }) => {
    const response = await apiGet(request, '/api/tasks?status=pending');

    expect(response.status()).toBe(200);
    const body = await response.json();

    // Every returned task must have status=pending
    body.data.forEach(task => {
      expect(task.status).toBe('pending');
    });
  });

  test('GET /api/tasks?status=in-progress → filters correctly', async ({ request }) => {
    const response = await apiGet(request, '/api/tasks?status=in-progress');
    const body = await response.json();

    body.data.forEach(task => {
      expect(task.status).toBe('in-progress');
    });
  });

  test('GET /api/tasks?status=completed → filters correctly', async ({ request }) => {
    const response = await apiGet(request, '/api/tasks?status=completed');
    const body = await response.json();

    body.data.forEach(task => {
      expect(task.status).toBe('completed');
    });
  });

  test('GET /api/tasks?priority=high → filters by priority', async ({ request }) => {
    const response = await apiGet(request, '/api/tasks?priority=high');
    const body = await response.json();

    body.data.forEach(task => {
      expect(task.priority).toBe('high');
    });
  });

  test('GET /api/tasks/:id → returns single task', async ({ request }) => {
    const response = await apiGet(request, `/api/tasks/${task1.id}`);

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(task1.id);
    expect(body.data.title).toBe(task1.title);
  });

  test('GET /api/tasks/999999 → returns 404 for nonexistent task', async ({ request }) => {
    const response = await apiGet(request, '/api/tasks/999999');

    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain('not found');
  });

  test('GET /api/tasks/stats → returns aggregated statistics', async ({ request }) => {
    const response = await apiGet(request, '/api/tasks/stats');

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);

    // Stats must have all count fields
    expect(body.data.total).toBeGreaterThanOrEqual(3);
    expect(typeof body.data.pending).toBe('number');
    expect(typeof body.data.in_progress).toBe('number');
    expect(typeof body.data.completed).toBe('number');

    // Total must equal sum of all statuses
    const sumOfStatuses = body.data.pending + body.data.in_progress + body.data.completed;
    expect(body.data.total).toBe(sumOfStatuses);
  });

});

// ════════════════════════════════════════════════════════════
// SUITE 4: UPDATE Task Tests (PUT /api/tasks/:id)
// ════════════════════════════════════════════════════════════
test.describe('✏️ PUT /api/tasks/:id — Update Task', () => {

  let testTask;

  test.beforeEach(async ({ request }) => {
    // WHY: beforeEach creates a FRESH task before each update test
    // This ensures tests don't affect each other (test isolation)
    const response = await apiPost(request, '/api/tasks', createTaskPayload({
      title: 'Task to update'
    }));
    testTask = (await response.json()).data;
  });

  test('updates all fields → returns updated task', async ({ request }) => {
    const updates = {
      title: 'Updated: Configure Kubernetes',
      description: 'Updated description',
      status: 'in-progress',
      priority: 'high'
    };

    const response = await apiPut(request, `/api/tasks/${testTask.id}`, updates);

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.title).toBe(updates.title);
    expect(body.data.description).toBe(updates.description);
    expect(body.data.status).toBe(updates.status);
    expect(body.data.priority).toBe(updates.priority);
  });

  test('updates only status → other fields remain unchanged', async ({ request }) => {
    const response = await apiPut(request, `/api/tasks/${testTask.id}`, {
      status: 'completed'
    });

    expect(response.status()).toBe(200);
    const body = await response.json();

    // Status changed
    expect(body.data.status).toBe('completed');
    // Other fields unchanged
    expect(body.data.title).toBe(testTask.title);
    expect(body.data.description).toBe(testTask.description);
    expect(body.data.priority).toBe(testTask.priority);
  });

  test('updates only title → other fields remain unchanged', async ({ request }) => {
    const response = await apiPut(request, `/api/tasks/${testTask.id}`, {
      title: 'New title only'
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data.title).toBe('New title only');
    expect(body.data.status).toBe(testTask.status);
  });

  test('update triggers updated_at change', async ({ request }) => {
    // Wait 1 second to ensure timestamp difference
    await new Promise(r => setTimeout(r, 1100));

    const response = await apiPut(request, `/api/tasks/${testTask.id}`, {
      status: 'completed'
    });

    const body = await response.json();
    const originalDate = new Date(testTask.updated_at).getTime();
    const updatedDate = new Date(body.data.updated_at).getTime();

    expect(updatedDate).toBeGreaterThan(originalDate);
  });

  test('updates nonexistent task → returns 404', async ({ request }) => {
    const response = await apiPut(request, '/api/tasks/999999', {
      status: 'completed'
    });

    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body.success).toBe(false);
  });

});

// ════════════════════════════════════════════════════════════
// SUITE 5: DELETE Task Tests (DELETE /api/tasks/:id)
// ════════════════════════════════════════════════════════════
test.describe('🗑️ DELETE /api/tasks/:id — Delete Task', () => {

  test('deletes existing task → returns success message', async ({ request }) => {
    // Create a task specifically for deletion
    const createResponse = await apiPost(request, '/api/tasks', createTaskPayload({
      title: 'Task to be deleted'
    }));
    const taskToDelete = (await createResponse.json()).data;

    // Delete it
    const deleteResponse = await apiDelete(request, `/api/tasks/${taskToDelete.id}`);

    expect(deleteResponse.status()).toBe(200);
    const body = await deleteResponse.json();
    expect(body.success).toBe(true);
    expect(body.message).toContain('deleted');
  });

  test('deleted task no longer retrievable → returns 404', async ({ request }) => {
    // Create and delete
    const createResponse = await apiPost(request, '/api/tasks', createTaskPayload({
      title: 'Delete me completely'
    }));
    const taskId = (await createResponse.json()).data.id;

    await apiDelete(request, `/api/tasks/${taskId}`);

    // Try to fetch deleted task
    const getResponse = await apiGet(request, `/api/tasks/${taskId}`);
    expect(getResponse.status()).toBe(404);
  });

  test('delete nonexistent task → returns 404', async ({ request }) => {
    const response = await apiDelete(request, '/api/tasks/999999');
    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body.success).toBe(false);
  });

  test('double delete → second delete returns 404', async ({ request }) => {
    const createResponse = await apiPost(request, '/api/tasks', createTaskPayload({
      title: 'Double delete test'
    }));
    const taskId = (await createResponse.json()).data.id;

    // First delete - should succeed
    const first = await apiDelete(request, `/api/tasks/${taskId}`);
    expect(first.status()).toBe(200);

    // Second delete - should 404
    const second = await apiDelete(request, `/api/tasks/${taskId}`);
    expect(second.status()).toBe(404);
  });

});

// ════════════════════════════════════════════════════════════
// SUITE 6: Full Lifecycle / End-to-End Workflow Tests
// WHY: Tests that simulate real user workflows catch
// integration bugs that unit tests miss
// ════════════════════════════════════════════════════════════
test.describe('🔄 Full Task Lifecycle — E2E Workflow', () => {

  test('complete task workflow: create → read → update → complete → delete', async ({ request }) => {
    // ── Step 1: Create ────────────────────────────────────────
    const createRes = await apiPost(request, '/api/tasks', {
      title: 'E2E: Setup monitoring stack',
      description: 'Install Prometheus and Grafana on EC2',
      status: 'pending',
      priority: 'high'
    });

    expect(createRes.status()).toBe(201);
    const created = (await createRes.json()).data;
    console.log(`  📝 Created task ID: ${created.id}`);

    // ── Step 2: Verify in list ────────────────────────────────
    const listRes = await apiGet(request, '/api/tasks');
    const list = await listRes.json();
    const foundInList = list.data.find(t => t.id === created.id);
    expect(foundInList).toBeDefined();

    // ── Step 3: Get by ID ─────────────────────────────────────
    const getRes = await apiGet(request, `/api/tasks/${created.id}`);
    expect(getRes.status()).toBe(200);
    const fetched = (await getRes.json()).data;
    expect(fetched.title).toBe(created.title);

    // ── Step 4: Start working (update to in-progress) ─────────
    const startRes = await apiPut(request, `/api/tasks/${created.id}`, {
      status: 'in-progress'
    });
    expect(startRes.status()).toBe(200);
    expect((await startRes.json()).data.status).toBe('in-progress');
    console.log(`  🔄 Task moved to in-progress`);

    // ── Step 5: Complete the task ─────────────────────────────
    const completeRes = await apiPut(request, `/api/tasks/${created.id}`, {
      status: 'completed',
      description: 'Prometheus and Grafana successfully deployed'
    });
    expect(completeRes.status()).toBe(200);
    const completed = (await completeRes.json()).data;
    expect(completed.status).toBe('completed');
    console.log(`  ✅ Task completed`);

    // ── Step 6: Verify stats updated ──────────────────────────
    const statsRes = await apiGet(request, '/api/tasks/stats');
    const stats = (await statsRes.json()).data;
    expect(stats.completed).toBeGreaterThan(0);
    console.log(`  📊 Stats: ${JSON.stringify(stats)}`);

    // ── Step 7: Delete completed task ─────────────────────────
    const deleteRes = await apiDelete(request, `/api/tasks/${created.id}`);
    expect(deleteRes.status()).toBe(200);
    console.log(`  🗑️ Task deleted`);

    // ── Step 8: Confirm deletion ──────────────────────────────
    const confirmRes = await apiGet(request, `/api/tasks/${created.id}`);
    expect(confirmRes.status()).toBe(404);
    console.log(`  🔒 Deletion confirmed — task returns 404`);
  });

  test('concurrent task creation → all tasks created correctly', async ({ request }) => {
    // WHY: Tests that the server handles multiple simultaneous requests
    // This simulates real-world load and catches race conditions

    const tasks = Array.from({ length: 5 }, (_, i) => createTaskPayload({
      title: `Concurrent task ${i + 1}`,
      priority: ['low', 'medium', 'high'][i % 3]
    }));

    // Fire all requests simultaneously
    const responses = await Promise.all(
      tasks.map(payload => apiPost(request, '/api/tasks', payload))
    );

    // All must succeed
    responses.forEach((res, i) => {
      expect(res.status()).toBe(201);
    });

    // All IDs must be unique
    const bodies = await Promise.all(responses.map(r => r.json()));
    const ids = bodies.map(b => b.data.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(5);
    console.log(`  ✅ 5 concurrent tasks created with unique IDs: ${ids.join(', ')}`);
  });

});

// ════════════════════════════════════════════════════════════
// SUITE 7: Security & Edge Case Tests
// WHY: Security testing is often skipped but critical.
// These tests verify the API handles malicious input safely.
// ════════════════════════════════════════════════════════════
test.describe('🔒 Security & Edge Cases', () => {

  test('SQL injection attempt in title → handled safely', async ({ request }) => {
    // WHY: Prepared statements in our DB layer should prevent this
    const response = await apiPost(request, '/api/tasks', {
      title: "'; DROP TABLE tasks; --",
      description: 'SQL injection test'
    });

    // Should either succeed (safe insert) or return validation error
    // Must NOT crash the server (500)
    expect(response.status()).not.toBe(500);

    if (response.status() === 201) {
      // Verify the table still exists by listing tasks
      const listRes = await apiGet(request, '/api/tasks');
      expect(listRes.status()).toBe(200);
      console.log('  ✅ SQL injection handled safely — table intact');
    }
  });

  test('XSS attempt in title → stored as plain text', async ({ request }) => {
    const xssPayload = '<script>alert("xss")</script>';
    const response = await apiPost(request, '/api/tasks', {
      title: xssPayload
    });

    if (response.status() === 201) {
      const body = await response.json();
      // Title should be stored as-is (sanitization is the frontend's job for REST APIs)
      // The important thing is the server doesn't crash
      expect(body.data.title).toBeDefined();
    }

    expect(response.status()).not.toBe(500);
  });

  test('very long title (1000 chars) → handled gracefully', async ({ request }) => {
    const longTitle = 'A'.repeat(1000);
    const response = await apiPost(request, '/api/tasks', { title: longTitle });

    // Should not crash the server
    expect(response.status()).not.toBe(500);
  });

  test('numeric ID as string → handled correctly', async ({ request }) => {
    const response = await apiGet(request, '/api/tasks/abc');
    // Should return 404 (not found) not 500 (crash)
    expect([404, 400]).toContain(response.status());
  });

  test('response has correct Content-Type header', async ({ request }) => {
    const response = await apiGet(request, '/api/tasks');
    const contentType = response.headers()['content-type'];
    expect(contentType).toContain('application/json');
  });

  test('security headers present (helmet)', async ({ request }) => {
    const response = await apiGet(request, '/health');
    const headers = response.headers();

    // Helmet sets these headers
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['x-frame-options']).toBeDefined();
  });

});