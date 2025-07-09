// server.js (Final, Corrected Version with Proper Routing)

// --- IMPORTS and CONFIG ---
const express = require('express');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const cors = require('cors');
const path = require('path');
const xlsx = require('xlsx');

const app = express();
app.set('trust proxy', true);
const PORT = 3000;
const CONNECTION_STRING = "postgres://postgres:YourPassword@localhost:5432/ems_db"; 
const JWT_SECRET = 'your-super-secret-key-that-is-secure-and-long';

// --- DATABASE SETUP ---
const pool = new Pool({ connectionString: CONNECTION_STRING });
pool.connect()
    .then(() => console.log('Connected to local PostgreSQL database'))
    .catch(err => console.error('Database connection error', err.stack));

// --- HELPERS & AUTH ---
function hashPassword(password) { return crypto.createHash('sha256').update(password).digest('hex'); }
const dbGet = async (sql, params = []) => {
    const client = await pool.connect();
    try {
        const result = await client.query(sql, params);
        return result.rows[0];
    } finally {
        client.release();
    }
};
const dbAll = async (sql, params = []) => {
    const client = await pool.connect();
    try {
        const result = await client.query(sql, params);
        return result.rows;
    } finally {
        client.release();
    }
};
const dbRun = async (sql, params = []) => {
    const client = await pool.connect();
    try {
        const result = await client.query(sql, params);
        return { id: result.rows[0]?.id, changes: result.rowCount };
    } finally {
        client.release();
    }
};
const authenticateToken = (req, res, next) => {
    let token = req.headers['authorization']?.split(' ')[1];
    if (!token && req.query.token) {
        token = req.query.token;
    }
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Forbidden' });
        req.user = user;
        next();
    });
};
const authorizeRole = (roles) => (req, res, next) => {
    if (!Array.isArray(roles)) roles = [roles];
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: `Access denied. Requires one of: ${roles.join(', ')}` });
    next();
};

