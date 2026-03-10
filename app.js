/* ═══════════════════════════════════════════
   HAZA COLLAB TASKS — app.js
   Full Task Manager Logic + Excel Export
═══════════════════════════════════════════ */

'use strict';

// ─── State ───────────────────────────────────────────
let tasks   = JSON.parse(localStorage.getItem('haza_tasks'))   || [];
let members = JSON.parse(localStorage.getItem('haza_members')) || [];
let activity = JSON.parse(localStorage.getItem('haza_activity')) || [];

let currentFilter    = 'all';
let currentSort      = 'created_desc';
let currentTaskView  = 'card';
let currentSearch    = '';
let editingTaskId    = null;
let editingMemberId  = null;
let calYear, calMonth;
let directoryHandle = null;
let currentRole     = localStorage.getItem('haza_role') || null;

const PRIORITY_ORDER = { critical: 4, high: 3, medium: 2, low: 1 };
const STATUS_LABEL   = { todo: 'To Do', inprogress: 'In Progress', review: 'In Review', done: 'Done' };
const PRIORITY_EMOJI = { critical: '🔴', high: '🟠', medium: '🟡', low: '🟢' };

// ─── Init ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initParticles();
  initCalendar();
  refreshAll();
  populateAssigneeDropdown();
  updateBadges();
  loadDirectoryHandle();
  checkRole();

  // Set today as default due date
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('taskDue').value = today;

  // Check overdue tasks for notification dot
  checkNotifications();

  // Keyboard shortcuts
  document.addEventListener('keydown', handleKeyDown);

  // Welcome toast if first time
  if (!localStorage.getItem('haza_welcomed')) {
    setTimeout(() => showToast('👋 Welcome to HAZA Collab Tasks!', 'info'), 600);
    localStorage.setItem('haza_welcomed', '1');
  }
});

// ─── Particles ───────────────────────────────────────
function initParticles() {
  const container = document.getElementById('bgParticles');
  for (let i = 0; i < 12; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    const size = Math.random() * 60 + 10;
    p.style.cssText = `
      width:${size}px; height:${size}px;
      left:${Math.random()*100}%;
      animation-duration:${Math.random()*15+10}s;
      animation-delay:${Math.random()*10}s;
    `;
    container.appendChild(p);
  }
}

// ─── Keyboard Shortcuts ───────────────────────────────
function handleKeyDown(e) {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
    e.preventDefault();
    openModal('addTaskModal');
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
    e.preventDefault();
    exportToExcel();
  }
}

// ─── View Switching ────────────────────────────────────
function switchView(viewId, el) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('view-' + viewId).classList.add('active');
  if (el) el.classList.add('active');

  const titles = {
    dashboard: 'Dashboard',
    tasks:     'All Tasks',
    members:   'Team Members',
    calendar:  'Calendar'
  };
  document.getElementById('pageTitle').textContent = titles[viewId] || viewId;

  if (viewId === 'calendar') renderCalendar();
  if (viewId === 'members')  renderMembers();
}

// ─── Sidebar Toggle ────────────────────────────────────
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

// ─── Modal ─────────────────────────────────────────────
function openModal(id) {
  document.getElementById(id).classList.add('open');

  if (id === 'addTaskModal' && !editingTaskId) {
    resetTaskForm();
    document.getElementById('taskModalTitle').textContent = 'New Task';
  }
  if (id === 'addMemberModal' && !editingMemberId) {
    resetMemberForm();
    document.getElementById('memberModalTitle').textContent = 'Add Team Member';
  }
}
function closeModal(id) {
  document.getElementById(id).classList.remove('open');
  editingTaskId   = null;
  editingMemberId = null;
}
function closeModalOutside(event, id) {
  if (event.target === event.currentTarget) closeModal(id);
}

// ─── Task Form ─────────────────────────────────────────
function resetTaskForm() {
  document.getElementById('editTaskId').value   = '';
  document.getElementById('taskTitle').value    = '';
  document.getElementById('taskDesc').value     = '';
  document.getElementById('taskAssignee').value = '';
  document.getElementById('taskPriority').value = 'medium';
  document.getElementById('taskStatus').value   = 'todo';
  document.getElementById('taskTag').value      = '';
  document.getElementById('taskHours').value    = '';
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('taskDue').value = today;
}

function saveTask() {
  const title    = document.getElementById('taskTitle').value.trim();
  const desc     = document.getElementById('taskDesc').value.trim();
  const assignee = document.getElementById('taskAssignee').value;
  const priority = document.getElementById('taskPriority').value;
  const status   = document.getElementById('taskStatus').value;
  const due      = document.getElementById('taskDue').value;
  const tag      = document.getElementById('taskTag').value.trim();
  const hours    = parseFloat(document.getElementById('taskHours').value) || 0;

  if (!title) { showToast('⚠️ Task title is required!', 'warning'); return; }

  const id = editingTaskId;

  if (id) {
    // Edit existing
    const idx = tasks.findIndex(t => t.id === id);
    if (idx !== -1) {
      const old = tasks[idx];
      tasks[idx] = { ...old, title, desc, assignee, priority, status, due, tag, hours, updatedAt: new Date().toISOString() };
      logActivity('✏️', `Updated task: <strong>${title}</strong>`);
      showToast('✅ Task updated!', 'success');
    }
  } else {
    // New task
    const newTask = {
      id:        genId(),
      title, desc, assignee, priority, status, due, tag, hours,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      comments:  []
    };
    tasks.unshift(newTask);
    logActivity('➕', `Created task: <strong>${title}</strong>`);
    showToast('✅ Task created!', 'success');
  }

  saveTasks();
  closeModal('addTaskModal');
  refreshAll();
}

