import { Request, Response } from 'express';
import { Op, fn, col } from 'sequelize';
import { Department, EmissionFactor, EnvironmentalGoal, CarbonTransaction, DepartmentScore, ProductEsgProfile, User } from '../models';
import { calculateCarbon, recalculateDepartmentScore } from '../services/esgServices';

// ==========================================
// 1. EMISSION FACTORS CONTROLLER
// ==========================================

export async function createEmissionFactor(req: Request, res: Response) {
  try {
    const { name, category, value, unit, status } = req.body;
    if (!name || !category || value === undefined || !unit) {
      return res.status(400).json({ error: 'Missing required fields: name, category, value, unit are required.' });
    }

    const factor = await EmissionFactor.create({
      name,
      category,
      value: parseFloat(value),
      unit,
      status: status || 'Active',
    });

    return res.status(201).json(factor);
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to create emission factor.' });
  }
}

export async function listEmissionFactors(req: Request, res: Response) {
  try {
    const factors = await EmissionFactor.findAll();
    return res.status(200).json(factors);
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to retrieve emission factors.' });
  }
}

// ==========================================
// 2. CARBON TRANSACTIONS CONTROLLER
// ==========================================

export async function recordCarbonTransaction(req: Request, res: Response) {
  try {
    const { sourceModule, recordId, rawValue, departmentId, emissionFactorId } = req.body;
    if (!sourceModule || !recordId || rawValue === undefined || !departmentId || !emissionFactorId) {
      return res.status(400).json({
        error: 'Missing required fields: sourceModule, recordId, rawValue, departmentId, and emissionFactorId are required.',
      });
    }

    // Call the Auto Emission Calculation Engine
    const transaction = await calculateCarbon(
      sourceModule,
      recordId,
      parseFloat(rawValue),
      parseInt(departmentId, 10),
      parseInt(emissionFactorId, 10)
    );

    return res.status(201).json(transaction);
  } catch (error: any) {
    return res.status(400).json({ error: error.message || 'Failed to record carbon transaction.' });
  }
}

// ==========================================
// 3. DEPARTMENT TRACKING CONTROLLER
// ==========================================