// --- MIDDLEWARE SETUP ---
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- REUSABLE LOGIC ---
async function getEmployeeReportData(employeeId, startDate, endDate) { /* as before */ }
async function stopAndUpdateCurrentTask(employeeId) { /* as before */ }
// (Paste existing functions here)
async function getEmployeeReportData(employeeId, startDate, endDate) {
    const employee = await dbGet("SELECT full_name, position, department FROM employees WHERE id = $1", [employeeId]);
    if (!employee) throw new Error("Employee not found");
    const dates = [];
    for (let d = new Date(startDate); d <= new Date(endDate); d.setDate(d.getDate() + 1)) {
        dates.push(new Date(d).toISOString().slice(0, 10));
    }
    let allTimelineEvents = [], allTasks = [], totalWorkMinutes = 0, totalBreakMinutes = 0, totalTaskMinutes = 0;
    for (const date of dates) {
        const workSessions = await dbAll("SELECT id, start_time, end_time FROM time_tracking WHERE employee_id = $1 AND work_date = $2", [employeeId, date]);
        for (const session of workSessions) {
            allTimelineEvents.push({ date: date, type: 'CLOCK_IN', time: session.start_time, text: 'Clocked In' });
            if (session.end_time) {
                allTimelineEvents.push({ date: date, type: 'CLOCK_OUT', time: session.end_time, text: 'Clocked Out' });
                totalWorkMinutes += (new Date(`${date}T${session.end_time}`) - new Date(`${date}T${session.start_time}`)) / 60000;
            }
            const breakSessions = await dbAll("SELECT start_time, end_time FROM breaks WHERE tracking_id = $1", [session.id]);
            for (const b of breakSessions) {
                allTimelineEvents.push({ date: date, type: 'BREAK_START', time: b.start_time, text: 'Break Started' });
                if (b.end_time) {
                    allTimelineEvents.push({ date: date, type: 'BREAK_END', time: b.end_time, text: 'Break Ended' });
                    totalBreakMinutes += (new Date(`${date}T${b.end_time}`) - new Date(`${date}T${b.start_time}`)) / 60000;
                }
            }
        }
        const dailyTasks = await dbAll("SELECT id, description, status, total_minutes, task_date FROM tasks WHERE employee_id = $1 AND task_date = $2", [employeeId, date]);
        for (const task of dailyTasks) {
            allTasks.push(task);
            totalTaskMinutes += task.total_minutes || 0;
            const taskSessions = await dbAll("SELECT start_time, end_time FROM task_sessions WHERE task_id = $1", [task.id]);
            for (const ts of taskSessions) {
                allTimelineEvents.push({ date: date, type: 'TASK_START', time: new Date(ts.start_time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }), text: `Started task: ${task.description}`});
                if (ts.end_time) {
                    allTimelineEvents.push({ date: date, type: 'TASK_STOP', time: new Date(ts.end_time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }), text: `Stopped task: ${task.description}` });
                }
            }
        }
    }
    allTimelineEvents.sort((a, b) => new Date(`${a.date}T${a.time}`) - new Date(`${b.date}T${b.time}`));
    const summary = { work: totalWorkMinutes / 60, break: totalBreakMinutes, task: totalTaskMinutes, idle: Math.max(0, totalWorkMinutes - totalBreakMinutes - totalTaskMinutes) };
    return { employee, summary, tasks: allTasks, timeline: allTimelineEvents };
}
async function stopAndUpdateCurrentTask(employeeId) {
    const activeTaskSession = await dbGet("SELECT ts.id as sessionId, ts.start_time, t.id as taskId FROM task_sessions ts JOIN tasks t ON ts.task_id = t.id WHERE t.employee_id = $1 AND ts.end_time IS NULL", [employeeId]);
    if (activeTaskSession) {
        const endTime = new Date();
        const startTime = new Date(activeTaskSession.start_time);
        const durationMinutes = (endTime - startTime) / 60000;
        await dbRun("UPDATE task_sessions SET end_time = $1 WHERE id = $2 RETURNING id", [endTime.toISOString(), activeTaskSession.sessionId]);
        await dbRun("UPDATE tasks SET status = 'Paused', total_minutes = total_minutes + $1 WHERE id = $2 RETURNING id", [durationMinutes, activeTaskSession.taskId]);
    }
}

// =================================================================
// --- API ROUTER SETUP ---
// =================================================================
const apiRouter = express.Router();

// --- PUBLIC / UNPROTECTED ROUTES ---
apiRouter.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await dbGet("SELECT * FROM employees WHERE username = $1", [username]);

        if (!user || user.password !== hashPassword(password)) {
            return res.status(401).json({ error: "Invalid username or password" });
        }
        
        if (user.role !== 'Admin') {
            const hasIpRestrictions = user.allowed_ips && user.allowed_ips.trim() !== '';
            if (hasIpRestrictions) {
                const allowedIPs = user.allowed_ips.split(',').map(ip => ip.trim());
                const clientIp = req.ip;
                
                if (!allowedIPs.includes(clientIp)) {
                    return res.status(403).json({ error: `Access Denied: Your IP address (${clientIp}) is not approved for this account.` });
                }
            }
        }

        const payload = { id: user.id, username: user.username, role: user.role, fullName: user.full_name };
        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '8h' });
        res.json({ token, user: payload });

    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- PROTECTED ROUTES ---
apiRouter.use(authenticateToken); // All routes below this line are now protected