function editTask(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;

  editingTaskId = id;
  document.getElementById('taskModalTitle').textContent = 'Edit Task';
  document.getElementById('editTaskId').value   = id;
  document.getElementById('taskTitle').value    = task.title;
  document.getElementById('taskDesc').value     = task.desc || '';
  document.getElementById('taskPriority').value = task.priority;
  document.getElementById('taskStatus').value   = task.status;
  document.getElementById('taskDue').value      = task.due || '';
  document.getElementById('taskTag').value      = task.tag || '';
  document.getElementById('taskHours').value    = task.hours || '';
  populateAssigneeDropdown();
  setTimeout(() => {
    document.getElementById('taskAssignee').value = task.assignee || '';
  }, 50);

  closeModal('taskDetailModal');
  openModal('addTaskModal');
}

function deleteTask(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;
  if (!confirm(`Delete "${task.title}"?`)) return;

  tasks = tasks.filter(t => t.id !== id);
  logActivity('🗑️', `Deleted task: <strong>${task.title}</strong>`);
  saveTasks();
  refreshAll();
  closeModal('taskDetailModal');
  showToast('🗑️ Task deleted.', 'info');
}

function changeTaskStatus(id, status) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;
  task.status    = status;
  task.updatedAt = new Date().toISOString();
  logActivity('🔄', `Changed <strong>${task.title}</strong> to ${STATUS_LABEL[status]}`);
  saveTasks();
  refreshAll();
  showToast(`🔄 Status → ${STATUS_LABEL[status]}`, 'info');
}

// ─── Member Form ───────────────────────────────────────
function resetMemberForm() {
  document.getElementById('editMemberId').value  = '';
  document.getElementById('memberName').value    = '';
  document.getElementById('memberRole').value    = '';
  document.getElementById('memberEmail').value   = '';
  document.getElementById('memberColor').value   = '#7C3AED';
}

function saveMember() {
  const name  = document.getElementById('memberName').value.trim();
  const role  = document.getElementById('memberRole').value.trim();
  const email = document.getElementById('memberEmail').value.trim();
  const color = document.getElementById('memberColor').value;

  if (!name) { showToast('⚠️ Member name is required!', 'warning'); return; }

  const id = editingMemberId;
  if (id) {
    const idx = members.findIndex(m => m.id === id);
    if (idx !== -1) {
      members[idx] = { ...members[idx], name, role, email, color };
      logActivity('✏️', `Updated member: <strong>${name}</strong>`);
      showToast('✅ Member updated!', 'success');
    }
  } else {
    const newMember = { id: genId(), name, role, email, color, joinedAt: new Date().toISOString() };
    members.push(newMember);
    logActivity('👤', `Added member: <strong>${name}</strong>`);
    showToast('✅ Member added!', 'success');
  }

  saveMembers();
  closeModal('addMemberModal');
  populateAssigneeDropdown();
  renderMembers();
  updateDashboard();
  updateBadges();
}

function editMember(id) {
  const m = members.find(m => m.id === id);
  if (!m) return;
  editingMemberId = id;
  document.getElementById('memberModalTitle').textContent = 'Edit Member';
  document.getElementById('editMemberId').value  = id;
  document.getElementById('memberName').value    = m.name;
  document.getElementById('memberRole').value    = m.role || '';
  document.getElementById('memberEmail').value   = m.email || '';
  document.getElementById('memberColor').value   = m.color || '#7C3AED';
  openModal('addMemberModal');
}

function deleteMember(id) {
  const m = members.find(m => m.id === id);
  if (!m) return;
  if (!confirm(`Remove "${m.name}" from the team?`)) return;
  members = members.filter(x => x.id !== id);
  // unassign tasks
  tasks.forEach(t => { if (t.assignee === id) t.assignee = ''; });
  logActivity('🗑️', `Removed member: <strong>${m.name}</strong>`);
  saveMembers();
  saveTasks();
  renderMembers();
  updateDashboard();
  updateBadges();
  populateAssigneeDropdown();
  showToast('🗑️ Member removed.', 'info');
}

// ─── Render Tasks ──────────────────────────────────────
function renderTasks() {
  const container  = document.getElementById('tasksContainer');
  const emptyState = document.getElementById('emptyState');

  let filtered = [...tasks];

  // Filter by status
  if (currentFilter !== 'all') {
    filtered = filtered.filter(t => t.status === currentFilter);
  }

  // Filter by search
  if (currentSearch) {
    const q = currentSearch.toLowerCase();
    filtered = filtered.filter(t =>
      t.title.toLowerCase().includes(q) ||
      (t.desc  || '').toLowerCase().includes(q) ||
      (t.tag   || '').toLowerCase().includes(q) ||
      getMemberName(t.assignee).toLowerCase().includes(q)
    );
  }

  // Sort
  filtered = sortArray(filtered, currentSort);

  // Clear previous cards (keep emptyState)
  container.querySelectorAll('.task-card').forEach(c => c.remove());

  if (filtered.length === 0) {
    emptyState.style.display = 'flex';
    return;
  }
  emptyState.style.display = 'none';

  filtered.forEach((task, i) => {
    const card = buildTaskCard(task, i);
    container.appendChild(card);
  });
}

