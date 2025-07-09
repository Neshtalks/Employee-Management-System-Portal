// public/script.js (Final, Corrected Version)

document.addEventListener('DOMContentLoaded', () => {

    const API_URL = '/api';
    const appRoot = document.getElementById('app-root');
    let liveTimerInterval = null;

    const format = {
        date(dateString) {
            if (!dateString) return 'N/A';
            const date = new Date(dateString);
            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
        },
        time(timeString) {
            if (!timeString) return '';
            const date = new Date(`1970-01-01T${timeString}Z`);
            return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'UTC' });
        }
    };
    
    const api = {
        async fetch(endpoint, options = {}) {
            const token = localStorage.getItem('authToken');
            const headers = { 'Content-Type': 'application/json', ...options.headers };
            if (token) headers['Authorization'] = `Bearer ${token}`;
            
            try {
                const url = endpoint.startsWith('/login') ? `/api${endpoint}` : `${API_URL}${endpoint}`;
                const response = await fetch(url, { ...options, headers });
                
                if (response.status === 204 || (response.status === 201 && !response.headers.get("content-type")?.includes("json"))) {
                    return;
                }
                
                if (response.headers.get("content-disposition")?.includes("attachment")) {
                    return response.blob();
                }

                const data = await response.json();
                if (!response.ok) {
                    throw new Error(data.error || 'An unknown API error occurred.');
                }
                return data;
            } catch (err) {
                console.error('API Fetch Error:', err);
                throw err;
            }
        }
    };

    const auth = {
        login: async (username, password) => {
            const data = await api.fetch('/login', { method: 'POST', body: JSON.stringify({ username, password }) });
            localStorage.setItem('authToken', data.token);
            return auth.getCurrentUser();
        },
        logout: () => {
            localStorage.removeItem('authToken');
            clearInterval(liveTimerInterval);
            app.init();
        },
        getCurrentUser: () => {
            const token = localStorage.getItem('authToken');
            if (!token) return null;
            try {
                return JSON.parse(atob(token.split('.')[1]));
            } catch (e) {
                console.error('Invalid token:', e);
                localStorage.removeItem('authToken');
                return null;
            }
        }
    };

    const ui = {
        renderLoginPage(error = '') {
            clearInterval(liveTimerInterval);
            appRoot.innerHTML = `
                <div class="login-grid">
                    <div class="login-branding">
                        <h1 class="login-logo">EMS</h1>
                        <p class="login-tagline">Your integrated workforce management platform.</p>
                    </div>
                    <div class="login-container">
                        <div class="login-form-card">
                            <h2 class="login-title">Welcome Back</h2>
                            <p class="login-subtitle">Please enter your details to sign in.</p>
                            <form id="login-form">
                                <div class="input-group"><i class="fa-solid fa-user input-icon"></i><input type="text" id="username" name="username" placeholder="Username" required></div>
                                <div class="input-group"><i class="fa-solid fa-lock input-icon"></i><input type="password" id="password" name="password" placeholder="Password" required></div>
                                <button type="submit" class="btn btn-primary btn-login">Sign In</button>
                                <p class="error-message">${error}</p>
                            </form>
                        </div>
                    </div>
                </div>`;
        },
        renderAppShell(user) {
            clearInterval(liveTimerInterval);
            appRoot.innerHTML = `
                <aside class="sidebar">
                    <div class="sidebar-header">EMS</div>
                    <ul class="sidebar-nav" id="sidebar-nav"></ul>
                    <div class="sidebar-footer">
                        <div class="user-info"><i class="fa-solid fa-circle-user"></i><span>${user.fullName}</span></div>
                        <button id="logout-button" class="btn btn-secondary"><i class="fa-solid fa-right-from-bracket"></i>Logout</button>
                    </div>
                </aside>
                <div class="main-container">
                    <main class="main-content" id="main-content"><div class="loader"></div></main>
                </div>`;
        },
        setActiveNav(view) {
            document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
            const activeItem = document.querySelector(`.nav-item[data-view="${view}"]`);
            if (activeItem) activeItem.classList.add('active');
        },
        renderNav(role) {
            const navEl = document.getElementById('sidebar-nav');
            let navItems = '';
            if (role === 'Employee') navItems = `<li class="nav-item" data-view="dashboard"><i class="fa-solid fa-table-columns fa-fw"></i>Dashboard</li><li class="nav-item" data-view="leaves"><i class="fa-solid fa-plane-departure fa-fw"></i>Leave Requests</li>`;
            if (role === 'Manager') navItems = `<li class="nav-item" data-view="reports"><i class="fa-solid fa-chart-simple fa-fw"></i>Reports</li><li class="nav-item" data-view="leaves"><i class="fa-solid fa-plane-departure fa-fw"></i>Manage Leave</li>`;
            if (role === 'Admin') navItems = `<li class="nav-item" data-view="users"><i class="fa-solid fa-users-cog fa-fw"></i>User Management</li>`;
            navEl.innerHTML = navItems;
        },
        async renderView(view) {
            this.setActiveNav(view);
            const mainContent = document.getElementById('main-content');
            mainContent.innerHTML = `<div class="loader"></div>`;
            try {
                switch(view) {
                    case 'dashboard': await this.renderEmployeeDashboard(mainContent); break;
                    case 'leaves': auth.getCurrentUser().role === 'Employee' ? await this.renderEmployeeLeave(mainContent) : await this.renderManagerLeave(mainContent); break;
                    case 'reports': await this.renderManagerDashboard(mainContent); break;
                    case 'users': await this.renderAdminDashboard(mainContent); break;
                    default: mainContent.innerHTML = '<h1>Page not found</h1>';
                }
            } catch (error) {
                mainContent.innerHTML = `<div class="error-card"><i class="fa-solid fa-circle-exclamation"></i><h3>An Error Occurred</h3><p>${error.message}</p><button id="reload-view-btn" data-view="${view}" class="btn btn-primary">Try Again</button></div>`;
            }
        },
        getStatusIcon(state) {
            const icons = {
                'On Task': 'fa-solid fa-person-digging',
                'Working': 'fa-solid fa-clock',
                'On Break': 'fa-solid fa-mug-saucer',
                'Clocked Out': 'fa-solid fa-bed'
            };
            return icons[state] || 'fa-solid fa-question-circle';
        },
        async renderEmployeeDashboard(container) {
            const data = await api.fetch('/employee/dashboard');
            const { currentStatus, tasks, stats } = data;

            container.innerHTML = `
                <div class="page-header"><h1>My Dashboard</h1><p>Today is ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p></div>
                <div class="status-card status-${currentStatus.state.toLowerCase().replace(' ', '-')}">
                    <i class="${this.getStatusIcon(currentStatus.state)} status-icon"></i>
                    <div class="status-info">
                        <div class="status-title">${currentStatus.state}</div>
                        <div class="status-text">${currentStatus.text}</div>
                    </div>
                </div>
                <div class="main-actions-bar">
                    <button id="clock-in-btn" class="btn btn-primary" ${currentStatus.state !== 'Clocked Out' ? 'disabled' : ''}><i class="fa-solid fa-play"></i> Clock In</button>
                    <button id="clock-out-btn" class="btn btn-danger" ${currentStatus.state === 'Clocked Out' ? 'disabled' : ''}><i class="fa-solid fa-stop"></i> Clock Out</button>
                    <button id="start-break-btn" class="btn btn-secondary" ${currentStatus.state === 'Working' || currentStatus.state === 'On Task' ? '' : 'disabled'}><i class="fa-solid fa-mug-saucer"></i> Start Break</button>
                    <button id="end-break-btn" class="btn btn-secondary" ${currentStatus.state === 'On Break' ? '' : 'disabled'}><i class="fa-solid fa-keyboard"></i> End Break</button>
                </div>
                <div class="stats-grid">${this.getStatsGridHtml(stats)}</div>
                <div class="card" style="margin-top: 2rem;"><h3 class="card-title"><i class="fa-solid fa-list-check"></i> My Tasks for Today</h3>
                    <ul id="task-list">${this.getTaskListHtml(tasks, currentStatus.state)}</ul>
                    <form id="add-task-form"><input name="description" placeholder="Add a new task..." required><button type="submit" class="btn btn-primary">Add Task</button></form>
                </div>`;
            this.startLiveTimers(currentStatus, stats);
        },
        async renderManagerDashboard(container) {
            const employees = await api.fetch('/manager/employees');
            const today = new Date().toISOString().slice(0, 10);
            container.innerHTML = `
                <div class="page-header"><h1>Manager Reports</h1></div>
                <div class="card">
                    <h3 class="card-title"><i class="fa-solid fa-magnifying-glass-chart"></i> Performance Report</h3>
                    <div class="report-controls">
                        <select id="employee-select"><option value="">-- Select Employee --</option>${employees.map(e => `<option value="${e.id}">${e.full_name}</option>`).join('')}</select>
                        <div class="date-range-picker">
                            <input type="date" id="start-date-select" value="${today}">
                            <span>to</span>
                            <input type="date" id="end-date-select" value="${today}">
                        </div>
                        <button id="view-report-btn" class="btn btn-primary"><i class="fa-solid fa-eye"></i> View Report</button>
                        <button id="export-report-btn" class="btn btn-secondary"><i class="fa-solid fa-file-excel"></i> Export to Excel</button>
                    </div>
                    <div id="report-display-area" class="report-container">Select an employee and a date range to view their report.</div>
                </div>`;
        },
        async renderAdminDashboard(container) {
            const users = await api.fetch('/users');
            container.innerHTML = `
                <div class="page-header"><h1>User Management</h1></div>
                <div class="page-grid-full">
                    <div class="card">
                        <h3 class="card-title"><i class="fa-solid fa-user-plus"></i>Create New User</h3>
                        <form id="create-user-form" class="user-form">
                            <input name="fullName" placeholder="Full Name" required>
                            <input name="username" placeholder="Username" required>
                            <input name="password" placeholder="Password" type="password" required>
                            <select name="role" required><option value="">-- Select Role --</option><option value="Employee">Employee</option><option value="Manager">Manager</option></select>
                            <input name="position" placeholder="Position (e.g., Developer)">
                            <input name="department" placeholder="Department (e.g., Engineering)">
                            <textarea name="allowed_ips" placeholder="Allowed IPs (comma-separated, e.g., 192.168.1.100, ::1)"></textarea>
                            <button type="submit" class="btn btn-primary">Create User</button>
                        </form>
                    </div>
                    <div class="card">
                        <h3 class="card-title"><i class="fa-solid fa-users"></i>Existing Users</h3>
                        <div class="user-list">
                            <table>
                                <thead><tr><th>Name</th><th>Role</th><th>Allowed IPs</th><th>Actions</th></tr></thead>
                                <tbody>
                                    ${users.map(u => `
                                        <tr>
                                            <td>${u.full_name}<br><small>${u.username}</small></td>
                                            <td>${u.role}</td>
                                            <td>
                                                <form class="update-ips-form" data-id="${u.id}">
                                                    <input name="allowed_ips" value="${u.allowed_ips || ''}" placeholder="e.g., 192.168.1.100, ::1" ${u.role === 'Admin' ? 'disabled title="Admin access is not restricted by IP"' : ''}>
                                                </form>
                                            </td>
                                            <td class="action-buttons">
                                                <button class="btn btn-success btn-sm" data-action="update-ips" data-id="${u.id}" ${u.role === 'Admin' ? 'disabled' : ''}><i class="fa-solid fa-save"></i></button>
                                                <button class="btn btn-danger btn-sm" data-action="delete-user" data-id="${u.id}"><i class="fa-solid fa-trash"></i></button>
                                            </td>
                                        </tr>`).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>`;
        },
        async renderEmployeeLeave(container) {
            const requests = await api.fetch('/leave');
            container.innerHTML = `
                <div class="page-header"><h1>My Leave Requests</h1></div>
                <div class="page-grid">
                    <div class="card">
                        <h3 class="card-title"><i class="fa-solid fa-paper-plane"></i>New Leave Request</h3>
                        <form id="leave-request-form">
                            <select name="leaveType" required><option value="">-- Select Leave Type --</option><option>Vacation</option><option>Sick</option><option>Personal</option></select>
                            <div class="date-range-picker"><label>Start Date <input type="date" name="startDate" required></label><label>End Date <input type="date" name="endDate" required></label></div>
                            <textarea name="reason" placeholder="Reason for leave..." required></textarea>
                            <button class="btn btn-primary" type="submit">Submit Request</button>
                        </form>
                    </div>
                    <div class="card">
                        <h3 class="card-title"><i class="fa-solid fa-history"></i>Request History</h3>
                        <div class="leave-list">${requests.length > 0 ? `<table><thead><tr><th>Type</th><th>Dates</th><th>Status</th></tr></thead><tbody>
                            ${requests.map(r => `<tr><td>${r.leave_type}</td><td>${format.date(r.start_date)} to ${format.date(r.end_date)}</td><td><span class="status-badge ${r.status.toLowerCase()}">${r.status}</span></td></tr>`).join('')}
                        </tbody></table>` : '<p>No leave requests found.</p>'}</div>
                    </div>
                </div>`;
        },
        async renderManagerLeave(container) {
            const requests = await api.fetch('/leave/pending');
            container.innerHTML = `
                <div class="page-header"><h1>Manage Leave Requests</h1></div>
                <div class="card">
                    <h3 class="card-title"><i class="fa-solid fa-inbox"></i>Pending Requests</h3>
                    <div class="leave-list">${requests.length > 0 ? `<table><thead><tr><th>Employee</th><th>Type</th><th>Dates</th><th>Reason</th><th>Actions</th></tr></thead><tbody>
                        ${requests.map(r => `<tr>
                            <td>${r.full_name}</td><td>${r.leave_type}</td><td>${format.date(r.start_date)} to ${format.date(r.end_date)}</td><td>${r.reason}</td>
                            <td><div class="action-buttons"><button class="btn btn-success btn-sm" data-action="approve-leave" data-id="${r.id}"><i class="fa fa-check"></i></button><button class="btn btn-danger btn-sm" data-action="reject-leave" data-id="${r.id}"><i class="fa fa-times"></i></button></div></td>
                        </tr>`).join('')}
                    </tbody></table>` : '<p>No pending leave requests.</p>'}</div>
                </div>`;
        },
        getTaskListHtml(tasks, state) {
            return tasks.map(task => {
                const isWorkActive = ['Working', 'On Task'].includes(state);
                let actions = '';
                if (task.status === 'Active') {
                    actions = `<div class="live-timer" data-timer-type="task-item" data-timer-start="${task.active_session_start}"></div><button class="btn btn-secondary btn-sm" data-action="stop-task" data-id="${task.id}">Pause</button>`;
                } else if (task.status !== 'Completed') {
                    actions = `<button class="btn btn-primary btn-sm" data-action="start-task" data-id="${task.id}" ${isWorkActive ? '' : 'disabled'}>Start</button>`;
                }
                if (task.status !== 'Completed') {
                    actions += `<button class="btn btn-success btn-sm" data-action="complete-task" data-id="${task.id}" title="Complete Task"><i class="fa-solid fa-check"></i></button>`;
                } else {
                    actions = `<span class="completed-text"><i class="fa-solid fa-check-circle"></i> Completed</span>`;
                }
                return `<li class="task-item ${task.status.toLowerCase()}">
                    <div class="task-details">
                        <p class="task-desc">${task.description}</p>
                        <span class="task-duration">Total Time: ${Math.round(task.total_minutes || 0)} mins</span>
                    </div>
                    <div class="task-actions">${actions}</div>
                </li>`;
            }).join('') || '<li class="no-tasks">No tasks for today. Add one below!</li>';
        },
        getStatsGridHtml(stats) {
            return `
                <div class="stat-card work"><div class="stat-value" id="work-timer">${stats.work.toFixed(2)}</div><div class="stat-label">Total Work (Hrs)</div></div>
                <div class="stat-card task"><div class="stat-value" id="task-timer">${stats.task.toFixed(0)}</div><div class="stat-label">Task Time (Mins)</div></div>
                <div class="stat-card break"><div class="stat-value" id="break-timer">${stats.break.toFixed(0)}</div><div class="stat-label">Break Time (Mins)</div></div>
                <div class="stat-card idle"><div class="stat-value" id="idle-timer">${stats.idle.toFixed(0)}</div><div class="stat-label">Idle Time (Mins)</div></div>`;
        },
        getTimelineIcon(type) {
             const icons = {
                'CLOCK_IN': 'fa-play', 'CLOCK_OUT': 'fa-stop', 'BREAK_START': 'fa-mug-saucer',
                'BREAK_END': 'fa-keyboard', 'TASK_START': 'fa-person-digging', 'TASK_STOP': 'fa-pause'
            };
            return icons[type] || 'fa-question';
        },
        renderReportData(container, data) {
            container.innerHTML = `
                <div class="report-header"><h4>Report for ${data.employee.full_name}</h4><p>${data.employee.position || 'N/A'} - ${data.employee.department || 'N/A'}</p></div>
                <div class="stats-grid">${this.getStatsGridHtml(data.summary)}</div>
                <div class="report-details-grid">
                    <div class="card">
                        <h3 class="card-title"><i class="fa-solid fa-timeline"></i> Activity Timeline</h3>
                        <ul class="timeline">
                            ${data.timeline.map(item => `
                                <li class="timeline-item">
                                    <i class="timeline-icon fa-solid ${this.getTimelineIcon(item.type)}"></i>
                                    <span class="timeline-time">${format.date(item.date)}<br>${format.time(item.time)}</span>
                                    <p class="timeline-text">${item.text}</p>
                                </li>
                            `).join('') || '<li>No activity recorded.</li>'}
                        </ul>
                    </div>
                     <div class="card">
                        <h3 class="card-title"><i class="fa-solid fa-list-check"></i> Task Summary</h3>
                         <table><thead><tr><th>Date</th><th>Task</th><th>Time</th><th>Status</th></tr></thead>
                            <tbody>
                                ${data.tasks.map(t => `<tr><td>${format.date(t.task_date)}</td><td>${t.description}</td><td>${Math.round(t.total_minutes || 0)} mins</td><td><span class="status-badge ${t.status.toLowerCase()}">${t.status}</span></td></tr>`).join('') || '<tr><td colspan="4">No tasks recorded.</td></tr>'}
                            </tbody>
                        </table>
                    </div>
                </div>`;
        },
        startLiveTimers(currentStatus, baseStats) {
            clearInterval(liveTimerInterval);
            const today = new Date().toISOString().slice(0, 10);
            
            liveTimerInterval = setInterval(() => {
                const workTimerEl = document.getElementById('work-timer');
                const taskTimerEl = document.getElementById('task-timer');
                const breakTimerEl = document.getElementById('break-timer');
                const idleTimerEl = document.getElementById('idle-timer');

                if (!workTimerEl || !taskTimerEl || !breakTimerEl || !idleTimerEl) {
                    clearInterval(liveTimerInterval);
                    return;
                }

                let liveWorkMinutes = baseStats.work * 60;
                let liveBreakMinutes = baseStats.break;
                let liveTaskMinutes = baseStats.task;

                if (currentStatus.work_start_time) {
                    const start = new Date(`${today}T${currentStatus.work_start_time}`);
                    liveWorkMinutes += (new Date() - start) / 60000;
                }
                if (currentStatus.break_start_time) {
                    const start = new Date(`${today}T${currentStatus.break_start_time}`);
                    liveBreakMinutes += (new Date() - start) / 60000;
                }
                
                const taskItemTimerEl = document.querySelector('.task-item.active .live-timer');
                if (taskItemTimerEl) {
                    const start = new Date(taskItemTimerEl.dataset.timerStart);
                    const elapsedMs = new Date() - start;
                    const currentSessionTaskMinutes = elapsedMs / 60000;
                    liveTaskMinutes = baseStats.task + currentSessionTaskMinutes;
                    
                    const displayMinutes = Math.floor(currentSessionTaskMinutes);
                    const displaySeconds = Math.floor((elapsedMs % 60000) / 1000).toString().padStart(2, '0');
                    taskItemTimerEl.textContent = `Active: ${displayMinutes}m ${displaySeconds}s`;
                }
                
                workTimerEl.textContent = (liveWorkMinutes / 60).toFixed(2);
                taskTimerEl.textContent = liveTaskMinutes.toFixed(0);
                breakTimerEl.textContent = liveBreakMinutes.toFixed(0);
                idleTimerEl.textContent = Math.max(0, liveWorkMinutes - liveBreakMinutes - liveTaskMinutes).toFixed(0);
            }, 1000);
        },
    };

    const app = {
        async init() {
            const user = auth.getCurrentUser();
            if (user) {
                ui.renderAppShell(user);
                ui.renderNav(user.role);
                const defaultView = { Employee: 'dashboard', Manager: 'reports', Admin: 'users' };
                await ui.renderView(defaultView[user.role]);
            } else {
                ui.renderLoginPage();
            }
        },
        async handleClick(e) {
            const button = e.target.closest('button');
            const navItem = e.target.closest('.nav-item');

            try {
                if (navItem) await ui.renderView(navItem.dataset.view);

                if (button) {
                    const action = button.id || button.dataset.action;
                    if (action === 'logout-button') return auth.logout();
                    if (action === 'reload-view-btn') return ui.renderView(button.dataset.view);
                    
                    if (action === 'update-ips') {
                        const userId = button.dataset.id;
                        const form = document.querySelector(`.update-ips-form[data-id="${userId}"]`);
                        if (!form) return;
                        const ips = form.elements.allowed_ips.value;
                        await api.fetch(`/users/${userId}`, { method: 'PUT', body: JSON.stringify({ allowed_ips: ips }) });
                        alert('User IPs updated successfully!');
                        await ui.renderView('users');
                    }
                    
                    if (action === 'delete-user') {
                        const userId = button.dataset.id;
                        if (confirm('Are you sure you want to permanently delete this user and all their data? This cannot be undone.')) {
                            await api.fetch(`/users/${userId}`, { method: 'DELETE' });
                            alert('User deleted successfully.');
                            await ui.renderView('users');
                        }
                    }
                    
                    if (action === 'view-report-btn') {
                        const employeeId = document.getElementById('employee-select').value;
                        const startDate = document.getElementById('start-date-select').value;
                        const endDate = document.getElementById('end-date-select').value;
                        if (!employeeId || !startDate || !endDate) return alert('Please select an employee and a full date range.');
                        const reportData = await api.fetch(`/manager/view-report?employeeId=${employeeId}&startDate=${startDate}&endDate=${endDate}`);
                        ui.renderReportData(document.getElementById('report-display-area'), reportData);
                    }

                    if (action === 'export-report-btn') {
                        const employeeId = document.getElementById('employee-select').value;
                        const startDate = document.getElementById('start-date-select').value;
                        const endDate = document.getElementById('end-date-select').value;
                        if (!employeeId || !startDate || !endDate) return alert('Please select an employee and a full date range to export.');
                        
                        const blob = await api.fetch(`/manager/export-report?employeeId=${employeeId}&startDate=${startDate}&endDate=${endDate}`, {}, true);
                        const url = window.URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.style.display = 'none';
                        a.href = url;
                        a.download = `Report_${employeeId}_${startDate}_to_${endDate}.xlsx`;
                        document.body.appendChild(a);
                        a.click();
                        window.URL.revokeObjectURL(url);
                        a.remove();
                    }

                    const timeActionMap = { 'clock-in-btn': 'clockin', 'clock-out-btn': 'clockout', 'start-break-btn': 'startbreak', 'end-break-btn': 'endbreak' };
                    if (timeActionMap[action]) { await api.fetch(`/time/${timeActionMap[action]}`, { method: 'POST' }); await ui.renderView('dashboard'); }
        
                    const taskActionMap = { 'start-task': 'start', 'stop-task': 'stop', 'complete-task': 'complete' };
                    if (taskActionMap[action]) { await api.fetch(`/tasks/${button.dataset.id}/${taskActionMap[action]}`, { method: 'POST' }); await ui.renderView('dashboard'); }
                    
                    const leaveActionMap = { 'approve-leave': 'Approved', 'reject-leave': 'Rejected' };
                    if (leaveActionMap[action]) { await api.fetch(`/leave/${button.dataset.id}/${leaveActionMap[action]}`, { method: 'PUT' }); await ui.renderView('leaves'); }
                }
            } catch (err) {
                alert(`Error: ${err.message}`);
            }
        },
        async handleSubmit(e) {
            e.preventDefault();
            const form = e.target;
            const formData = Object.fromEntries(new FormData(form));

            try {
                if (form.id === 'login-form') { await auth.login(formData.username, formData.password); app.init(); }
                if (form.id === 'add-task-form') { await api.fetch('/tasks', { method: 'POST', body: JSON.stringify({ description: formData.description }) }); await ui.renderView('dashboard'); }
                if (form.id === 'create-user-form') { await api.fetch('/users', { method: 'POST', body: JSON.stringify(formData) }); await ui.renderView('users'); }
                if (form.id === 'leave-request-form') { await api.fetch('/leave', { method: 'POST', body: JSON.stringify(formData) }); await ui.renderView('leaves'); }
            } catch (err) {
                if (form.id === 'login-form') {
                    ui.renderLoginPage(err.message);
                } else {
                    alert(`Error: ${err.message}`);
                }
            }
        }
    };
    
    appRoot.addEventListener('click', (e) => app.handleClick(e));
    appRoot.addEventListener('submit', (e) => app.handleSubmit(e));
    app.init();
});