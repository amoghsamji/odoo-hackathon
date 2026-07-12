const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5002;

app.use(cors());
app.use(express.json());

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'ecosphere_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Middleware to check database connection
app.use(async (req, res, next) => {
  try {
    const conn = await pool.getConnection();
    conn.release();
    next();
  } catch (err) {
    res.status(500).json({ error: 'Database connection failed. Make sure MySQL is running.' });
  }
});

// 1. Get Policies & compliance rates
app.get('/api/policies', async (req, res) => {
  try {
    const query = `
      SELECT p.*,
             COUNT(pa.id) AS total_assigned,
             SUM(CASE WHEN pa.status = 'Acknowledged' THEN 1 ELSE 0 END) AS total_acknowledged
      FROM esg_policies p
      LEFT JOIN policy_acknowledgements pa ON p.id = pa.policy_id
      GROUP BY p.id
      ORDER BY p.effective_date DESC
    `;
    const [rows] = await pool.query(query);

    const formatted = rows.map(r => {
      const pct = r.total_assigned > 0 ? Math.round((r.total_acknowledged / r.total_assigned) * 100) : 100;
      return {
        ...r,
        acknowledgement_rate: pct,
        compliance_status: pct >= 80 ? 'Compliant' : 'Non-Compliant'
      };
    });

    res.json(formatted);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 2. Create Policy
app.post('/api/policies', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { title, description, owner_name, effective_date } = req.body;
    if (!title || !description || !owner_name || !effective_date) {
      await connection.rollback();
      return res.status(400).json({ error: 'All fields are required' });
    }

    const [result] = await connection.query(
      'INSERT INTO esg_policies (title, description, owner_name, effective_date, status) VALUES (?, ?, ?, ?, "Active")',
      [title, description, owner_name, effective_date]
    );
    const policyId = result.insertId;

    // Create Pending acknowledgements for all existing employees
    const [employees] = await connection.query('SELECT id FROM employees');
    for (const emp of employees) {
      await connection.query(
        'INSERT INTO policy_acknowledgements (policy_id, employee_id, status) VALUES (?, ?, "Pending")',
        [policyId, emp.id]
      );
    }

    // Trigger Notification Systems
    const notifMsg = `New governance policy published: "${title}". Acknowledging mandatory.`;
    await connection.query(
      'INSERT INTO notifications (type, message) VALUES ("policy_acknowledgement_reminder", ?)',
      [notifMsg]
    );

    await connection.commit();
    res.status(201).json({ id: policyId, message: 'Policy created and assigned successfully!' });
  } catch (error) {
    await connection.rollback();
    res.status(500).json({ error: error.message });
  } finally {
    connection.release();
  }
});

// 3. Get Acknowledgments rates per department and details
app.get('/api/acknowledgements', async (req, res) => {
  try {
    const query = `
      SELECT pa.id, p.title AS policy_title, e.name AS employee_name, e.department_id, pa.status, pa.acknowledged_at
      FROM policy_acknowledgements pa
      JOIN esg_policies p ON pa.policy_id = p.id
      JOIN employees e ON pa.employee_id = e.id
      ORDER BY pa.status ASC, pa.acknowledged_at DESC
    `;
    const [rows] = await pool.query(query);

    // Calculate rates by department group
    const deptQuery = `
      SELECT e.department_id, d.name AS department_name,
             COUNT(pa.id) AS total,
             SUM(CASE WHEN pa.status = 'Acknowledged' THEN 1 ELSE 0 END) AS acknowledged
      FROM policy_acknowledgements pa
      JOIN employees e ON pa.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      GROUP BY e.department_id
    `;
    const [deptRows] = await pool.query(deptQuery);

    const deptRates = deptRows.map(dr => {
      const pct = dr.total > 0 ? Math.round((dr.acknowledged / dr.total) * 100) : 100;
      return {
        department_id: dr.department_id,
        department_name: dr.department_name || 'Global / Other',
        rate: pct
      };
    });

    res.json({
      details: rows,
      departmentRates: deptRates
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 4. Acknowledge policy sign-off
app.post('/api/acknowledgements/sign', async (req, res) => {
  try {
    const { policyId, employeeId } = req.body;
    if (!policyId || !employeeId) {
      return res.status(400).json({ error: 'policyId and employeeId are required' });
    }

    const [result] = await pool.query(
      'UPDATE policy_acknowledgements SET status = "Acknowledged", acknowledged_at = NOW() WHERE policy_id = ? AND employee_id = ? AND status = "Pending"',
      [policyId, employeeId]
    );

    if (result.affectedRows === 0) {
      return res.status(400).json({ error: 'Policy already acknowledged or record not found.' });
    }

    res.json({ message: 'Policy successfully signed off and acknowledged!' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 5. Get Audits
app.get('/api/audits', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM audits ORDER BY audit_date DESC');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 6. Create Audit
app.post('/api/audits', async (req, res) => {
  try {
    const { title, auditor, audit_date, status } = req.body;
    if (!title || !auditor || !audit_date || !status) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const [result] = await pool.query(
      'INSERT INTO audits (title, auditor, audit_date, status) VALUES (?, ?, ?, ?)',
      [title, auditor, audit_date, status]
    );

    res.status(201).json({ id: result.insertId, title, auditor, audit_date, status });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 7. Get Compliance Issues (including auto-flagging overdue open issues)
app.get('/api/issues', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Find open compliance issues where due_date has passed, and auto-flag them
    const [overdue] = await connection.query(
      'SELECT id, description, owner_name FROM compliance_issues WHERE status = "Open" AND due_date < CURDATE()'
    );

    for (const issue of overdue) {
      await connection.query('UPDATE compliance_issues SET status = "Flagged" WHERE id = ?', [issue.id]);
      
      // Trigger Notification Systems
      const notifMsg = `Compliance Warning: Issue "${issue.description}" is overdue. Assigned owner: ${issue.owner_name}.`;
      await connection.query(
        'INSERT INTO notifications (type, message) VALUES ("compliance_issue_overdue", ?)',
        [notifMsg]
      );
    }

    await connection.commit();

    const [rows] = await connection.query(`
      SELECT ci.*, a.title AS audit_title
      FROM compliance_issues ci
      LEFT JOIN audits a ON ci.audit_id = a.id
      ORDER BY FIELD(ci.status, 'Flagged', 'Open', 'Resolved'), ci.due_date ASC
    `);

    res.json(rows);
  } catch (error) {
    await connection.rollback();
    res.status(500).json({ error: error.message });
  } finally {
    connection.release();
  }
});

// 8. Create Compliance Issue
app.post('/api/issues', async (req, res) => {
  try {
    const { audit_id, description, severity, owner_name, due_date } = req.body;
    if (!description || !severity || !owner_name || !due_date) {
      return res.status(400).json({ error: 'description, severity, owner_name and due_date are required' });
    }

    const auditIdVal = audit_id ? parseInt(audit_id) : null;

    const [result] = await pool.query(
      'INSERT INTO compliance_issues (audit_id, description, severity, owner_name, due_date, status) VALUES (?, ?, ?, ?, ?, "Open")',
      [auditIdVal, description, severity, owner_name, due_date]
    );

    // Trigger Notification
    const notifMsg = `New compliance issue raised: "${description}". Severity: ${severity}. Owner: ${owner_name}.`;
    await pool.query(
      'INSERT INTO notifications (type, message) VALUES ("compliance_issue_raised", ?)',
      [notifMsg]
    );

    res.status(201).json({ id: result.insertId, message: 'Compliance issue created successfully!' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 9. Resolve Compliance Issue
app.post('/api/issues/:id/resolve', async (req, res) => {
  try {
    const issueId = req.params.id;
    const [result] = await pool.query(
      'UPDATE compliance_issues SET status = "Resolved" WHERE id = ? AND status != "Resolved"',
      [issueId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Open compliance issue not found or already resolved' });
    }

    res.json({ message: 'Compliance issue marked as resolved.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 10. Get Notifications
app.get('/api/notifications', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM notifications ORDER BY created_at DESC LIMIT 50');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 11. Clear/Mark Notifications as Read
app.post('/api/notifications/clear', async (req, res) => {
  try {
    await pool.query('UPDATE notifications SET is_read = TRUE');
    res.json({ message: 'Notifications cleared successfully.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`EcoSphere governance backend server is running on port ${PORT}`);
});