function buildTaskCard(task, idx) {
  const member   = members.find(m => m.id === task.assignee);
  const isOverdue = isTaskOverdue(task);
  const isDueSoon = isTaskDueSoon(task);
  const card     = document.createElement('div');

  card.className = `task-card${task.status === 'done' ? ' done-task' : ''}`;
  card.dataset.priority = task.priority;
  card.style.animationDelay = `${idx * 0.05}s`;

  const dueHtml = task.due ? `
    <span class="due-date${isOverdue ? ' overdue' : isDueSoon ? ' due-soon' : ''}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
      ${isOverdue ? '⚠ ' : ''}${formatDate(task.due)}
    </span>` : '';

  const assigneeHtml = member ? `
    <div class="assignee-info">
      <div class="assignee-avatar" style="background:${member.color}">${member.name.charAt(0).toUpperCase()}</div>
      <span class="assignee-name">${member.name.split(' ')[0]}</span>
    </div>` : `<span class="assignee-name" style="color:var(--text-muted)">Unassigned</span>`;

  const tagHtml = task.tag ? `<span class="tag-badge">${escHtml(task.tag)}</span>` : '';

  card.innerHTML = `
    <div class="task-actions">
      <button class="task-action-btn" title="Edit" onclick="event.stopPropagation(); editTask('${task.id}')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
      </button>
      <button class="task-action-btn del" title="Delete" onclick="event.stopPropagation(); deleteTask('${task.id}')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
      </button>
    </div>
    <div class="task-card-top">
      <div class="task-title">${escHtml(task.title)}</div>
    </div>
    ${task.desc ? `<div class="task-desc">${escHtml(task.desc)}</div>` : ''}
    <div class="task-card-meta">
      <span class="status-badge ${task.status}">${STATUS_LABEL[task.status]}</span>
      <span class="priority-badge ${task.priority}">${PRIORITY_EMOJI[task.priority]} ${capitalize(task.priority)}</span>
      ${tagHtml}
    </div>
    <div class="quick-status">
      ${Object.entries(STATUS_LABEL).map(([k, v]) =>
        `<button class="qs-btn${task.status === k ? ' active-status' : ''}" onclick="event.stopPropagation(); changeTaskStatus('${task.id}','${k}')">${v}</button>`
      ).join('')}
    </div>
    <div class="task-card-footer">
      ${assigneeHtml}
      ${dueHtml}
    </div>
    ${task.hours ? `<div style="font-size:11px;color:var(--text-muted);margin-top:8px">⏱ ${task.hours}h estimated</div>` : ''}
  `;

  card.addEventListener('click', () => openTaskDetail(task.id));
  return card;
}

// ─── Task Detail Modal ─────────────────────────────────
function openTaskDetail(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;

  const member = members.find(m => m.id === task.assignee);
  const isOverdue = isTaskOverdue(task);

  document.getElementById('detailTitle').textContent = task.title;
  document.getElementById('detailEditBtn').onclick   = () => editTask(id);
  document.getElementById('detailDeleteBtn').onclick = () => deleteTask(id);

  const commentsHtml = (task.comments || []).map(c => `
    <div class="comment-item">
      <div>${escHtml(c.text)}</div>
      <div class="comment-meta">${formatDateTime(c.at)}</div>
    </div>`).join('') || '<div style="color:var(--text-muted);font-size:13px">No comments yet.</div>';

  document.getElementById('detailBody').innerHTML = `
    <div class="detail-section">
      <div class="detail-label">Description</div>
      <div class="detail-value">${task.desc ? escHtml(task.desc) : '<span style="color:var(--text-muted)">No description.</span>'}</div>
    </div>
    <div class="detail-grid detail-section">
      <div>
        <div class="detail-label">Status</div>
        <div class="detail-value"><span class="status-badge ${task.status}">${STATUS_LABEL[task.status]}</span></div>
      </div>
      <div>
        <div class="detail-label">Priority</div>
        <div class="detail-value"><span class="priority-badge ${task.priority}">${PRIORITY_EMOJI[task.priority]} ${capitalize(task.priority)}</span></div>
      </div>
      <div>
        <div class="detail-label">Assigned To</div>
        <div class="detail-value">${member ? `<span style="display:flex;align-items:center;gap:6px"><span class="assignee-avatar" style="background:${member.color};width:20px;height:20px;font-size:10px">${member.name.charAt(0)}</span>${member.name}</span>` : 'Unassigned'}</div>
      </div>
      <div>
        <div class="detail-label">Due Date</div>
        <div class="detail-value" style="${isOverdue ? 'color:var(--red-light)' : ''}">${task.due ? `${isOverdue ? '⚠ ' : ''}${formatDate(task.due)}` : '—'}</div>
      </div>
      <div>
        <div class="detail-label">Category</div>
        <div class="detail-value">${task.tag ? `<span class="tag-badge">${escHtml(task.tag)}</span>` : '—'}</div>
      </div>
      <div>
        <div class="detail-label">Estimated Hours</div>
        <div class="detail-value">${task.hours ? task.hours + 'h' : '—'}</div>
      </div>
      <div>
        <div class="detail-label">Created</div>
        <div class="detail-value">${formatDateTime(task.createdAt)}</div>
      </div>
      <div>
        <div class="detail-label">Last Updated</div>
        <div class="detail-value">${formatDateTime(task.updatedAt)}</div>
      </div>
    </div>
    <div class="detail-section">
      <div class="detail-label" style="margin-bottom:10px">Change Status</div>
      <div class="quick-status">
        ${Object.entries(STATUS_LABEL).map(([k, v]) =>
          `<button class="qs-btn${task.status === k ? ' active-status' : ''}" onclick="changeTaskStatus('${id}','${k}'); openTaskDetail('${id}')">${v}</button>`
        ).join('')}
      </div>
    </div>
    <div class="detail-section">
      <div class="detail-label">Comments</div>
      <div id="commentsArea">${commentsHtml}</div>
      <div class="comment-input-wrap">
        <input type="text" id="commentInput" class="form-input comment-input" placeholder="Add a comment..." onkeydown="if(event.key==='Enter') addComment('${id}')" />
        <button class="btn btn-primary btn-sm" onclick="addComment('${id}')">Post</button>
      </div>
    </div>
  `;

  openModal('taskDetailModal');
}