// --- ADMIN ROUTES ---
apiRouter.get('/users', authorizeRole(['Admin']), async (req, res) => {
    res.json(await dbAll("SELECT id, username, full_name, role, position, department, allowed_ips FROM employees WHERE id != $1 ORDER BY full_name", [req.user.id]));
});
apiRouter.post('/users', authorizeRole(['Admin']), async (req, res) => {
    try {
        const { username, password, fullName, role, position, department, allowed_ips } = req.body;
        await dbRun( 'INSERT INTO employees (username, password, full_name, role, position, department, allowed_ips) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id', [username, hashPassword(password), fullName, role, position, department, allowed_ips || '']);
        res.status(201).json({ message: 'User created successfully' });
    } catch (err) { res.status(400).json({ error: "Username might already exist or invalid data provided." }); }
});
apiRouter.put('/users/:id', authorizeRole(['Admin']), async (req, res) => {
    try {
        const { allowed_ips } = req.body;
        await dbRun("UPDATE employees SET allowed_ips = $1 WHERE id = $2 RETURNING id", [allowed_ips || '', req.params.id]);
        res.json({ message: "User's allowed IPs updated successfully."});
    } catch (err) { res.status(500).json({ error: "Failed to update user." }); }
});
apiRouter.delete('/users/:id', authorizeRole(['Admin']), async (req, res) => {
    try {
        const userIdToDelete = req.params.id;
        if (parseInt(userIdToDelete, 10) === req.user.id) {
            return res.status(400).json({ error: "You cannot delete your own account." });
        }
        await dbRun("DELETE FROM employees WHERE id = $1", [userIdToDelete]);
        res.status(204).send();
    } catch (err) { res.status(500).json({ error: "Failed to delete user." }); }
});

// --- MANAGER ROUTES ---
apiRouter.get('/manager/employees', authorizeRole(['Manager']), async (req, res) => res.json(await dbAll("SELECT id, full_name FROM employees WHERE role = 'Employee'")));
apiRouter.get('/manager/view-report', authorizeRole(['Manager']), async (req, res) => {
    const { employeeId, startDate, endDate } = req.query;
    if (!employeeId || !startDate || !endDate) return res.status(400).json({ error: 'Employee ID and a date range are required.' });
    try {
        const reportData = await getEmployeeReportData(employeeId, startDate, endDate);
        res.json(reportData);
    } catch(e) { res.status(500).json({ error: e.message }); }
});
apiRouter.get('/manager/export-report', authorizeRole(['Manager']), async (req, res) => {
    const { employeeId, startDate, endDate } = req.query;
    if (!employeeId || !startDate || !endDate) return res.status(400).send('Employee ID and a date range are required.');
    try {
        const { employee, summary, tasks, timeline } = await getEmployeeReportData(employeeId, startDate, endDate);
        const wb = xlsx.utils.book_new();
        const summaryData = [
            ["Employee Name", employee.full_name], ["Position", employee.position || 'N/A'], ["Department", employee.department || 'N/A'],
            ["Report Period", `${startDate} to ${endDate}`], [],
            ["Metric", "Total"], ["Total Work (Hours)", summary.work.toFixed(2)], ["Task Time (Minutes)", summary.task.toFixed(0)],
            ["Break Time (Minutes)", summary.break.toFixed(0)], ["Idle Time (Minutes)", summary.idle.toFixed(0)],
        ];
        const wsSummary = xlsx.utils.aoa_to_sheet(summaryData);
        xlsx.utils.book_append_sheet(wb, wsSummary, "Summary");
        const tasksData = tasks.map(t => ({ Date: t.task_date, Task: t.description, Status: t.status, 'Time Spent (Mins)': Math.round(t.total_minutes || 0) }));
        const wsTasks = xlsx.utils.json_to_sheet(tasksData);
        xlsx.utils.book_append_sheet(wb, wsTasks, "Tasks");
        const timelineData = timeline.map(t => ({ Date: t.date, Time: t.time, Event: t.text }));
        const wsTimeline = xlsx.utils.json_to_sheet(timelineData);
        xlsx.utils.book_append_sheet(wb, wsTimeline, "Activity Timeline");
        const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
        const filename = `Report_${employee.full_name.replace(/ /g, '_')}_${startDate}_to_${endDate}.xlsx`;
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buffer);
    } catch (e) { res.status(500).send(`Error generating report: ${e.message}`); }
});
apiRouter.get('/leave/pending', authorizeRole('Manager'), async(req, res) => res.json(await dbAll("SELECT lr.*, e.full_name FROM leave_requests lr JOIN employees e ON lr.employee_id = e.id WHERE lr.status = 'Pending' ORDER BY lr.start_date")));
apiRouter.put('/leave/:id/:status', authorizeRole('Manager'), async(req, res) => {
    const { id, status } = req.params;
    if(!['Approved', 'Rejected'].includes(status)) return res.status(400).json({error: 'Invalid status.'});
    await dbRun("UPDATE leave_requests SET status = $1 WHERE id = $2 RETURNING id", [status, id]);
    res.json({ message: `Request has been ${status.toLowerCase()}` });
});

