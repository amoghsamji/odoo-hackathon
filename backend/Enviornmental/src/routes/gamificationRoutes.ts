import { Router, Request, Response } from 'express';
import { sequelize } from '../config/database';
import { QueryTypes } from 'sequelize';

const router = Router();

// Get Challenges
router.get('/challenges', async (req: Request, res: Response) => {
  try {
    const rows = await sequelize.query('SELECT * FROM challenges ORDER BY created_at DESC', {
      type: QueryTypes.SELECT
    });
    res.json(rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create Challenge
router.post('/challenges', async (req: Request, res: Response) => {
  try {
    const { title, description, xp, difficulty, evidence_required, deadline, status } = req.body;
    if (!title || !description || !xp || !difficulty || !deadline) {
      return res.status(400).json({ error: 'title, description, xp, difficulty, and deadline are required' });
    }

    const [result] = await sequelize.query(
      'INSERT INTO challenges (title, description, xp, difficulty, evidence_required, deadline, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
      {
        replacements: [title, description, xp, difficulty, evidence_required ? 1 : 0, deadline, status || 'Draft'],
        type: QueryTypes.INSERT
      }
    );

    res.status(201).json({ id: result, message: 'Challenge created successfully!' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Join Challenge
router.post('/challenges/:id/join', async (req: Request, res: Response) => {
  try {
    const challengeId = req.params.id;
    const { employeeId } = req.body;
    if (!employeeId) {
      return res.status(400).json({ error: 'employeeId is required' });
    }

    // Check if challenge is Active
    const challenges = await sequelize.query('SELECT status FROM challenges WHERE id = ?', {
      replacements: [challengeId],
      type: QueryTypes.SELECT
    }) as any[];

    if (challenges.length === 0) {
      return res.status(404).json({ error: 'Challenge not found' });
    }
    if (challenges[0].status !== 'Active') {
      return res.status(400).json({ error: 'You can only join active challenges' });
    }

    await sequelize.query(
      'INSERT INTO challenge_participations (challenge_id, employee_id, progress, status) VALUES (?, ?, 0, "Pending") ON DUPLICATE KEY UPDATE progress = 0',
      {
        replacements: [challengeId, employeeId],
        type: QueryTypes.INSERT
      }
    );

    res.json({ message: 'Successfully joined challenge!' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update Challenge Lifecycle Status
router.post('/challenges/:id/update-status', async (req: Request, res: Response) => {
  try {
    const challengeId = req.params.id;
    const { status } = req.body;
    if (!status) {
      return res.status(400).json({ error: 'status is required' });
    }

    await sequelize.query('UPDATE challenges SET status = ? WHERE id = ?', {
      replacements: [status, challengeId],
      type: QueryTypes.UPDATE
    });
    res.json({ message: `Challenge status updated to ${status}.` });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get Active Participations per employee
router.get('/challenges/participation', async (req: Request, res: Response) => {
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
    const rows = await sequelize.query(query, {
      replacements: [employeeId],
      type: QueryTypes.SELECT
    });
    res.json(rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Submit proof & progress for Challenge
router.post('/challenges/participation/:id/submit-proof', async (req: Request, res: Response) => {
  try {
    const participationId = req.params.id;
    const { progress, proof } = req.body;

    const part = await sequelize.query(
      'SELECT c.evidence_required FROM challenge_participations cp JOIN challenges c ON cp.challenge_id = c.id WHERE cp.id = ?',
      { replacements: [participationId], type: QueryTypes.SELECT }
    ) as any[];

    if (part.length === 0) {
      return res.status(404).json({ error: 'Participation record not found' });
    }

    if (part[0].evidence_required && !proof) {
      return res.status(400).json({ error: 'Evidence file / proof notes required for this challenge' });
    }

    // If progress is 100, set status to Under Review
    const newStatus = progress >= 100 ? 'Under Review' : 'Pending';

    await sequelize.query(
      'UPDATE challenge_participations SET progress = ?, proof = ?, status = ? WHERE id = ?',
      {
        replacements: [progress, proof || null, newStatus, participationId],
        type: QueryTypes.UPDATE
      }
    );

    res.json({ message: 'Proof/progress submitted successfully!' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Approve Challenge completion (awards XP and checks badges)
router.post('/challenges/participation/:id/approve', async (req: Request, res: Response) => {
  const transaction = await sequelize.transaction();
  try {
    const participationId = req.params.id;

    // Load participation details
    const parts = await sequelize.query(`
      SELECT cp.*, c.xp, c.title AS challenge_title, e.name AS employee_name
      FROM challenge_participations cp
      JOIN challenges c ON cp.challenge_id = c.id
      JOIN employees e ON cp.employee_id = e.id
      WHERE cp.id = ?
    `, {
      replacements: [participationId],
      type: QueryTypes.SELECT,
      transaction
    }) as any[];

    if (parts.length === 0) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Participation not found' });
    }

    const cp = parts[0];
    if (cp.status === 'Approved') {
      await transaction.rollback();
      return res.status(400).json({ error: 'Already approved' });
    }

    // Award XP and points to employee (points match XP 1:1)
    await sequelize.query(
      'UPDATE employees SET xp = xp + ?, points = points + ? WHERE id = ?',
      {
        replacements: [cp.xp, cp.xp, cp.employee_id],
        type: QueryTypes.UPDATE,
        transaction
      }
    );

    // Update participation status
    await sequelize.query(
      'UPDATE challenge_participations SET status = "Approved", xp_awarded = ?, completion_date = NOW() WHERE id = ?',
      {
        replacements: [cp.xp, participationId],
        type: QueryTypes.UPDATE,
        transaction
      }
    );

    // Trigger Notification for approval
    const notifMsg = `Congratulations! Your completion of "${cp.challenge_title}" was approved. Awarded +${cp.xp} XP / Points.`;
    await sequelize.query(
      'INSERT INTO notifications (type, message) VALUES ("challenge_approval", ?)',
      {
        replacements: [notifMsg],
        type: QueryTypes.INSERT,
        transaction
      }
    );

    // Check & Award Badges
    const badgeMsg = await checkAndAwardBadgesTS(cp.employee_id, transaction);

    await transaction.commit();
    res.json({ message: 'Challenge participation approved successfully!', badgeMessage: badgeMsg });
  } catch (error: any) {
    await transaction.rollback();
    res.status(500).json({ error: error.message });
  }
});

// Helper for Badge Auto-award logic inside Sequelize transactions
async function checkAndAwardBadgesTS(employeeId: number, transaction: any) {
  // Load settings to verify if badge auto-award is enabled
  const settings = await sequelize.query('SELECT setting_value FROM settings WHERE setting_key = "badge_auto_award"', {
    type: QueryTypes.SELECT,
    transaction
  }) as any[];
  const autoAward = settings.length > 0 ? settings[0].setting_value === '1' : true;

  if (!autoAward) return 'Auto-award disabled';

  // Load employee's XP and name
  const employees = await sequelize.query('SELECT xp, name FROM employees WHERE id = ?', {
    replacements: [employeeId],
    type: QueryTypes.SELECT,
    transaction
  }) as any[];
  const employee = employees[0];

  const approvedCountRows = await sequelize.query(
    'SELECT COUNT(id) AS count FROM challenge_participations WHERE employee_id = ? AND status = "Approved"',
    {
      replacements: [employeeId],
      type: QueryTypes.SELECT,
      transaction
    }
  ) as any[];
  const approvedCount = approvedCountRows[0].count;

  // Load all badges
  const badges = await sequelize.query('SELECT * FROM badges', {
    type: QueryTypes.SELECT,
    transaction
  }) as any[];
  let awardedList: string[] = [];

  for (const b of badges) {
    const [ruleType, ruleValStr] = b.unlock_rule.split(':');
    const ruleVal = parseInt(ruleValStr);

    let satisfies = false;
    if (ruleType === 'min_xp' && employee.xp >= ruleVal) {
      satisfies = true;
    } else if (ruleType === 'challenges' && approvedCount >= ruleVal) {
      satisfies = true;
    }

    if (satisfies) {
      try {
        const [, affected] = await sequelize.query(
          'INSERT INTO employee_badges (employee_id, badge_id) VALUES (?, ?)',
          {
            replacements: [employeeId, b.id],
            type: QueryTypes.INSERT,
            transaction
          }
        ) as any;
        
        awardedList.push(b.name);
        // Raise Notification
        const notifMsg = `Milestone unlocked: ${employee.name} earned the "${b.name}" badge!`;
        await sequelize.query(
          'INSERT INTO notifications (type, message) VALUES ("badge_unlock", ?)',
          {
            replacements: [notifMsg],
            type: QueryTypes.INSERT,
            transaction
          }
        );
      } catch (err) {
        // Already earned
      }
    }
  }

  return awardedList.length > 0 ? `Unlocked badges: ${awardedList.join(', ')}` : 'No new badges unlocked';
}

// Get Badges Catalog & Employee unlocked statuses
router.get('/badges', async (req: Request, res: Response) => {
  try {
    const { employeeId } = req.query;
    const badges = await sequelize.query('SELECT * FROM badges', { type: QueryTypes.SELECT }) as any[];
    
    if (!employeeId) {
      return res.json(badges.map(b => ({ ...b, unlocked: false })));
    }

    const unlockedRows = await sequelize.query(
      'SELECT badge_id FROM employee_badges WHERE employee_id = ?',
      {
        replacements: [employeeId],
        type: QueryTypes.SELECT
      }
    ) as any[];
    const unlockedIds = unlockedRows.map(u => u.badge_id);

    const formatted = badges.map(b => ({
      ...b,
      unlocked: unlockedIds.includes(b.id)
    }));

    res.json(formatted);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get Rewards Catalog
router.get('/rewards', async (req: Request, res: Response) => {
  try {
    const rows = await sequelize.query('SELECT * FROM rewards WHERE status = "Active"', {
      type: QueryTypes.SELECT
    });
    res.json(rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Redeem Reward (deducts points balance)
router.post('/rewards/:id/redeem', async (req: Request, res: Response) => {
  const transaction = await sequelize.transaction();
  try {
    const rewardId = req.params.id;
    const { employeeId } = req.body;

    if (!employeeId) {
      await transaction.rollback();
      return res.status(400).json({ error: 'employeeId is required' });
    }

    // Load reward stock and points required
    const rewards = await sequelize.query('SELECT points_required, stock, name FROM rewards WHERE id = ? AND status = "Active"', {
      replacements: [rewardId],
      type: QueryTypes.SELECT,
      transaction
    }) as any[];

    if (rewards.length === 0) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Reward not found or inactive' });
    }

    const rw = rewards[0];
    if (rw.stock <= 0) {
      await transaction.rollback();
      return res.status(400).json({ error: 'This reward is currently out of stock' });
    }

    // Check employee points balance
    const employees = await sequelize.query('SELECT points, name FROM employees WHERE id = ?', {
      replacements: [employeeId],
      type: QueryTypes.SELECT,
      transaction
    }) as any[];

    if (employees.length === 0) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Employee not found' });
    }

    const emp = employees[0];
    if (emp.points < rw.points_required) {
      await transaction.rollback();
      return res.status(400).json({ error: `Insufficient points balance. Required: ${rw.points_required}, Balance: ${emp.points}` });
    }

    // Deduct points
    await sequelize.query(
      'UPDATE employees SET points = points - ? WHERE id = ?',
      {
        replacements: [rw.points_required, employeeId],
        type: QueryTypes.UPDATE,
        transaction
      }
    );

    // Update stock
    await sequelize.query(
      'UPDATE rewards SET stock = stock - 1 WHERE id = ?',
      {
        replacements: [rewardId],
        type: QueryTypes.UPDATE,
        transaction
      }
    );

    // Log redemption
    await sequelize.query(
      'INSERT INTO redemptions (employee_id, reward_id) VALUES (?, ?)',
      {
        replacements: [employeeId, rewardId],
        type: QueryTypes.INSERT,
        transaction
      }
    );

    // Raise Notification
    const notifMsg = `Reward redeemed: ${emp.name} redeemed "${rw.name}" for ${rw.points_required} points.`;
    await sequelize.query(
      'INSERT INTO notifications (type, message) VALUES ("reward_redemption", ?)',
      {
        replacements: [notifMsg],
        type: QueryTypes.INSERT,
        transaction
      }
    );

    await transaction.commit();
    res.json({ message: `Successfully redeemed ${rw.name}! Deducted ${rw.points_required} points.`, remainingPoints: emp.points - rw.points_required });
  } catch (error: any) {
    await transaction.rollback();
    res.status(500).json({ error: error.message });
  }
});

// Leaderboard Ranking API
router.get('/leaderboard', async (req: Request, res: Response) => {
  try {
    const employees = await sequelize.query(`
      SELECT e.id, e.name, e.xp, e.points, d.name AS department_name
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
      ORDER BY e.xp DESC, e.name ASC
    `, { type: QueryTypes.SELECT });

    const departments = await sequelize.query(`
      SELECT d.id, d.name AS department_name, SUM(e.xp) AS total_xp
      FROM employees e
      JOIN departments d ON e.department_id = d.id
      GROUP BY d.id
      ORDER BY total_xp DESC
    `, { type: QueryTypes.SELECT });

    res.json({
      employees,
      departments
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Gamification Module Report Builder Endpoint
router.get('/gamification/report', async (req: Request, res: Response) => {
  try {
    const { departmentId, startDate, endDate } = req.query;
    
    let whereClause = '';
    const replacements: any[] = [];
    
    if (departmentId) {
      whereClause += ' AND e.department_id = ?';
      replacements.push(departmentId);
    }
    
    let query = `
      SELECT cp.*, c.title AS challenge_title, c.difficulty, e.name AS employee_name, d.name AS department_name
      FROM challenge_participations cp
      JOIN challenges c ON cp.challenge_id = c.id
      JOIN employees e ON cp.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE 1=1 ${whereClause}
    `;

    if (startDate) {
      query += ' AND cp.completion_date >= ?';
      replacements.push(startDate);
    }
    if (endDate) {
      query += ' AND cp.completion_date <= ?';
      replacements.push(endDate);
    }
    
    query += ' ORDER BY cp.completion_date DESC, cp.id DESC';
    
    const participations = await sequelize.query(query, {
      replacements,
      type: QueryTypes.SELECT
    }) as any[];
    
    const approved = participations.filter(p => p.status === 'Approved');
    const totalPoints = approved.reduce((acc, p) => acc + (p.xp_awarded || 0), 0);
    const recordCount = participations.length;
    
    res.json({
      summary: {
        recordCount,
        totalPoints,
        pendingCount: participations.filter(p => p.status === 'Pending').length,
        approvedCount: approved.length
      },
      data: participations
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