function addComment(taskId) {
  const input = document.getElementById('commentInput');
  const text  = input.value.trim();
  if (!text) return;

  const task = tasks.find(t => t.id === taskId);
  if (!task) return;
  if (!task.comments) task.comments = [];
  task.comments.push({ text, at: new Date().toISOString() });
  input.value = '';
  saveTasks();
  openTaskDetail(taskId);
  showToast('💬 Comment added!', 'success');
}

// ─── Members Render ────────────────────────────────────
function renderMembers() {
  const grid = document.getElementById('membersGrid');
  grid.innerHTML = '';

  if (members.length === 0) {
    grid.innerHTML = `<div class="empty-state">
      <div class="empty-icon">👥</div>
      <h3>No team members yet!</h3>
      <p>Add your team members to assign tasks.</p>
      <button class="btn btn-primary" onclick="openModal('addMemberModal')">Add First Member</button>
    </div>`;
    return;
  }

  members.forEach((m, i) => {
    const memberTasks  = tasks.filter(t => t.assignee === m.id);
    const doneTasks    = memberTasks.filter(t => t.status === 'done').length;
    const activeTasks  = memberTasks.filter(t => t.status === 'inprogress').length;

    const card = document.createElement('div');
    card.className = 'member-card';
    card.style.animationDelay = `${i * 0.07}s`;
    card.innerHTML = `
      <div class="member-card-avatar" style="background:${m.color}">${m.name.charAt(0).toUpperCase()}</div>
      <div class="member-card-name">${escHtml(m.name)}</div>
      ${m.role  ? `<div class="member-card-role">${escHtml(m.role)}</div>` : ''}
      ${m.email ? `<div class="member-card-email">📧 ${escHtml(m.email)}</div>` : ''}
      <div class="member-stats">
        <div class="member-stat">
          <div class="member-stat-number" style="color:var(--purple-light)">${memberTasks.length}</div>
          <div class="member-stat-label">Total</div>
        </div>
        <div class="member-stat">
          <div class="member-stat-number" style="color:var(--blue-light)">${activeTasks}</div>
          <div class="member-stat-label">Active</div>
        </div>
        <div class="member-stat">
          <div class="member-stat-number" style="color:var(--green-light)">${doneTasks}</div>
          <div class="member-stat-label">Done</div>
        </div>
      </div>
      <div class="member-actions">
        <button class="btn btn-ghost btn-sm" onclick="editMember('${m.id}')">✏️ Edit</button>
        <button class="btn btn-danger btn-sm" onclick="deleteMember('${m.id}')">🗑 Remove</button>
      </div>
    `;
    grid.appendChild(card);
  });
}

// ─── Dashboard ─────────────────────────────────────────
function updateDashboard() {
  const total    = tasks.length;
  const ip       = tasks.filter(t => t.status === 'inprogress').length;
  const done     = tasks.filter(t => t.status === 'done').length;
  const todo     = tasks.filter(t => t.status === 'todo').length;
  const rev      = tasks.filter(t => t.status === 'review').length;
  const overdue  = tasks.filter(t => isTaskOverdue(t)).length;
  const pct      = total > 0 ? Math.round((done / total) * 100) : 0;

  setText('statTotal',   total);
  setText('statIP',      ip);
  setText('statDone',    done);
  setText('statOverdue', overdue);
  setText('overallPct',  pct + '%');
  setText('bdTodo',      todo);
  setText('bdIP',        ip);
  setText('bdRev',       rev);
  setText('bdDone',      done);

  // Animate progress bar
  setTimeout(() => {
    document.getElementById('overallBar').style.width = pct + '%';
  }, 100);

  // Priority breakdown
  const priorities = ['critical', 'high', 'medium', 'low'];
  const maxP = Math.max(...priorities.map(p => tasks.filter(t => t.priority === p).length), 1);
  priorities.forEach(p => {
    const n = tasks.filter(t => t.priority === p).length;
    setText('pb' + capitalize(p) + 'N', n);
    setTimeout(() => {
      document.getElementById('pb' + capitalize(p)).style.width = (n / maxP * 100) + '%';
    }, 200);
  });

  // Member workload
  renderWorkload();

  // Activity feed
  renderActivity();

  // Donut chart
  drawDonut(todo, ip, rev, done);
}

function renderWorkload() {
  const el = document.getElementById('memberWorkload');
  if (members.length === 0) {
    el.innerHTML = '<div class="empty-state-mini">No members yet.</div>';
    return;
  }
  const maxTasks = Math.max(...members.map(m => tasks.filter(t => t.assignee === m.id).length), 1);
  el.innerHTML = members.map(m => {
    const n = tasks.filter(t => t.assignee === m.id).length;
    const pct = Math.round((n / maxTasks) * 100);
    return `
      <div class="member-row">
        <div class="member-avatar-sm" style="background:${m.color}">${m.name.charAt(0).toUpperCase()}</div>
        <div class="member-info">
          <div class="member-nm">${escHtml(m.name)}</div>
          <div class="member-wl-bar"><div class="member-wl-fill" style="width:${pct}%"></div></div>
        </div>
        <span class="member-task-count">${n} task${n !== 1 ? 's' : ''}</span>
      </div>`;
  }).join('');
}

