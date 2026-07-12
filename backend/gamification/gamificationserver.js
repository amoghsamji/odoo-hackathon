const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5003;

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

// 1. Get Challenges
app.get('/api/challenges', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM challenges ORDER BY created_at DESC');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 2. Create Challenge
app.post('/api/challenges', async (req, res) => {
  try {
    const { title, description, xp, difficulty, evidence_required, deadline, status } = req.body;
    if (!title || !description || !xp || !difficulty || !deadline) {
      return res.status(400).json({ error: 'title, description, xp, difficulty, and deadline are required' });
    }

    const [result] = await pool.query(
      'INSERT INTO challenges (title, description, xp, difficulty, evidence_required, deadline, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [title, description, xp, difficulty, evidence_required ? 1 : 0, deadline, status || 'Draft']
    );

    res.status(201).json({ id: result.insertId, message: 'Challenge created successfully!' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 3. Join Challenge
app.post('/api/challenges/:id/join', async (req, res) => {
  try {
    const challengeId = req.params.id;
    const { employeeId } = req.body;
    if (!employeeId) {
      return res.status(400).json({ error: 'employeeId is required' });
    }

    // Check if challenge is Active
    const [challenges] = await pool.query('SELECT status FROM challenges WHERE id = ?', [challengeId]);
    if (challenges.length === 0) {
      return res.status(444).json({ error: 'Challenge not found' });
    }
    if (challenges[0].status !== 'Active') {
      return res.status(400).json({ error: 'You can only join active challenges' });
    }

    await pool.query(
      'INSERT INTO challenge_participations (challenge_id, employee_id, progress, status) VALUES (?, ?, 0, "Pending") ON DUPLICATE KEY UPDATE progress = 0',
      [challengeId, employeeId]
    );

    res.json({ message: 'Successfully joined challenge!' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 4. Update Challenge Lifecycle Status
app.post('/api/challenges/:id/update-status', async (req, res) => {
  try {
    const challengeId = req.params.id;
    const { status } = req.body;
    if (!status) {
      return res.status(400).json({ error: 'status is required' });
    }

    await pool.query('UPDATE challenges SET status = ? WHERE id = ?', [status, challengeId]);
    res.json({ message: `Challenge status updated to ${status}.` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 5. Get Active Participations per employee
app.get('/api/challenges/participation', async (req, res) => {
  try {
    const { employeeId } = req.query;
    if (!employeeId) {
      return res.status(400).json({ error: 'employeeId query param is required' });
    }

    const query = `
      SELECT cp.*, c.title, c.description, c.xp, c.difficulty, c.evidence_required, c.deadline
      FROM challenge_participations cp
      JOIN challenges c ON cp.challenge_id = c.id
      WHERE cp.employee_id = ?
    `;
    const [rows] = await pool.query(query, [employeeId]);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 6. Submit proof & progress for Challenge
app.post('/api/challenges/participation/:id/submit-proof', async (req, res) => {
  try {
    const participationId = req.params.id;
    const { progress, proof } = req.body;

    const [part] = await pool.query('SELECT c.evidence_required FROM challenge_participations cp JOIN challenges c ON cp.challenge_id = c.id WHERE cp.id = ?', [participationId]);
    if (part.length === 0) {
      return res.status(404).json({ error: 'Participation record not found' });
    }

    if (part[0].evidence_required && !proof) {
      return res.status(400).json({ error: 'Evidence file / proof notes required for this challenge' });
    }

    // If progress is 100, set status to Under Review
    const newStatus = progress >= 100 ? 'Under Review' : 'Pending';

    await pool.query(
      'UPDATE challenge_participations SET progress = ?, proof = ?, status = ? WHERE id = ?',
      [progress, proof || null, newStatus, participationId]
    );

    res.json({ message: 'Proof/progress submitted successfully!' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 7. Approve Challenge completion (awards XP and checks badges)
app.post('/api/challenges/participation/:id/approve', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const participationId = req.params.id;

    // Load participation details
    const [parts] = await connection.query(`
      SELECT cp.*, c.xp, c.title AS challenge_title, e.name AS employee_name
      FROM challenge_participations cp
      JOIN challenges c ON cp.challenge_id = c.id
      JOIN employees e ON cp.employee_id = e.id
      WHERE cp.id = ?
    `, [participationId]);

    if (parts.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Participation not found' });
    }

    const cp = parts[0];
    if (cp.status === 'Approved') {
      await connection.rollback();
      return res.status(400).json({ error: 'Already approved' });
    }

    // Award XP and points to employee
    // XP is awarded, and points are awarded 1:1 with XP
    await connection.query(
      'UPDATE employees SET xp = xp + ?, points = points + ? WHERE id = ?',
      [cp.xp, cp.xp, cp.employee_id]
    );

    // Update participation status
    await connection.query(
      'UPDATE challenge_participations SET status = "Approved", xp_awarded = ?, completion_date = NOW() WHERE id = ?',
      [cp.xp, participationId]
    );

    // Trigger Notification for approval
    const notifMsg = `Congratulations! Your completion of "${cp.challenge_title}" was approved. Awarded +${cp.xp} XP / Points.`;
    await connection.query(
      'INSERT INTO notifications (type, message) VALUES ("challenge_approval", ?)',
      [notifMsg]
    );

    // Check & Award Badges
    const badgeMsg = await checkAndAwardBadges(connection, cp.employee_id);

    await connection.commit();
    res.json({ message: 'Challenge participation approved successfully!', badgeMessage: badgeMsg });
  } catch (error) {
    await connection.rollback();
    res.status(500).json({ error: error.message });
  } finally {
    connection.release();
  }
});

// Helper for Badge Auto-award logic
async function checkAndAwardBadges(connection, employeeId) {
  // Load settings to verify if badge auto-award is enabled
  const [settings] = await connection.query('SELECT setting_value FROM settings WHERE setting_key = "badge_auto_award"');
  const autoAward = settings.length > 0 ? settings[0].setting_value === '1' : true; // default true if not set

  if (!autoAward) return 'Auto-award disabled';

  // Load employee's XP and approved challenges count
  const [employees] = await connection.query('SELECT xp, name FROM employees WHERE id = ?', [employeeId]);
  const employee = employees[0];

  const [approvedCountRows] = await connection.query(
    'SELECT COUNT(id) AS count FROM challenge_participations WHERE employee_id = ? AND status = "Approved"',
    [employeeId]
  );
  const approvedCount = approvedCountRows[0].count;

  // Load all badges
  const [badges] = await connection.query('SELECT * FROM badges');
  let awardedList = [];

  for (const b of badges) {
    // Parse unlock rule: e.g. min_xp:500 or challenges:2
    const [ruleType, ruleValStr] = b.unlock_rule.split(':');
    const ruleVal = parseInt(ruleValStr);

    let satisfies = false;
    if (ruleType === 'min_xp' && employee.xp >= ruleVal) {
      satisfies = true;
    } else if (ruleType === 'challenges' && approvedCount >= ruleVal) {
      satisfies = true;
    }

    if (satisfies) {
      // Try to insert (Unique constraint will prevent duplicates)
      try {
        const [res] = await connection.query(
          'INSERT INTO employee_badges (employee_id, badge_id) VALUES (?, ?)',
          [employeeId, b.id]
        );
        if (res.affectedRows > 0) {
          awardedList.push(b.name);
          // Raise Notification
          const notifMsg = `Milestone unlocked: ${employee.name} earned the "${b.name}" badge!`;
          await connection.query(
            'INSERT INTO notifications (type, message) VALUES ("badge_unlock", ?)',
            [notifMsg]
          );
        }
      } catch (err) {
        // Already earned
      }
    }
  }

  return awardedList.length > 0 ? `Unlocked badges: ${awardedList.join(', ')}` : 'No new badges unlocked';
}

// 8. Get Badges Catalog & Employee unlocked statuses
app.get('/api/badges', async (req, res) => {
  try {
    const { employeeId } = req.query;
    const [badges] = await pool.query('SELECT * FROM badges');
    
    if (!employeeId) {
      return res.json(badges.map(b => ({ ...b, unlocked: false })));
    }

    const [unlockedRows] = await pool.query(
      'SELECT badge_id FROM employee_badges WHERE employee_id = ?',
      [employeeId]
    );
    const unlockedIds = unlockedRows.map(u => u.badge_id);

    const formatted = badges.map(b => ({
      ...b,
      unlocked: unlockedIds.includes(b.id)
    }));

    res.json(formatted);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 9. Get Rewards Catalog
app.get('/api/rewards', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM rewards WHERE status = "Active"');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 10. Redeem Reward (deducts points balance)
app.post('/api/rewards/:id/redeem', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const rewardId = req.params.id;
    const { employeeId } = req.body;

    if (!employeeId) {
      await connection.rollback();
      return res.status(400).json({ error: 'employeeId is required' });
    }

    // Load reward stock and points required
    const [rewards] = await connection.query('SELECT points_required, stock, name FROM rewards WHERE id = ? AND status = "Active"', [rewardId]);
    if (rewards.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Reward not found or inactive' });
    }

    const rw = rewards[0];
    if (rw.stock <= 0) {
      await connection.rollback();
      return res.status(400).json({ error: 'This reward is currently out of stock' });
    }

    // Check employee points balance
    const [employees] = await connection.query('SELECT points, name FROM employees WHERE id = ?', [employeeId]);
    if (employees.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Employee not found' });
    }

    const emp = employees[0];
    if (emp.points < rw.points_required) {
      await connection.rollback();
      return res.status(400).json({ error: `Insufficient points balance. Required: ${rw.points_required}, Balance: ${emp.points}` });
    }

    // Deduct points
    await connection.query(
      'UPDATE employees SET points = points - ? WHERE id = ?',
      [rw.points_required, employeeId]
    );

    // Update stock
    await connection.query(
      'UPDATE rewards SET stock = stock - 1 WHERE id = ?',
      [rewardId]
    );

    // Log redemption
    await connection.query(
      'INSERT INTO redemptions (employee_id, reward_id) VALUES (?, ?)',
      [employeeId, rewardId]
    );

    // Raise Notification
    const notifMsg = `Reward redeemed: ${emp.name} redeemed "${rw.name}" for ${rw.points_required} points.`;
    await connection.query(
      'INSERT INTO notifications (type, message) VALUES ("reward_redemption", ?)',
      [notifMsg]
    );

    await connection.commit();
    res.json({ message: `Successfully redeemed ${rw.name}! Deducted ${rw.points_required} points.`, remainingPoints: emp.points - rw.points_required });
  } catch (error) {
    await connection.rollback();
    res.status(500).json({ error: error.message });
  } finally {
    connection.release();
  }
});

// 11. Leaderboard Ranking API
app.get('/api/leaderboard', async (req, res) => {
  try {
    // 1. Employee rank
    const [employees] = await pool.query(`
      SELECT e.id, e.name, e.xp, e.points, d.name AS department_name
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
      ORDER BY e.xp DESC, e.name ASC
    `);

    // 2. Department Rank based on average XP or summed XP
    const [departments] = await pool.query(`
      SELECT d.id, d.name AS department_name, SUM(e.xp) AS total_xp
      FROM employees e
      JOIN departments d ON e.department_id = d.id
      GROUP BY d.id
      ORDER BY total_xp DESC
    `);

    res.json({
      employees,
      departments
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`EcoSphere gamification backend server is running on port ${PORT}`);
});
