const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5001;

app.use(cors());
app.use(express.json());

// Database connection pool
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

// Settings Endpoints
app.get('/api/settings', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM settings');
    const settings = {};
    rows.forEach(r => {
      settings[r.setting_key] = r.setting_value === '1';
    });
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/settings', async (req, res) => {
  try {
    const { evidence_requirement } = req.body;
    if (evidence_requirement === undefined) {
      return res.status(400).json({ error: 'Setting values are required' });
    }
    const val = evidence_requirement ? '1' : '0';
    await pool.query(
      'INSERT INTO settings (setting_key, setting_value) VALUES ("evidence_requirement", ?) ON DUPLICATE KEY UPDATE setting_value = ?',
      [val, val]
    );
    res.json({ message: 'Settings updated successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all Employees (for the dropdown selection)
app.get('/api/employees', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, name, email FROM employees');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get CSR Activities (with optional search and prerequisite info)
app.get('/api/activities', async (req, res) => {
  try {
    const { search } = req.query;
    let query = `
      SELECT a.*, t.name AS prerequisite_name 
      FROM csr_activities a 
      LEFT JOIN trainings t ON a.prerequisite_training_id = t.id
    `;
    let params = [];

    if (search) {
      query += ' WHERE a.name LIKE ? OR a.description LIKE ? OR a.category LIKE ?';
      const searchWildcard = `%${search}%`;
      params = [searchWildcard, searchWildcard, searchWildcard];
    }

    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add New CSR Activity
app.post('/api/activities', async (req, res) => {
  try {
    const { name, category, description, points, icon, prerequisite_training_id } = req.body;
    if (!name || !category || !description || !points || !icon) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const prereqId = prerequisite_training_id ? parseInt(prerequisite_training_id) : null;

    const [result] = await pool.query(
      'INSERT INTO csr_activities (name, category, description, points, icon, prerequisite_training_id) VALUES (?, ?, ?, ?, ?, ?)',
      [name, category, description, parseInt(points), icon, prereqId]
    );

    res.status(201).json({ id: result.insertId, name, category, description, points, icon });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Join/Register Participation
app.post('/api/activities/:id/join', async (req, res) => {
  try {
    const activityId = req.params.id;
    const { employeeId, proof, hoursSpent, notes } = req.body;

    if (!employeeId) {
      return res.status(400).json({ error: 'Employee is required to join an activity.' });
    }

    // 1. Fetch Activity Details & Prerequisite ID
    const [activities] = await pool.query(
      'SELECT points, prerequisite_training_id, name FROM csr_activities WHERE id = ?',
      [activityId]
    );
    if (activities.length === 0) {
      return res.status(404).json({ error: 'Activity not found' });
    }
    const activity = activities[0];

    // 2. Enforce Prerequisite Check
    if (activity.prerequisite_training_id) {
      const [trainings] = await pool.query(
        'SELECT status FROM employee_trainings WHERE employee_id = ? AND training_id = ? AND status = "Completed"',
        [employeeId, activity.prerequisite_training_id]
      );
      if (trainings.length === 0) {
        return res.status(400).json({
          error: `Prerequisite Violation: You must complete the required compliance training before joining "${activity.name}".`
        });
      }
    }

    // 3. Enforce Evidence Check (On submission/Join if toggle is active)
    const [settings] = await pool.query('SELECT setting_value FROM settings WHERE setting_key = "evidence_requirement"');
    const evidenceRequired = settings.length > 0 && settings[0].setting_value === '1';

    if (evidenceRequired && (!proof || proof.trim() === '')) {
      return res.status(400).json({
        error: 'Evidence Required: You cannot submit a CSR participation request without attaching proof.'
      });
    }

    // 4. Check Duplicate Join
    const [existing] = await pool.query(
      'SELECT id FROM employee_participations WHERE employee_id = ? AND activity_id = ? AND status != "Rejected"',
      [employeeId, activityId]
    );
    if (existing.length > 0) {
      return res.status(400).json({ error: 'You have already submitted a request for this activity.' });
    }

    // 5. Insert Record
    const [result] = await pool.query(
      'INSERT INTO employee_participations (employee_id, activity_id, proof, status, points, hours_spent, employee_notes) VALUES (?, ?, ?, "Pending", ?, ?, ?)',
      [employeeId, activityId, proof || null, activity.points, parseInt(hoursSpent) || 0, notes || null]
    );

    res.status(201).json({ id: result.insertId, message: 'Participation request submitted successfully!' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get Participation queue
app.get('/api/participations', async (req, res) => {
  try {
    const query = `
      SELECT ep.id, e.name AS employee_name, a.name AS activity_name, ep.proof, ep.points, ep.status, ep.hours_spent, ep.employee_notes
      FROM employee_participations ep
      JOIN employees e ON ep.employee_id = e.id
      JOIN csr_activities a ON ep.activity_id = a.id
      ORDER BY ep.status DESC, ep.completion_date DESC
    `;
    const [rows] = await pool.query(query);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Approve Participation
app.post('/api/participations/:id/approve', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const participationId = req.params.id;

    // Fetch participation details
    const [participations] = await connection.query(
      'SELECT employee_id, points, status, proof FROM employee_participations WHERE id = ?',
      [participationId]
    );

    if (participations.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Participation claim not found' });
    }

    const claim = participations[0];
    if (claim.status === 'Approved') {
      await connection.rollback();
      return res.status(400).json({ error: 'Claim is already approved' });
    }

    // Check Business Rule: Evidence Requirement
    const [settings] = await connection.query('SELECT setting_value FROM settings WHERE setting_key = "evidence_requirement"');
    const evidenceRequired = settings.length > 0 && settings[0].setting_value === '1';

    if (evidenceRequired && (!claim.proof || claim.proof.trim() === '' || claim.proof === 'None')) {
      await connection.rollback();
      return res.status(400).json({ error: 'Business Rule Violation: CSR Activity participation cannot be approved without proof evidence.' });
    }

    // Update participation status
    await connection.query(
      'UPDATE employee_participations SET status = "Approved" WHERE id = ?',
      [participationId]
    );

    // Credit points to employee
    await connection.query(
      'UPDATE employees SET points = points + ? WHERE id = ?',
      [claim.points, claim.employee_id]
    );

    await connection.commit();
    res.json({ message: 'Claim approved successfully and points awarded!' });
  } catch (error) {
    await connection.rollback();
    res.status(500).json({ error: error.message });
  } finally {
    connection.release();
  }
});

// Reject Participation
app.post('/api/participations/:id/reject', async (req, res) => {
  try {
    const participationId = req.params.id;
    const [result] = await pool.query(
      'UPDATE employee_participations SET status = "Rejected" WHERE id = ? AND status = "Pending"',
      [participationId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Pending participation claim not found or already processed' });
    }

    res.json({ message: 'Claim rejected successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get Diversity Metrics based on APPROVED CSR PARTICIPATIONS
app.get('/api/diversity-metrics', async (req, res) => {
  try {
    // Select all employees who have participated in approved CSR activities
    const query = `
      SELECT e.gender, e.ethnicity, e.is_leadership, e.is_board, ep.hours_spent, a.category
      FROM employee_participations ep
      JOIN employees e ON ep.employee_id = e.id
      JOIN csr_activities a ON ep.activity_id = a.id
      WHERE ep.status = 'Approved'
    `;
    const [participants] = await pool.query(query);

    if (participants.length === 0) {
      return res.json({
        genderDistribution: { Female: 0, Male: 0, Other: 0 },
        leadershipEthnicity: { actual: 0, target: 35 },
        boardDiversity: { actual: 0, target: 40 },
        totalHours: 0,
        categoryEngagement: { Environmental: 0, Social: 0, Governance: 0 }
      });
    }

    // 1. Gender Distribution
    const genderCounts = { Female: 0, Male: 0, Other: 0 };
    participants.forEach(p => {
      if (genderCounts[p.gender] !== undefined) {
        genderCounts[p.gender]++;
      }
    });
    const totalCount = participants.length;
    const genderDistribution = {
      Female: Math.round((genderCounts.Female / totalCount) * 100),
      Male: Math.round((genderCounts.Male / totalCount) * 100),
      Other: Math.round((genderCounts.Other / totalCount) * 100),
    };

    // Adjust rounding issues
    const sum = genderDistribution.Female + genderDistribution.Male + genderDistribution.Other;
    if (sum !== 100 && totalCount > 0) {
      genderDistribution.Male += (100 - sum);
    }

    // 2. Leadership Ethnicity among participants
    const leadershipParticipants = participants.filter(p => p.is_leadership);
    let leadershipUnderrepresented = 0;
    leadershipParticipants.forEach(p => {
      if (p.ethnicity !== 'White') {
        leadershipUnderrepresented++;
      }
    });
    const leadershipEthnicityPct = leadershipParticipants.length > 0 
      ? Math.round((leadershipUnderrepresented / leadershipParticipants.length) * 100)
      : 0;

    // 3. Board Diversity among participants
    const boardParticipants = participants.filter(p => p.is_board);
    let boardDiverse = 0;
    boardParticipants.forEach(p => {
      if (p.gender === 'Female' || p.gender === 'Other' || p.ethnicity !== 'White') {
        boardDiverse++;
      }
    });
    const boardDiversityPct = boardParticipants.length > 0
      ? Math.round((boardDiverse / boardParticipants.length) * 100)
      : 0;

    // 4. Total CSR Volunteer Hours
    let totalHours = 0;
    participants.forEach(p => {
      totalHours += p.hours_spent;
    });

    // 5. Category Engagement
    const categoryCounts = { Environmental: 0, Social: 0, Governance: 0 };
    participants.forEach(p => {
      if (p.category.includes('Environmental')) {
        categoryCounts.Environmental++;
      } else if (p.category.includes('Social') || p.category.includes('Health') || p.category.includes('Education')) {
        categoryCounts.Social++;
      } else if (p.category.includes('Governance')) {
        categoryCounts.Governance++;
      }
    });
    const categoryEngagement = {
      Environmental: Math.round((categoryCounts.Environmental / totalCount) * 100),
      Social: Math.round((categoryCounts.Social / totalCount) * 100),
      Governance: Math.round((categoryCounts.Governance / totalCount) * 100)
    };

    res.json({
      genderDistribution,
      leadershipEthnicity: { actual: leadershipEthnicityPct, target: 35 },
      boardDiversity: { actual: boardDiversityPct, target: 40 },
      totalHours,
      categoryEngagement
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get Training logs and summary compliance hours
app.get('/api/trainings', async (req, res) => {
  try {
    const query = `
      SELECT et.id, e.name AS employee_name, t.name AS training_name, t.required_hours, et.status, et.completion_date
      FROM employee_trainings et
      JOIN employees e ON et.employee_id = e.id
      JOIN trainings t ON et.training_id = t.id
      ORDER BY et.status ASC, et.completion_date DESC
    `;
    const [rows] = await pool.query(query);

    // Calculate total hours completed by company
    const [hoursResult] = await pool.query(`
      SELECT SUM(t.required_hours) AS total_hours
      FROM employee_trainings et
      JOIN trainings t ON et.training_id = t.id
      WHERE et.status = 'Completed'
    `);
    const totalHoursCompleted = hoursResult[0].total_hours || 0;

    res.json({
      logs: rows,
      totalHoursCompleted
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start Express App
app.listen(PORT, () => {
  console.log(`EcoSphere social backend server is running on port ${PORT}`);
});