// --- EMPLOYEE ROUTES ---
apiRouter.get('/employee/dashboard', authorizeRole(['Employee']), async (req, res) => {
    const today = new Date().toISOString().slice(0, 10);
    const employeeId = req.user.id;
    const { summary, tasks } = await getEmployeeReportData(employeeId, today, today);
    const workSession = await dbGet("SELECT id, start_time FROM time_tracking WHERE employee_id = $1 AND work_date = $2 AND end_time IS NULL", [employeeId, today]);
    const breakSession = workSession ? await dbGet("SELECT start_time FROM breaks WHERE tracking_id = $1 AND end_time IS NULL", [workSession.id]) : null;
    const activeTasks = await dbAll("SELECT t.*, ts.start_time as active_session_start FROM tasks t LEFT JOIN task_sessions ts ON t.id = ts.task_id AND ts.end_time IS NULL WHERE t.employee_id = $1 AND t.task_date = $2 AND t.status = 'Active'", [employeeId, today]);
    
    let currentStatus = { state: 'Clocked Out', text: 'Not currently working.' };
    const activeTask = activeTasks[0];
    if (workSession) {
        currentStatus = { state: 'Working', text: 'Currently on the clock (Idle).', work_start_time: workSession.start_time };
        if (breakSession) {
            currentStatus = { state: 'On Break', text: 'Currently on a break.', break_start_time: breakSession.start_time };
        } else if (activeTask) {
            currentStatus = { state: 'On Task', text: `Working on: ${activeTask.description}`, task_start_time: activeTask.active_session_start };
        }
    }
    res.json({ currentStatus, tasks, stats: summary });
});
apiRouter.post('/time/clockin', authorizeRole('Employee'), async (req, res) => { await dbRun("INSERT INTO time_tracking (employee_id, work_date, start_time) VALUES ($1, $2, $3) RETURNING id", [req.user.id, new Date().toISOString().slice(0, 10), new Date().toLocaleTimeString('en-GB', { hour12: false })]); res.json({ message: 'Clocked In' }); });
apiRouter.post('/time/clockout', authorizeRole('Employee'), async (req, res) => { await stopAndUpdateCurrentTask(req.user.id); await dbRun("UPDATE time_tracking SET end_time = $1 WHERE employee_id = $2 AND end_time IS NULL RETURNING id", [new Date().toLocaleTimeString('en-GB', { hour12: false }), req.user.id]); res.json({ message: 'Clocked Out' }); });
apiRouter.post('/time/startbreak', authorizeRole('Employee'), async (req, res) => { await stopAndUpdateCurrentTask(req.user.id); const session = await dbGet("SELECT id FROM time_tracking WHERE employee_id = $1 AND end_time IS NULL", [req.user.id]); if(session) await dbRun("INSERT INTO breaks (tracking_id, start_time) VALUES ($1, $2) RETURNING id", [session.id, new Date().toLocaleTimeString('en-GB', { hour12: false })]); res.json({ message: 'Break Started' }); });
apiRouter.post('/time/endbreak', authorizeRole('Employee'), async (req, res) => { await dbRun("UPDATE breaks SET end_time = $1 WHERE end_time IS NULL AND tracking_id IN (SELECT id FROM time_tracking WHERE employee_id = $2) RETURNING id", [new Date().toLocaleTimeString('en-GB', { hour12: false }), req.user.id]); res.json({ message: 'Break Ended' }); });
apiRouter.post('/tasks', authorizeRole('Employee'), async (req, res) => { await dbRun("INSERT INTO tasks (employee_id, task_date, description) VALUES ($1, $2, $3) RETURNING id", [req.user.id, new Date().toISOString().slice(0, 10), req.body.description]); res.status(201).json({ message: 'Task Created' }); });
apiRouter.post('/tasks/:id/start', authorizeRole('Employee'), async (req, res) => { await stopAndUpdateCurrentTask(req.user.id); await dbRun("UPDATE tasks SET status = 'Active' WHERE id = $1 AND employee_id = $2 RETURNING id", [req.params.id, req.user.id]); await dbRun("INSERT INTO task_sessions (task_id, start_time) VALUES ($1, $2) RETURNING id", [req.params.id, new Date().toISOString()]); res.json({ message: 'Task Started' }); });
apiRouter.post('/tasks/:id/stop', authorizeRole('Employee'), async (req, res) => { await stopAndUpdateCurrentTask(req.user.id); res.json({ message: 'Task Paused' }); });
apiRouter.post('/tasks/:id/complete', authorizeRole('Employee'), async (req, res) => { await stopAndUpdateCurrentTask(req.user.id); await dbRun("UPDATE tasks SET status = 'Completed' WHERE id = $1 AND employee_id = $2 RETURNING id", [req.params.id, req.user.id]); res.json({ message: 'Task Completed' }); });
apiRouter.post('/leave', authorizeRole('Employee'), async (req, res) => { const { leaveType, startDate, endDate, reason } = req.body; await dbRun("INSERT INTO leave_requests (employee_id, leave_type, start_date, end_date, reason) VALUES ($1, $2, $3, $4, $5) RETURNING id", [req.user.id, leaveType, startDate, endDate, reason]); res.status(201).json({message: 'Leave request submitted successfully'}); });
apiRouter.get('/leave', authorizeRole('Employee'), async (req, res) => res.json(await dbAll("SELECT * FROM leave_requests WHERE employee_id = $1 ORDER BY start_date DESC", [req.user.id])));

