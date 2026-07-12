import { Router, Request, Response } from 'express';
import { sequelize } from '../config/database';
import { QueryTypes } from 'sequelize';

const router = Router();

// Settings Endpoints
router.get('/settings', async (req: Request, res: Response) => {
  try {
    const rows = await sequelize.query('SELECT * FROM settings', { type: QueryTypes.SELECT }) as any[];
    const settings: any = {};
    rows.forEach(r => {
      settings[r.setting_key] = r.setting_value === '1';
    });
    res.json(settings);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/settings', async (req: Request, res: Response) => {
  try {
    const settings = req.body;
    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({ error: 'Settings object is required' });
    }

    for (const [key, value] of Object.entries(settings)) {
      const val = value ? '1' : '0';
      await sequelize.query(
        'INSERT INTO settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = ?',
        {
          replacements: [key, val, val],
          type: QueryTypes.INSERT
        }
      );
    }
    res.json({ message: 'Settings updated successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get Categories list
router.get('/categories', async (req: Request, res: Response) => {
  try {
    const csrCats = await sequelize.query('SELECT DISTINCT category FROM csr_activities', { type: QueryTypes.SELECT }) as any[];
    const categories = csrCats.map((c, i) => ({
      name: c.category,
      code: `CAT-S${i+1}`,
      type: 'Social',
      description: `CSR activities relating to ${c.category.toLowerCase()}`
    }));
    
    // Include Environmental categories
    categories.unshift(
      { name: 'Fleet', code: 'ENV-FL', type: 'Environmental', description: 'Vehicular fuel and logistics emissions' },
      { name: 'Manufacturing', code: 'ENV-MF', type: 'Environmental', description: 'Grid electricity and factory fuel consumption' },
      { name: 'Purchase', code: 'ENV-PR', type: 'Environmental', description: 'Product and office material purchases' },
      { name: 'Expense', code: 'ENV-EX', type: 'Environmental', description: 'Business travel and general expenses' }
    );
    
    res.json(categories);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get all Employees (for the dropdown selection)
router.get('/employees', async (req: Request, res: Response) => {
  try {
    const rows = await sequelize.query('SELECT id, name, email FROM employees', { type: QueryTypes.SELECT });
    res.json(rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get CSR Activities (with optional search and prerequisite info)
router.get('/activities', async (req: Request, res: Response) => {
  try {
    const { search } = req.query;
    let query = `
      SELECT a.*, t.name AS prerequisite_name 
      FROM csr_activities a 
      LEFT JOIN trainings t ON a.prerequisite_training_id = t.id
    `;
    let replacements: any[] = [];

    if (search) {
      query += ' WHERE a.name LIKE ? OR a.description LIKE ? OR a.category LIKE ?';
      const searchWildcard = `%${search}%`;
      replacements = [searchWildcard, searchWildcard, searchWildcard];
    }

    const rows = await sequelize.query(query, {
      replacements,
      type: QueryTypes.SELECT
    });
    res.json(rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Add New CSR Activity
router.post('/activities', async (req: Request, res: Response) => {
  try {
    const { name, category, description, points, icon, prerequisite_training_id } = req.body;
    if (!name || !category || !description || !points || !icon) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const prereqId = prerequisite_training_id ? parseInt(prerequisite_training_id) : null;

    const [result] = await sequelize.query(
      'INSERT INTO csr_activities (name, category, description, points, icon, prerequisite_training_id) VALUES (?, ?, ?, ?, ?, ?)',
      {
        replacements: [name, category, description, parseInt(points), icon, prereqId],
        type: QueryTypes.INSERT
      }
    );

    res.status(201).json({ id: result, name, category, description, points, icon });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Join/Register Participation
router.post('/activities/:id/join', async (req: Request, res: Response) => {
  try {
    const activityId = req.params.id;
    const { employeeId, proof, hoursSpent, notes } = req.body;

    if (!employeeId) {
      return res.status(400).json({ error: 'Employee is required to join an activity.' });
    }

    // 1. Fetch Activity Details & Prerequisite ID
    const activities = await sequelize.query(
      'SELECT points, prerequisite_training_id, name FROM csr_activities WHERE id = ?',
      {
        replacements: [activityId],
        type: QueryTypes.SELECT
      }
    ) as any[];

    if (activities.length === 0) {
      return res.status(404).json({ error: 'Activity not found' });
    }
    const activity = activities[0];

    // 2. Enforce Prerequisite Check
    if (activity.prerequisite_training_id) {
      const trainings = await sequelize.query(
        'SELECT status FROM employee_trainings WHERE employee_id = ? AND training_id = ? AND status = "Completed"',
        {
          replacements: [employeeId, activity.prerequisite_training_id],
          type: QueryTypes.SELECT
        }
      ) as any[];

      if (trainings.length === 0) {
        return res.status(400).json({
          error: `Prerequisite Violation: You must complete the required compliance training before joining "${activity.name}".`
        });
      }
    }

    // 3. Enforce Evidence Check (On submission/Join if toggle is active)
    const settings = await sequelize.query(
      'SELECT setting_value FROM settings WHERE setting_key = "evidence_requirement"',
      { type: QueryTypes.SELECT }
    ) as any[];
    const evidenceRequired = settings.length > 0 && settings[0].setting_value === '1';

    if (evidenceRequired && (!proof || proof.trim() === '')) {
      return res.status(400).json({
        error: 'Evidence Required: You cannot submit a CSR participation request without attaching proof.'
      });
    }

    // 4. Check Duplicate Join
    const existing = await sequelize.query(
      'SELECT id FROM employee_participations WHERE employee_id = ? AND activity_id = ? AND status != "Rejected"',
      {
        replacements: [employeeId, activityId],
        type: QueryTypes.SELECT
      }
    ) as any[];

    if (existing.length > 0) {
      return res.status(400).json({ error: 'You have already submitted a request for this activity.' });
    }

    // 5. Insert Record
    await sequelize.query(
      'INSERT INTO employee_participations (employee_id, activity_id, proof, status, points, hours_spent, employee_notes) VALUES (?, ?, ?, "Pending", ?, ?, ?)',
      {
        replacements: [employeeId, activityId, proof || null, activity.points, parseInt(hoursSpent) || 0, notes || null],
        type: QueryTypes.INSERT
      }
    );

    res.status(201).json({ message: 'Participation request submitted successfully!' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get Participation queue
router.get('/participations', async (req: Request, res: Response) => {
  try {
    const query = `
      SELECT ep.id, e.name AS employee_name, a.name AS activity_name, ep.proof, ep.points, ep.status, ep.hours_spent, ep.employee_notes
      FROM employee_participations ep
      JOIN employees e ON ep.employee_id = e.id
      JOIN csr_activities a ON ep.activity_id = a.id
      ORDER BY ep.status DESC, ep.completion_date DESC
    `;
    const rows = await sequelize.query(query, { type: QueryTypes.SELECT });
    res.json(rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Approve Participation
router.post('/participations/:id/approve', async (req: Request, res: Response) => {
  const transaction = await sequelize.transaction();
  try {
    const participationId = req.params.id;

    // Fetch participation details
    const participations = await sequelize.query(
      'SELECT employee_id, points, status, proof FROM employee_participations WHERE id = ?',
      {
        replacements: [participationId],
        type: QueryTypes.SELECT,
        transaction
      }
    ) as any[];

    if (participations.length === 0) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Participation claim not found' });
    }

    const claim = participations[0];
    if (claim.status === 'Approved') {
      await transaction.rollback();
      return res.status(400).json({ error: 'Claim is already approved' });
    }

    // Check Business Rule: Evidence Requirement
    const settings = await sequelize.query(
      'SELECT setting_value FROM settings WHERE setting_key = "evidence_requirement"',
      { type: QueryTypes.SELECT, transaction }
    ) as any[];
    const evidenceRequired = settings.length > 0 && settings[0].setting_value === '1';

    if (evidenceRequired && (!claim.proof || claim.proof.trim() === '' || claim.proof === 'None')) {
      await transaction.rollback();
      return res.status(400).json({ error: 'Business Rule Violation: CSR Activity participation cannot be approved without proof evidence.' });
    }

    // Update participation status
    await sequelize.query(
      'UPDATE employee_participations SET status = "Approved" WHERE id = ?',
      {
        replacements: [participationId],
        type: QueryTypes.UPDATE,
        transaction
      }
    );

    // Credit points to employee
    await sequelize.query(
      'UPDATE employees SET points = points + ? WHERE id = ?',
      {
        replacements: [claim.points, claim.employee_id],
        type: QueryTypes.UPDATE,
        transaction
      }
    );

    await transaction.commit();
    res.json({ message: 'Claim approved successfully and points awarded!' });
  } catch (error: any) {
    await transaction.rollback();
    res.status(500).json({ error: error.message });
  }
});

// Reject Participation
router.post('/participations/:id/reject', async (req: Request, res: Response) => {
  try {
    const participationId = req.params.id;
    const [, metadata] = await sequelize.query(
      'UPDATE employee_participations SET status = "Rejected" WHERE id = ? AND status = "Pending"',
      {
        replacements: [participationId],
        type: QueryTypes.UPDATE
      }
    ) as any;

    if (metadata.affectedRows === 0) {
      return res.status(404).json({ error: 'Pending participation claim not found or already processed' });
    }

    res.json({ message: 'Claim rejected successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get Diversity Metrics based on APPROVED CSR PARTICIPATIONS
router.get('/diversity-metrics', async (req: Request, res: Response) => {
  try {
    const query = `
      SELECT e.gender, e.ethnicity, e.is_leadership, e.is_board, ep.hours_spent, a.category
      FROM employee_participations ep
      JOIN employees e ON ep.employee_id = e.id
      JOIN csr_activities a ON ep.activity_id = a.id
      WHERE ep.status = 'Approved'
    `;
    const participants = await sequelize.query(query, { type: QueryTypes.SELECT }) as any[];

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
    const genderCounts: any = { Female: 0, Male: 0, Other: 0 };
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
    const categoryCounts: any = { Environmental: 0, Social: 0, Governance: 0 };
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
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get Training logs and summary compliance hours
router.get('/trainings', async (req: Request, res: Response) => {
  try {
    const query = `
      SELECT et.id, e.name AS employee_name, t.name AS training_name, t.required_hours, et.status, et.completion_date
      FROM employee_trainings et
      JOIN employees e ON et.employee_id = e.id
      JOIN trainings t ON et.training_id = t.id
      ORDER BY et.status ASC, et.completion_date DESC
    `;
    const logs = await sequelize.query(query, { type: QueryTypes.SELECT });

    // Calculate total hours completed by company
    const hoursResult = await sequelize.query(`
      SELECT SUM(t.required_hours) AS total_hours
      FROM employee_trainings et
      JOIN trainings t ON et.training_id = t.id
      WHERE et.status = 'Completed'
    `, { type: QueryTypes.SELECT }) as any[];
    const totalHoursCompleted = hoursResult.length > 0 ? (hoursResult[0].total_hours || 0) : 0;

    res.json({
      logs,
      totalHoursCompleted
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Social Custom Report Builder endpoint
router.get('/social/report', async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, departmentId } = req.query;

    let query = `
      SELECT ep.id, ep.completion_date, ep.hours_spent, ep.points, ep.status, ep.proof,
             e.name AS employee_name, a.name AS activity_name, d.name AS department_name
      FROM employee_participations ep
      JOIN employees e ON ep.employee_id = e.id
      JOIN csr_activities a ON ep.activity_id = a.id
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE 1=1
    `;
    const replacements: any[] = [];

    if (startDate) {
      query += ' AND ep.completion_date >= ?';
      replacements.push(startDate);
    }
    if (endDate) {
      query += ' AND ep.completion_date <= ?';
      replacements.push(endDate + ' 23:59:59');
    }
    if (departmentId) {
      query += ' AND e.department_id = ?';
      replacements.push(departmentId);
    }

    query += ' ORDER BY ep.completion_date DESC';

    const data = await sequelize.query(query, {
      replacements,
      type: QueryTypes.SELECT
    }) as any[];

    // Calculate totals
    let totalHours = 0;
    let totalPoints = 0;
    data.forEach(item => {
      totalHours += item.hours_spent || 0;
      if (item.status === 'Approved') {
        totalPoints += item.points || 0;
      }
    });

    res.json({
      summary: {
        recordCount: data.length,
        totalHours,
        totalPoints
      },
      data
    });

  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