function renderActivity() {
  const el = document.getElementById('activityFeed');
  if (activity.length === 0) {
    el.innerHTML = '<div class="empty-state-mini">No recent activity.</div>';
    return;
  }
  el.innerHTML = activity.slice(0, 8).map(a => `
    <div class="activity-item">
      <div class="act-icon">${a.icon}</div>
      <div>
        <div class="act-text">${a.text}</div>
        <div class="act-time">${timeAgo(a.at)}</div>
      </div>
    </div>`).join('');
}

// ─── Donut Chart ───────────────────────────────────────
function drawDonut(todo, ip, rev, done) {
  const canvas = document.getElementById('donutChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const total = todo + ip + rev + done;
  if (total === 0) { ctx.clearRect(0, 0, 160, 160); return; }

  const colors = ['#5A5A7A', '#3B82F6', '#F59E0B', '#10B981'];
  const data   = [todo, ip, rev, done];
  const cx = 80, cy = 80, rOut = 68, rIn = 48;

  ctx.clearRect(0, 0, 160, 160);
  let start = -Math.PI / 2;

  data.forEach((val, i) => {
    if (val === 0) return;
    const angle = (val / total) * 2 * Math.PI;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, rOut, start, start + angle);
    ctx.arc(cx, cy, rIn, start + angle, start, true);
    ctx.closePath();
    ctx.fillStyle = colors[i];
    ctx.globalAlpha = 0.85;
    ctx.fill();
    start += angle;
  });

  // Center text
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#F1F1F8';
  ctx.font = 'bold 22px Space Grotesk, Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(total, cx, cy - 8);
  ctx.font = '11px Inter, sans-serif';
  ctx.fillStyle = '#9999BB';
  ctx.fillText('tasks', cx, cy + 12);
}

// ─── Badges ────────────────────────────────────────────
function updateBadges() {
  const total    = tasks.length;
  const todo     = tasks.filter(t => t.status === 'todo').length;
  const ip       = tasks.filter(t => t.status === 'inprogress').length;
  const rev      = tasks.filter(t => t.status === 'review').length;
  const done     = tasks.filter(t => t.status === 'done').length;
  const mc       = members.length;

  setText('dashBadge',   total);
  setText('tasksBadge',  total);
  setText('todoBadge',   todo);
  setText('ipBadge',     ip);
  setText('revBadge',    rev);
  setText('doneBadge',   done);
  setText('memberCountSidebar', mc + ' member' + (mc !== 1 ? 's' : ''));
}

// ─── Filters & Sort ────────────────────────────────────
function setFilter(filter, el) {
  currentFilter = filter;
  document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
  if (el) el.classList.add('active');
  renderTasks();
}

function filterByStatus(status, el) {
  switchView('tasks', document.querySelector('[data-view=tasks]'));
  setFilter(status, null);
  // highlight correct tab
  document.querySelectorAll('.filter-tab').forEach(t => {
    t.classList.toggle('active', t.textContent.toLowerCase().replace(' ', '') === status);
  });
}

function sortTasks(val) {
  currentSort = val;
  renderTasks();
}

function sortArray(arr, method) {
  const sorted = [...arr];
  switch (method) {
    case 'created_asc':   return sorted.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    case 'created_desc':  return sorted.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    case 'due_asc':       return sorted.sort((a, b) => (a.due || '9999') < (b.due || '9999') ? -1 : 1);
    case 'priority_desc': return sorted.sort((a, b) => PRIORITY_ORDER[b.priority] - PRIORITY_ORDER[a.priority]);
    case 'priority_asc':  return sorted.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
    default:              return sorted;
  }
}

function searchTasks(val) {
  currentSearch = val.trim();
  renderTasks();
}

function setTaskView(type) {
  currentTaskView = type;
  const container = document.getElementById('tasksContainer');
  container.className = `tasks-container ${type}-view`;
  document.getElementById('cardViewBtn').classList.toggle('active', type === 'card');
  document.getElementById('listViewBtn').classList.toggle('active', type === 'list');
  renderTasks();
}

// ─── Calendar ──────────────────────────────────────────
function initCalendar() {
  const now  = new Date();
  calYear    = now.getFullYear();
  calMonth   = now.getMonth();
}

function changeMonth(delta) {
  calMonth += delta;
  if (calMonth > 11) { calMonth = 0; calYear++; }
  if (calMonth < 0)  { calMonth = 11; calYear--; }
  renderCalendar();
}

