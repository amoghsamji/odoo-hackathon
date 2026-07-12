import { Router, Request, Response } from 'express';
import { sequelize } from '../config/database';
import { QueryTypes } from 'sequelize';

const router = Router();

// Get Policies & compliance rates
router.get('/policies', async (req: Request, res: Response) => {
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
    const rows = await sequelize.query(query, { type: QueryTypes.SELECT }) as any[];

    const formatted = rows.map(r => {
      const pct = r.total_assigned > 0 ? Math.round((r.total_acknowledged / r.total_assigned) * 100) : 100;
      return {
        ...r,
        acknowledgement_rate: pct,
        compliance_status: pct >= 80 ? 'Compliant' : 'Non-Compliant'
      };
    });

    res.json(formatted);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create Policy
router.post('/policies', async (req: Request, res: Response) => {
  const transaction = await sequelize.transaction();
  try {
    const { title, description, owner_name, effective_date } = req.body;
    if (!title || !description || !owner_name || !effective_date) {
      await transaction.rollback();
      return res.status(400).json({ error: 'All fields are required' });
    }

    const [result] = await sequelize.query(
      'INSERT INTO esg_policies (title, description, owner_name, effective_date, status) VALUES (?, ?, ?, ?, "Active")',
      {
        replacements: [title, description, owner_name, effective_date],
        type: QueryTypes.INSERT,
        transaction
      }
    ) as any;

    const policyId = result;

    // Create Pending acknowledgements for all existing employees
    const employees = await sequelize.query('SELECT id FROM employees', {
      type: QueryTypes.SELECT,
      transaction
    }) as any[];

    for (const emp of employees) {
      await sequelize.query(
        'INSERT INTO policy_acknowledgements (policy_id, employee_id, status) VALUES (?, ?, "Pending")',
        {
          replacements: [policyId, emp.id],
          type: QueryTypes.INSERT,
          transaction
        }
      );
    }

    // Trigger Notification Systems
    const notifMsg = `New governance policy published: "${title}". Acknowledging mandatory.`;
    await sequelize.query(
      'INSERT INTO notifications (type, message) VALUES ("policy_acknowledgement_reminder", ?)',
      {
        replacements: [notifMsg],
        type: QueryTypes.INSERT,
        transaction
      }
    );

    await transaction.commit();
    res.status(201).json({ id: policyId, message: 'Policy created and assigned successfully!' });
  } catch (error: any) {
    await transaction.rollback();
    res.status(500).json({ error: error.message });
  }
});

// Get Acknowledgments rates per department and details
router.get('/acknowledgements', async (req: Request, res: Response) => {
  try {
    const query = `
      SELECT pa.id, p.title AS policy_title, e.name AS employee_name, e.department_id, pa.status, pa.acknowledged_at
      FROM policy_acknowledgements pa
      JOIN esg_policies p ON pa.policy_id = p.id
      JOIN employees e ON pa.employee_id = e.id
      ORDER BY pa.status ASC, pa.acknowledged_at DESC
    `;
    const details = await sequelize.query(query, { type: QueryTypes.SELECT });

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
    const deptRows = await sequelize.query(deptQuery, { type: QueryTypes.SELECT }) as any[];

    const departmentRates = deptRows.map(dr => {
      const pct = dr.total > 0 ? Math.round((dr.acknowledged / dr.total) * 100) : 100;
      return {
        department_id: dr.department_id,
        department_name: dr.department_name || 'Global / Other',
        rate: pct
      };
    });

    res.json({
      details,
      departmentRates
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Acknowledge policy sign-off
router.post('/acknowledgements/sign', async (req: Request, res: Response) => {
  try {
    const { policyId, employeeId } = req.body;
    if (!policyId || !employeeId) {
      return res.status(400).json({ error: 'policyId and employeeId are required' });
    }

    const [, metadata] = await sequelize.query(
      'UPDATE policy_acknowledgements SET status = "Acknowledged", acknowledged_at = NOW() WHERE policy_id = ? AND employee_id = ? AND status = "Pending"',
      {
        replacements: [policyId, employeeId],
        type: QueryTypes.UPDATE
      }
    ) as any;

    if (metadata.affectedRows === 0) {
      return res.status(400).json({ error: 'Policy already acknowledged or record not found.' });
    }

    res.json({ message: 'Policy successfully signed off and acknowledged!' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get Audits
router.get('/audits', async (req: Request, res: Response) => {
  try {
    const rows = await sequelize.query('SELECT * FROM audits ORDER BY audit_date DESC', { type: QueryTypes.SELECT });
    res.json(rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create Audit
router.post('/audits', async (req: Request, res: Response) => {
  try {
    const { title, auditor, audit_date, status } = req.body;
    if (!title || !auditor || !audit_date || !status) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const [result] = await sequelize.query(
      'INSERT INTO audits (title, auditor, audit_date, status) VALUES (?, ?, ?, ?)',
      {
        replacements: [title, auditor, audit_date, status],
        type: QueryTypes.INSERT
      }
    );

    res.status(201).json({ id: result, title, auditor, audit_date, status });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get Compliance Issues (including auto-flagging overdue open issues)
router.get('/issues', async (req: Request, res: Response) => {
  const transaction = await sequelize.transaction();
  try {
    // Find open compliance issues where due_date has passed, and auto-flag them
    const overdue = await sequelize.query(
      'SELECT id, description, owner_name FROM compliance_issues WHERE status = "Open" AND due_date < CURDATE()',
      { type: QueryTypes.SELECT, transaction }
    ) as any[];

    for (const issue of overdue) {
      await sequelize.query('UPDATE compliance_issues SET status = "Flagged" WHERE id = ?', {
        replacements: [issue.id],
        type: QueryTypes.UPDATE,
        transaction
      });
      
      // Trigger Notification Systems
      const notifMsg = `Compliance Warning: Issue "${issue.description}" is overdue. Assigned owner: ${issue.owner_name}.`;
      await sequelize.query(
        'INSERT INTO notifications (type, message) VALUES ("compliance_issue_overdue", ?)',
        {
          replacements: [notifMsg],
          type: QueryTypes.INSERT,
          transaction
        }
      );
    }

    await transaction.commit();

    const rows = await sequelize.query(`
      SELECT ci.*, a.title AS audit_title
      FROM compliance_issues ci
      LEFT JOIN audits a ON ci.audit_id = a.id
      ORDER BY FIELD(ci.status, 'Flagged', 'Open', 'Resolved'), ci.due_date ASC
    `, { type: QueryTypes.SELECT });

    res.json(rows);
  } catch (error: any) {
    await transaction.rollback();
    res.status(500).json({ error: error.message });
  }
});

// Create Compliance Issue
router.post('/issues', async (req: Request, res: Response) => {
  try {
    const { audit_id, description, severity, owner_name, due_date } = req.body;
    if (!description || !severity || !owner_name || !due_date) {
      return res.status(400).json({ error: 'description, severity, owner_name and due_date are required' });
    }

    const auditIdVal = audit_id ? parseInt(audit_id) : null;

    const [result] = await sequelize.query(
      'INSERT INTO compliance_issues (audit_id, description, severity, owner_name, due_date, status) VALUES (?, ?, ?, ?, ?, "Open")',
      {
        replacements: [auditIdVal, description, severity, owner_name, due_date],
        type: QueryTypes.INSERT
      }
    );

    // Trigger Notification
    const notifMsg = `New compliance issue raised: "${description}". Severity: ${severity}. Owner: ${owner_name}.`;
    await sequelize.query(
      'INSERT INTO notifications (type, message) VALUES ("compliance_issue_raised", ?)',
      {
        replacements: [notifMsg],
        type: QueryTypes.INSERT
      }
    );

    res.status(201).json({ id: result, message: 'Compliance issue created successfully!' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Resolve Compliance Issue
router.post('/issues/:id/resolve', async (req: Request, res: Response) => {
  try {
    const issueId = req.params.id;
    const [, metadata] = await sequelize.query(
      'UPDATE compliance_issues SET status = "Resolved" WHERE id = ? AND status != "Resolved"',
      {
        replacements: [issueId],
        type: QueryTypes.UPDATE
      }
    ) as any;

    if (metadata.affectedRows === 0) {
      return res.status(404).json({ error: 'Open compliance issue not found or already resolved' });
    }

    res.json({ message: 'Compliance issue marked as resolved.' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get Notifications
router.get('/notifications', async (req: Request, res: Response) => {
  try {
    const rows = await sequelize.query('SELECT * FROM notifications ORDER BY created_at DESC LIMIT 50', {
      type: QueryTypes.SELECT
    });
    res.json(rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Clear/Mark Notifications as Read
router.post('/notifications/clear', async (req: Request, res: Response) => {
  try {
    await sequelize.query('UPDATE notifications SET is_read = TRUE', { type: QueryTypes.UPDATE });
    res.json({ message: 'Notifications cleared successfully.' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Governance Custom Report Builder endpoint
router.get('/governance/report', async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, departmentId } = req.query;

    let query = `
      SELECT ci.id, ci.created_at, ci.description, ci.severity, ci.owner_name, ci.due_date, ci.status,
             a.title AS audit_title
      FROM compliance_issues ci
      LEFT JOIN audits a ON ci.audit_id = a.id
      WHERE 1=1
    `;
    const replacements: any[] = [];

    if (startDate) {
      query += ' AND ci.created_at >= ?';
      replacements.push(startDate);
    }
    if (endDate) {
      query += ' AND ci.created_at <= ?';
      replacements.push(endDate + ' 23:59:59');
    }
    // Compliance issues aren't strictly bounded to departments directly, but we can filter by the audit's department if available or matching the owner (Sarah is Admin, Marcus is CTO, Alice is MFG, John is LOG, Robert is PUR)
    if (departmentId) {
      // Map department owner to filter
      const deptRows = await sequelize.query('SELECT head FROM departments WHERE id = ?', {
        replacements: [departmentId],
        type: QueryTypes.SELECT
      }) as any[];
      if (deptRows.length > 0) {
        query += ' AND ci.owner_name = ?';
        replacements.push(deptRows[0].head);
      }
    }

    query += ' ORDER BY ci.created_at DESC';

    const data = await sequelize.query(query, {
      replacements,
      type: QueryTypes.SELECT
    }) as any[];

    // Calculate totals
    const openCount = data.filter(item => item.status === 'Open').length;
    const flaggedCount = data.filter(item => item.status === 'Flagged').length;
    const resolvedCount = data.filter(item => item.status === 'Resolved').length;

    res.json({
      summary: {
        recordCount: data.length,
        openCount,
        flaggedCount,
        resolvedCount
      },
      data
    });

  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