export async function getDepartmentCarbonTracking(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const departmentId = parseInt(id, 10);

    const department = await Department.findByPk(departmentId, {
      include: [{ model: DepartmentScore, as: 'score' }],
    });

    if (!department) {
      return res.status(404).json({ error: `Department with ID ${departmentId} not found.` });
    }

    // Get all transactions for the department
    const transactions = await CarbonTransaction.findAll({
      where: { departmentId },
      include: [{ model: EmissionFactor, as: 'emissionFactor' }],
      order: [['timestamp', 'ASC']],
    });

    // Aggregate monthly emissions
    const monthlyEmissionsMap: { [key: string]: number } = {};
    const categoryEmissionsMap: { [key: string]: number } = {};

    transactions.forEach((tx: any) => {
      // Monthly aggregation
      const date = new Date(tx.timestamp);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      monthlyEmissionsMap[monthKey] = (monthlyEmissionsMap[monthKey] || 0) + tx.calculatedEmission;

      // Category aggregation
      const category = tx.emissionFactor?.category || 'Uncategorized';
      categoryEmissionsMap[category] = (categoryEmissionsMap[category] || 0) + tx.calculatedEmission;
    });

    const monthlyTracking = Object.keys(monthlyEmissionsMap).map((month) => ({
      month,
      emissions: parseFloat(monthlyEmissionsMap[month].toFixed(2)),
    }));

    const categoryBreakdown = Object.keys(categoryEmissionsMap).map((category) => ({
      category,
      emissions: parseFloat(categoryEmissionsMap[category].toFixed(2)),
    }));

    // Get department goals
    const goals = await EnvironmentalGoal.findAll({
      where: { departmentId },
    });

    return res.status(200).json({
      department: {
        id: department.id,
        name: department.name,
        code: department.code,
        head: department.head,
        employeeCount: department.employeeCount,
        status: department.status,
        score: department.score,
      },
      summary: {
        totalEmissions: parseFloat(transactions.reduce((acc, curr) => acc + curr.calculatedEmission, 0).toFixed(2)),
        goalCount: goals.length,
        activeGoalCount: goals.filter((g) => g.status === 'Active').length,
      },
      monthlyTracking,
      categoryBreakdown,
      goals,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to retrieve department carbon tracking.' });
  }
}

// ==========================================
// 4. ENVIRONMENTAL GOALS CONTROLLER
// ==========================================

export async function createGoal(req: Request, res: Response) {
  try {
    const { title, targetValue, unit, deadline, departmentId } = req.body;
    if (!title || targetValue === undefined || !unit || !deadline) {
      return res.status(400).json({
        error: 'Missing required fields: title, targetValue, unit, and deadline are required.',
      });
    }

    const goal = await EnvironmentalGoal.create({
      title,
      targetValue: parseFloat(targetValue),
      currentValue: 0.0,
      unit,
      deadline: new Date(deadline),
      status: 'Active',
      departmentId: departmentId ? parseInt(departmentId, 10) : null,
    });

    // If departmentId is provided, run initial score aggregation
    if (departmentId) {
      await recalculateDepartmentScore(parseInt(departmentId, 10));
    }

    return res.status(201).json(goal);
  } catch (error: any) {
    return res.status(400).json({ error: error.message || 'Failed to create environmental goal.' });
  }
}

export async function listGoals(req: Request, res: Response) {
  try {
    const goals = await EnvironmentalGoal.findAll({
      include: [{ model: Department, as: 'department', attributes: ['id', 'name', 'code'] }],
    });
    return res.status(200).json(goals);
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to retrieve goals.' });
  }
}

// ==========================================
// 5. DASHBOARD CONTROLLER
// ==========================================

export async function getDashboardMetrics(req: Request, res: Response) {
  try {
    const now = new Date();
    
    // Start/End of current month
    const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfCurrentMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    // Start/End of last month
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

    // Fetch this month's emissions
    const currentMonthEmissionsResult = await CarbonTransaction.sum('calculatedEmission', {
      where: {
        timestamp: {
          [Op.between]: [startOfCurrentMonth, endOfCurrentMonth],
        },
      },
    });
    const currentMonthEmissions = currentMonthEmissionsResult || 0;

    // Fetch last month's emissions
    const lastMonthEmissionsResult = await CarbonTransaction.sum('calculatedEmission', {
      where: {
        timestamp: {
          [Op.between]: [startOfLastMonth, endOfLastMonth],
        },
      },
    });
    const lastMonthEmissions = lastMonthEmissionsResult || 0;

    // Fetch active environmental goals
    const activeGoals = await EnvironmentalGoal.findAll({
      where: { status: 'Active' },
      include: [{ model: Department, as: 'department', attributes: ['id', 'name'] }],
    });

    const goalsProgress = activeGoals.map((goal) => {
      const completionPercentage = goal.targetValue > 0
        ? Math.min(100, parseFloat(((goal.currentValue / goal.targetValue) * 100).toFixed(2)))
        : 0;
      return {
        id: goal.id,
        title: goal.title,
        targetValue: goal.targetValue,
        currentValue: goal.currentValue,
        unit: goal.unit,
        deadline: goal.deadline,
        status: goal.status,
        department: goal.department ? goal.department.name : 'Company-wide',
        completionPercentage,
      };
    });

    // Fetch source category breakdown
    const transactions = await CarbonTransaction.findAll({
      include: [{ model: EmissionFactor, as: 'emissionFactor', attributes: ['category'] }],
    });

    const categorySum: { [key: string]: number } = {
      Fleet: 0,
      Manufacturing: 0,
      Purchase: 0,
      Expense: 0,
    };

    transactions.forEach((tx: any) => {
      const category = tx.emissionFactor?.category;
      if (category && categorySum[category] !== undefined) {
        categorySum[category] += tx.calculatedEmission;
      } else if (category) {
        categorySum[category] = (categorySum[category] || 0) + tx.calculatedEmission;
      }
    });

    const categoryBreakdown = Object.keys(categorySum).map((category) => ({
      category,
      emissions: parseFloat(categorySum[category].toFixed(2)),
    }));

    // Fetch average scores
    const avgScores: any = await DepartmentScore.findAll({
      attributes: [
        [fn('AVG', col('environmentalScore')), 'avgEnvironmental'],
        [fn('AVG', col('socialScore')), 'avgSocial'],
        [fn('AVG', col('governanceScore')), 'avgGovernance'],
        [fn('AVG', col('totalScore')), 'avgTotal'],
      ],
    });

    const scores = avgScores[0]?.dataValues || {};
    const companyScores = {
      environmental: Math.round(parseFloat(scores.avgEnvironmental || '80')),
      social: Math.round(parseFloat(scores.avgSocial || '70')),
      governance: Math.round(parseFloat(scores.avgGovernance || '70')),
      total: Math.round(parseFloat(scores.avgTotal || '75')),
    };

    // Fetch department rankings
    const departmentRankings = await DepartmentScore.findAll({
      include: [{ model: Department, as: 'department', attributes: ['id', 'name', 'code'] }],
      order: [['totalScore', 'DESC']],
    });

    const rankings = departmentRankings.map((ds: any) => ({
      name: ds.department?.name || 'Unknown',
      code: ds.department?.code || 'UNK',
      totalScore: ds.totalScore,
      environmentalScore: ds.environmentalScore,
      socialScore: ds.socialScore,
      governanceScore: ds.governanceScore,
    }));

    return res.status(200).json({
      carbonEmissionsMoM: {
        thisMonth: parseFloat(currentMonthEmissions.toFixed(2)),
        lastMonth: parseFloat(lastMonthEmissions.toFixed(2)),
        percentageChange: lastMonthEmissions > 0
          ? parseFloat((((currentMonthEmissions - lastMonthEmissions) / lastMonthEmissions) * 100).toFixed(2))
          : 0,
      },
      activeGoals: goalsProgress,
      categoryBreakdown,
      companyScores,
      rankings,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to retrieve dashboard metrics.' });
  }
}

// ==========================================
// 6. REPORT CONTROLLER
// ==========================================

export async function getEnvironmentalReport(req: Request, res: Response) {
  try {
    const { departmentId, startDate, endDate } = req.query;
    const whereClause: any = {};

    if (departmentId) {
      whereClause.departmentId = parseInt(departmentId as string, 10);
    }

    if (startDate || endDate) {
      whereClause.timestamp = {};
      if (startDate) {
        whereClause.timestamp[Op.gte] = new Date(startDate as string);
      }
      if (endDate) {
        whereClause.timestamp[Op.lte] = new Date(endDate as string);
      }
    }

    const transactions = await CarbonTransaction.findAll({
      where: whereClause,
      include: [
        { model: Department, as: 'department', attributes: ['id', 'name', 'code'] },
        { model: EmissionFactor, as: 'emissionFactor', attributes: ['id', 'name', 'category', 'value', 'unit'] },
      ],
      order: [['timestamp', 'DESC']],
    });

    // Calculate report summary metrics
    const totalEmissions = transactions.reduce((acc, curr) => acc + curr.calculatedEmission, 0);
    const categoryTotals: { [key: string]: number } = {};
    const departmentTotals: { [key: string]: number } = {};

    transactions.forEach((tx: any) => {
      const category = tx.emissionFactor?.category || 'Uncategorized';
      categoryTotals[category] = (categoryTotals[category] || 0) + tx.calculatedEmission;

      const deptName = tx.department?.name || 'Unknown';
      departmentTotals[deptName] = (departmentTotals[deptName] || 0) + tx.calculatedEmission;
    });

    return res.status(200).json({
      filters: {
        departmentId: departmentId ? parseInt(departmentId as string, 10) : null,
        startDate: startDate || null,
        endDate: endDate || null,
      },
      summary: {
        recordCount: transactions.length,
        totalEmissions: parseFloat(totalEmissions.toFixed(2)),
        categoryBreakdown: Object.keys(categoryTotals).map((cat) => ({
          category: cat,
          emissions: parseFloat(categoryTotals[cat].toFixed(2)),
        })),
        departmentBreakdown: Object.keys(departmentTotals).map((dept) => ({
          department: dept,
          emissions: parseFloat(departmentTotals[dept].toFixed(2)),
        })),
      },
      data: transactions.map((tx: any) => ({
        id: tx.id,
        sourceModule: tx.sourceModule,
        recordId: tx.recordId,
        rawValue: tx.rawValue,
        calculatedEmission: tx.calculatedEmission,
        timestamp: tx.timestamp,
        department: tx.department,
        emissionFactor: tx.emissionFactor,
      })),
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to generate environmental report.' });
  }
}

// ==========================================
// 7. PRODUCT ESG PROFILE CONTROLLER
// ==========================================

export async function createProductEsgProfile(req: Request, res: Response) {
  try {
    const { productName, sku, carbonFootprintScore, sustainabilityRating } = req.body;
    if (!productName || !sku || carbonFootprintScore === undefined || !sustainabilityRating) {
      return res.status(400).json({
        error: 'Missing required fields: productName, sku, carbonFootprintScore, and sustainabilityRating are required.',
      });
    }

    const profile = await ProductEsgProfile.create({
      productName,
      sku,
      carbonFootprintScore: parseFloat(carbonFootprintScore),
      sustainabilityRating,
    });

    return res.status(201).json(profile);
  } catch (error: any) {
    return res.status(400).json({ error: error.message || 'Failed to create product ESG profile.' });
  }
}

export async function listProductEsgProfiles(req: Request, res: Response) {
  try {
    const profiles = await ProductEsgProfile.findAll();
    return res.status(200).json(profiles);
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to retrieve product ESG profiles.' });
  }
}

// ==========================================
// 8. AUTHENTICATION CONTROLLER
// ==========================================

export async function loginUser(req: Request, res: Response) {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }

    const user = await User.findOne({
      where: { username },
      include: [{ model: Department, as: 'department', attributes: ['id', 'name'] }]
    });

    if (!user || user.password !== password) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    // Role-based authorization gate: Only allow CEO, CTO, and DepartmentHead
    const allowedRoles = ['CEO', 'CTO', 'DepartmentHead'];
    if (!allowedRoles.includes(user.role)) {
      return res.status(403).json({
        error: 'Access restricted to Executive Officers and Department Heads only.',
      });
    }

    // Success response returning user session payload
    return res.status(200).json({
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      departmentId: user.departmentId,
      department: user.department ? user.department.name : null,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Authentication error.' });
  }
}

// ==========================================
// 9. DEPARTMENTS CONTROLLER
// ==========================================

export async function listDepartments(req: Request, res: Response) {
  try {
    const depts = await Department.findAll({
      order: [['name', 'ASC']]
    });
    return res.status(200).json(depts);
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to retrieve departments.' });
  }
}

export async function createDepartment(req: Request, res: Response) {
  try {
    const { name, code, head, parentDepartmentId, employeeCount, status } = req.body;
    if (!name || !code) {
      return res.status(400).json({ error: 'Name and Code are required.' });
    }
    const dept = await Department.create({
      name,
      code,
      head: head || '',
      parentDepartmentId: parentDepartmentId ? parseInt(parentDepartmentId) : null,
      employeeCount: employeeCount ? parseInt(employeeCount) : 0,
      status: status || 'Active'
    });
    return res.status(201).json(dept);
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to create department.' });
  }
}

export async function deleteDepartment(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const deleted = await Department.destroy({ where: { id: parseInt(id) } });
    if (!deleted) return res.status(404).json({ error: 'Department not found' });
    return res.status(200).json({ message: 'Department deleted successfully' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to delete department.' });
  }
}