function renderCalendar() {
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  document.getElementById('calMonthYear').textContent = `${MONTHS[calMonth]} ${calYear}`;

  const body  = document.getElementById('calBody');
  body.innerHTML = '';

  const first      = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const prevDays   = new Date(calYear, calMonth, 0).getDate();
  const today      = new Date();

  const cells = [];
  // Prev month pad
  for (let i = first - 1; i >= 0; i--) {
    cells.push({ day: prevDays - i, cur: false });
  }
  // Current month
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, cur: true });
  }
  // Next month pad
  let next = 1;
  while (cells.length % 7 !== 0) {
    cells.push({ day: next++, cur: false });
  }

  cells.forEach(cell => {
    const div = document.createElement('div');
    const isToday = cell.cur && cell.day === today.getDate() && calMonth === today.getMonth() && calYear === today.getFullYear();

    div.className = `cal-day${isToday ? ' today' : ''}${!cell.cur ? ' other-month' : ''}`;

    const numDiv = document.createElement('div');
    numDiv.className = 'cal-day-num';
    numDiv.textContent = cell.day;
    div.appendChild(numDiv);

    if (cell.cur) {
      const dateStr = `${calYear}-${String(calMonth + 1).padStart(2,'0')}-${String(cell.day).padStart(2,'0')}`;
      const dayTasks = tasks.filter(t => t.due === dateStr);
      dayTasks.slice(0, 3).forEach(t => {
        const dot = document.createElement('div');
        dot.className = `cal-task-dot ${t.status}`;
        dot.textContent = t.title;
        dot.title = t.title;
        dot.onclick = () => openTaskDetail(t.id);
        div.appendChild(dot);
      });
      if (dayTasks.length > 3) {
        const more = document.createElement('div');
        more.style.cssText = 'font-size:10px;color:var(--text-muted);padding:1px 4px;';
        more.textContent = `+${dayTasks.length - 3} more`;
        div.appendChild(more);
      }
    }

    body.appendChild(div);
  });
}

// ─── Assignee Dropdown ─────────────────────────────────
function populateAssigneeDropdown() {
  const sel = document.getElementById('taskAssignee');
  const cur = sel.value;
  sel.innerHTML = '<option value="">Unassigned</option>';
  members.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = m.name + (m.role ? ` (${m.role})` : '');
    sel.appendChild(opt);
  });
  sel.value = cur;
}

// ─── Notifications ─────────────────────────────────────
function checkNotifications() {
  const overdue = tasks.filter(t => isTaskOverdue(t)).length;
  document.getElementById('notifDot').style.display = overdue > 0 ? 'block' : 'none';
}

// ─── Activity Log ──────────────────────────────────────
function logActivity(icon, text) {
  activity.unshift({ icon, text, at: new Date().toISOString() });
  if (activity.length > 50) activity.pop();
  localStorage.setItem('haza_activity', JSON.stringify(activity));
}