// Mount the protected API router under the /api prefix
app.use('/api', apiRouter);

// --- Table Creation and Seeding ---
const createTables = async () => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(`CREATE TABLE IF NOT EXISTS employees (id SERIAL PRIMARY KEY, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL, full_name TEXT, role TEXT, position TEXT, department TEXT, allowed_ips TEXT);`);
        await client.query(`CREATE TABLE IF NOT EXISTS time_tracking (id SERIAL PRIMARY KEY, employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE, work_date DATE NOT NULL, start_time TIME NOT NULL, end_time TIME);`);
        await client.query(`CREATE TABLE IF NOT EXISTS breaks (id SERIAL PRIMARY KEY, tracking_id INTEGER REFERENCES time_tracking(id) ON DELETE CASCADE, start_time TIME, end_time TIME);`);
        await client.query(`CREATE TABLE IF NOT EXISTS tasks (id SERIAL PRIMARY KEY, employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE, task_date DATE, description TEXT, status TEXT DEFAULT 'Pending', total_minutes REAL DEFAULT 0);`);
        await client.query(`CREATE TABLE IF NOT EXISTS task_sessions (id SERIAL PRIMARY KEY, task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE, start_time TIMESTAMPTZ, end_time TIMESTAMPTZ);`);
        await client.query(`CREATE TABLE IF NOT EXISTS leave_requests (id SERIAL PRIMARY KEY, employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE, leave_type TEXT, start_date DATE, end_date DATE, reason TEXT, status TEXT DEFAULT 'Pending');`);
        const res = await client.query("SELECT COUNT(*) as count FROM employees");
        if (res.rows[0].count === '0') {
            console.log("Seeding database with default admin user...");
            await client.query('INSERT INTO employees (username, password, full_name, role) VALUES ($1, $2, $3, $4)', ['admin', hashPassword('admin123'), 'System Administrator', 'Admin']);
        }
        await client.query('COMMIT');
        console.log('Tables created and checked successfully.');
    } catch (e) {
        await client.query('ROLLBACK');
        console.error("Error creating tables: ", e);
        throw e;
    } finally {
        client.release();
    }
};

// --- SERVER START ---
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
createTables().then(() => {
    app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
}).catch(e => {
    console.error("Failed to start server:", e);
    process.exit(1);
});