// ─── Excel Export ──────────────────────────────────────
async function exportToExcel() {
  if (tasks.length === 0) {
    showToast('⚠️ No tasks to export!', 'warning');
    return;
  }

  showToast('📊 Generating Excel file...', 'info');

  const wb = XLSX.utils.book_new();

  /* ── Sheet 1: Tasks ── */
  const taskRows = [
    ['#', 'Task Title', 'Description', 'Status', 'Priority', 'Assigned To', 'Tag / Category', 'Due Date', 'Est. Hours', 'Created At', 'Updated At']
  ];

  tasks.forEach((t, i) => {
    const member = members.find(m => m.id === t.assignee);
    taskRows.push([
      i + 1,
      t.title,
      t.desc || '',
      STATUS_LABEL[t.status] || t.status,
      capitalize(t.priority),
      member ? member.name : 'Unassigned',
      t.tag || '',
      t.due ? formatDate(t.due) : '',
      t.hours || '',
      formatDateTime(t.createdAt),
      formatDateTime(t.updatedAt)
    ]);
  });

  const wsT = XLSX.utils.aoa_to_sheet(taskRows);

  // Column widths
  wsT['!cols'] = [
    { wch: 5 }, { wch: 35 }, { wch: 40 }, { wch: 14 },
    { wch: 12 }, { wch: 20 }, { wch: 18 }, { wch: 14 },
    { wch: 12 }, { wch: 22 }, { wch: 22 }
  ];

  // Style header row
  for (let c = 0; c < 11; c++) {
    const cell = wsT[XLSX.utils.encode_cell({ r: 0, c })];
    if (cell) {
      cell.s = {
        font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 11 },
        fill: { fgColor: { rgb: '7C3AED' } },
        alignment: { horizontal: 'center', vertical: 'center' },
        border: {
          bottom: { style: 'medium', color: { rgb: '5B21B6' } }
        }
      };
    }
  }

  // Status coloring for data rows
  const statusColors = { 'To Do': 'E9D5FF', 'In Progress': 'DBEAFE', 'In Review': 'FEF3C7', 'Done': 'D1FAE5' };
  const priorityColors = { 'Critical': 'FEE2E2', 'High': 'FFEDD5', 'Medium': 'FEF9C3', 'Low': 'DCFCE7' };

  for (let r = 1; r < taskRows.length; r++) {
    const statusVal   = taskRows[r][3];
    const priorityVal = taskRows[r][4];

    for (let c = 0; c < 11; c++) {
      const cellAddr = XLSX.utils.encode_cell({ r, c });
      if (!wsT[cellAddr]) wsT[cellAddr] = { v: '', t: 's' };
      wsT[cellAddr].s = {
        alignment: { vertical: 'center', wrapText: true },
        fill: c === 3 && statusColors[statusVal]   ? { fgColor: { rgb: statusColors[statusVal] } }   :
              c === 4 && priorityColors[priorityVal] ? { fgColor: { rgb: priorityColors[priorityVal] } } :
              r % 2 === 0 ? { fgColor: { rgb: 'F5F3FF' } } : undefined,
        border: {
          top:    { style: 'thin', color: { rgb: 'E5E7EB' } },
          bottom: { style: 'thin', color: { rgb: 'E5E7EB' } },
          left:   { style: 'thin', color: { rgb: 'E5E7EB' } },
          right:  { style: 'thin', color: { rgb: 'E5E7EB' } }
        }
      };
    }
  }

  wsT['!freeze'] = { xSplit: 0, ySplit: 1 }; // Freeze header row

  XLSX.utils.book_append_sheet(wb, wsT, '📋 Tasks');

  /* ── Sheet 2: Members ── */
  if (members.length > 0) {
    const memberRows = [
      ['#', 'Name', 'Role', 'Email', 'Total Tasks', 'To Do', 'In Progress', 'In Review', 'Done', 'Completion %', 'Joined At']
    ];
    members.forEach((m, i) => {
      const mt  = tasks.filter(t => t.assignee === m.id);
      const tdo = mt.filter(t => t.status === 'todo').length;
      const tip = mt.filter(t => t.status === 'inprogress').length;
      const trv = mt.filter(t => t.status === 'review').length;
      const tdn = mt.filter(t => t.status === 'done').length;
      const pct = mt.length > 0 ? Math.round((tdn / mt.length) * 100) : 0;
      memberRows.push([
        i + 1, m.name, m.role || '', m.email || '',
        mt.length, tdo, tip, trv, tdn, pct + '%',
        formatDateTime(m.joinedAt)
      ]);
    });

    const wsM = XLSX.utils.aoa_to_sheet(memberRows);
    wsM['!cols'] = [
      { wch: 5 }, { wch: 24 }, { wch: 18 }, { wch: 28 },
      { wch: 12 }, { wch: 10 }, { wch: 14 }, { wch: 12 },
      { wch: 10 }, { wch: 14 }, { wch: 22 }
    ];

    for (let c = 0; c < 11; c++) {
      const cell = wsM[XLSX.utils.encode_cell({ r: 0, c })];
      if (cell) {
        cell.s = {
          font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 11 },
          fill: { fgColor: { rgb: '2563EB' } },
          alignment: { horizontal: 'center', vertical: 'center' }
        };
      }
    }

    wsM['!freeze'] = { xSplit: 0, ySplit: 1 };
    XLSX.utils.book_append_sheet(wb, wsM, '👥 Members');
  }

  /* ── Sheet 3: Summary ── */
  const total   = tasks.length;
  const ipC     = tasks.filter(t => t.status === 'inprogress').length;
  const doneC   = tasks.filter(t => t.status === 'done').length;
  const todoC   = tasks.filter(t => t.status === 'todo').length;
  const reviewC = tasks.filter(t => t.status === 'review').length;
  const overdue = tasks.filter(t => isTaskOverdue(t)).length;
  const totalH  = tasks.reduce((sum, t) => sum + (parseFloat(t.hours) || 0), 0);
  const doneH   = tasks.filter(t => t.status === 'done').reduce((sum, t) => sum + (parseFloat(t.hours) || 0), 0);

  const summaryRows = [
    ['HAZA COLLAB TASKS — SUMMARY REPORT', ''],
    ['Generated', formatDateTime(new Date().toISOString())],
    ['', ''],
    ['📊 OVERVIEW', ''],
    ['Total Tasks',      total],
    ['To Do',           todoC],
    ['In Progress',     ipC],
    ['In Review',       reviewC],
    ['Completed',       doneC],
    ['Overdue',         overdue],
    ['Completion Rate', total > 0 ? Math.round((doneC / total) * 100) + '%' : '0%'],
    ['', ''],
    ['👥 TEAM', ''],
    ['Total Members',   members.length],
    ['', ''],
    ['⏱ HOURS', ''],
    ['Total Est. Hours', totalH],
    ['Hours Completed',  doneH],
    ['Hours Remaining',  totalH - doneH],
    ['', ''],
    ['🔴 PRIORITY BREAKDOWN', ''],
    ['Critical', tasks.filter(t => t.priority === 'critical').length],
    ['High',     tasks.filter(t => t.priority === 'high').length],
    ['Medium',   tasks.filter(t => t.priority === 'medium').length],
    ['Low',      tasks.filter(t => t.priority === 'low').length],
  ];

  const wsS = XLSX.utils.aoa_to_sheet(summaryRows);
  wsS['!cols'] = [{ wch: 28 }, { wch: 22 }];

  // Title cell style
  const titleCell = wsS['A1'];
  if (titleCell) {
    titleCell.s = {
      font: { bold: true, sz: 14, color: { rgb: '7C3AED' } },
      alignment: { horizontal: 'left' }
    };
  }

  XLSX.utils.book_append_sheet(wb, wsS, '📊 Summary');

  /* ── Write & Download ── */
  const now      = new Date();
  const dateStr  = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  const fileName = `HAZA_Collab_Tasks_${dateStr}.xlsx`;

  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([wbout], { type: 'application/octet-stream' });
  await saveFileDirectly(blob, fileName);

  logActivity('📊', `Exported tasks to <strong>${fileName}</strong>`);
  showToast(`✅ Exported: ${fileName}`, 'success');
}

// ─── Direct Save Support ───────────────────────────────
async function loadDirectoryHandle() {
  if ('indexedDB' in window) {
    // Optional: Load saved handle from local storage or IndexedDB if we wanted to persist
    // For now, we'll just implement the picker-based flow
  }
}

async function requestDirectoryAccess() {
  try {
    if (!window.showDirectoryPicker) {
      showToast('❌ Folder Picker not supported in this browser.', 'error');
      return;
    }
    directoryHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
    showToast('📂 Folder access granted! Exports will save here.', 'success');
    logActivity('📂', 'Granted folder access for exports.');
  } catch (err) {
    console.warn(err);
    showToast('⚠️ Folder access cancelled.', 'warning');
  }
}

async function saveFileDirectly(blob, fileName) {
  if (!directoryHandle) {
    // Fallback to normal download
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
    return;
  }

  try {
    const fileHandle = await directoryHandle.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();
    showToast(`📁 Saved to folder: ${fileName}`, 'success');
  } catch (err) {
    console.error(err);
    showToast('❌ Error saving to directory.', 'error');
  }
}

// ─── Helpers ───────────────────────────────────────────
function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}
function escHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}
function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}
function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}
function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
function formatDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) +
         ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}
function timeAgo(iso) {
  if (!iso) return '';
  const diff = (Date.now() - new Date(iso)) / 1000;
  if (diff < 60)   return 'just now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  return Math.floor(diff / 86400) + 'd ago';
}
function isTaskOverdue(task) {
  if (!task.due || task.status === 'done') return false;
  return new Date(task.due + 'T23:59:59') < new Date();
}
function isTaskDueSoon(task) {
  if (!task.due || task.status === 'done') return false;
  const due  = new Date(task.due + 'T23:59:59');
  const now  = new Date();
  const diff = (due - now) / (1000 * 60 * 60 * 24);
  return diff >= 0 && diff <= 2;
}
function getMemberName(id) {
  const m = members.find(m => m.id === id);
  return m ? m.name : '';
}

// ─── Persist ───────────────────────────────────────────
function saveTasks()   { localStorage.setItem('haza_tasks',   JSON.stringify(tasks)); }
function saveMembers() { localStorage.setItem('haza_members', JSON.stringify(members)); }

// ─── Toast ─────────────────────────────────────────────
function showToast(msg, type = 'info') {
  const t = document.getElementById('toast');
  t.textContent = '';
  const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
  t.textContent = msg;
  t.className = `toast ${type} show`;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 3200);
}

// ─── Refresh All ───────────────────────────────────────
function refreshAll() {
  renderTasks();
  updateDashboard();
  updateBadges();
  checkNotifications();
  applyRolePermissions();
}

// ─── Role Logic ─────────────────────────────────────────
function checkRole() {
  if (!currentRole) {
    document.getElementById('roleModal').classList.add('open');
  } else {
    applyRolePermissions();
  }
}

let selectedTempRole = null;

function selectRole(role) {
  selectedTempRole = role;
  
  // Update UI
  document.getElementById('optViewer').classList.toggle('selected', role === 'viewer');
  document.getElementById('optAdmin').classList.toggle('selected', role === 'admin');
  
  const passSection = document.getElementById('adminPassSection');
  const confirmBtn = document.getElementById('confirmRoleBtn');
  
  if (role === 'admin') {
    passSection.classList.remove('pass-hidden');
    confirmBtn.disabled = true;
    document.getElementById('adminPassword').focus();
  } else {
    passSection.classList.add('pass-hidden');
    confirmBtn.disabled = false;
  }
}

function confirmAdminRole(isFinal = false) {
  const pass = document.getElementById('adminPassword').value;
  const error = document.getElementById('passError');
  const btn = document.getElementById('confirmRoleBtn');
  
  if (pass === 'Janma.123') {
    error.classList.add('pass-hidden');
    btn.disabled = false;
    if (isFinal) finalizeRole();
  } else {
    // Only show error if password length is similar or on final attempt
    if (pass.length >= 8 || isFinal) {
      error.classList.remove('pass-hidden');
    } else {
      error.classList.add('pass-hidden');
    }
    btn.disabled = true;
  }
}

function finalizeRole() {
  currentRole = selectedTempRole;
  localStorage.setItem('haza_role', currentRole);
  document.getElementById('roleModal').classList.remove('open');
  applyRolePermissions();
  showToast(`✅ Logged in as ${capitalize(currentRole)}`, 'success');
}

function applyRolePermissions() {
  const body = document.body;
  body.classList.remove('role-admin', 'role-viewer');
  
  if (currentRole) {
    body.classList.add(`role-${currentRole}`);
    const badge = document.getElementById('roleBadge');
    if (badge) badge.textContent = currentRole.toUpperCase();
  }

  if (currentRole === 'viewer') {
    // Hide or disable all "destructive" or "create" buttons
    const selectors = [
      '.btn-primary:not(.role-btn):not(.export-btn)', 
      '.task-actions', 
      '.quick-status', 
      '.member-actions',
      '#detailEditBtn',
      '#detailDeleteBtn',
      '.comment-input-wrap',
      '.add-btn-wrap'
    ];
    
    selectors.forEach(s => {
      document.querySelectorAll(s).forEach(el => {
        el.style.display = 'none';
      });
    });
  } else {
    // Restore for admin
    const selectors = [
      '.btn-primary', 
      '.task-actions', 
      '.quick-status', 
      '.member-actions',
      '#detailEditBtn',
      '#detailDeleteBtn',
      '.comment-input-wrap',
      '.add-btn-wrap'
    ];
    selectors.forEach(s => {
      document.querySelectorAll(s).forEach(el => {
        if (el.tagName === 'BUTTON' || el.tagName === 'DIV' || el.tagName === 'A') {
           el.style.display = '';
        }
      });
    });
  }
}

function logout() {
  localStorage.removeItem('haza_role');
  location.reload();
}
