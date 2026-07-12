import { initializeDatabase, sequelize } from './config/database';
import { Department, EmissionFactor, ProductEsgProfile, EnvironmentalGoal, CarbonTransaction, DepartmentScore, User } from './models';

async function seed() {
  try {
    console.log('[Seed] Starting database seeding...');
    
    // 1. Verify/create database and sync models with force: true to wipe existing tables
    await initializeDatabase();
    await sequelize.sync({ force: true });
    console.log('[Seed] Database tables recreated.');

    // 2. Seed Departments
    const adminDept = await Department.create({
      name: 'Administration',
      code: 'ADMIN',
      head: 'Sarah Jenkins',
      employeeCount: 15,
      status: 'Active',
    });

    const logisticsDept = await Department.create({
      name: 'Logistics',
      code: 'LOG',
      head: 'John Doe',
      parentDepartmentId: adminDept.id,
      employeeCount: 45,
      status: 'Active',
    });

    const mfgDept = await Department.create({
      name: 'Manufacturing',
      code: 'MFG',
      head: 'Alice Smith',
      parentDepartmentId: adminDept.id,
      employeeCount: 120,
      status: 'Active',
    });

    const purchaseDept = await Department.create({
      name: 'Purchase',
      code: 'PUR',
      head: 'Robert Johnson',
      parentDepartmentId: adminDept.id,
      employeeCount: 8,
      status: 'Active',
    });

    console.log('[Seed] Seeded 4 departments.');

    // 3. Seed Emission Factors
    const dieselFactor = await EmissionFactor.create({
      name: 'Diesel Fuel (Fleet)',
      category: 'Fleet',
      value: 2.68, // kg CO2 per liter
      unit: 'liters',
      status: 'Active',
    });

    const evFactor = await EmissionFactor.create({
      name: 'Electric Vehicle Charging',
      category: 'Fleet',
      value: 0.38, // kg CO2 per kWh
      unit: 'kWh',
      status: 'Active',
    });

    const electricityFactor = await EmissionFactor.create({
      name: 'Electricity Grid (Mfg)',
      category: 'Manufacturing',
      value: 0.45, // kg CO2 per kWh
      unit: 'kWh',
      status: 'Active',
    });

    const gasFactor = await EmissionFactor.create({
      name: 'Natural Gas (Heating)',
      category: 'Manufacturing',
      value: 1.93, // kg CO2 per m3
      unit: 'm3',
      status: 'Active',
    });

    const paperFactor = await EmissionFactor.create({
      name: 'Office Paper Products',
      category: 'Purchase',
      value: 0.85, // kg CO2 per kg
      unit: 'kg',
      status: 'Active',
    });

    const flightFactor = await EmissionFactor.create({
      name: 'Business Travel Flight',
      category: 'Expense',
      value: 0.12, // kg CO2 per km
      unit: 'km',
      status: 'Active',
    });

    console.log('[Seed] Seeded 6 emission factors.');

    // 4. Seed Product ESG Profiles
    await ProductEsgProfile.create({
      productName: 'Eco-Friendly Bio-Polymer Packaging',
      sku: 'ECO-PKG-01',
      carbonFootprintScore: 0.15,
      sustainabilityRating: 'A',
    });

    await ProductEsgProfile.create({
      productName: 'Recycled Cardboard Packaging Box',
      sku: 'REC-CB-03',
      carbonFootprintScore: 0.45,
      sustainabilityRating: 'B',
    });

    await ProductEsgProfile.create({
      productName: 'Standard Low-Density Polyethylene Box',
      sku: 'STD-PL-02',
      carbonFootprintScore: 2.80,
      sustainabilityRating: 'D',
    });

    console.log('[Seed] Seeded 3 product ESG profiles.');

    // 5. Seed Environmental Goals (Active / Achieved / Failed)
    const logGoal = await EnvironmentalGoal.create({
      title: 'Logistics Fleet Emission Limit',
      targetValue: 1200.0,
      currentValue: 0.0,
      unit: 'kg CO2',
      deadline: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000), // 6 months from now
      status: 'Active',
      departmentId: logisticsDept.id,
    });

    const mfgGoal = await EnvironmentalGoal.create({
      title: 'Manufacturing Power Carbon Limit',
      targetValue: 4000.0,
      currentValue: 0.0,
      unit: 'kg CO2',
      deadline: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 3 months from now
      status: 'Active',
      departmentId: mfgDept.id,
    });

    const companyGoal = await EnvironmentalGoal.create({
      title: 'Company-Wide Travel Emission Cap',
      targetValue: 8000.0,
      currentValue: 0.0,
      unit: 'kg CO2',
      deadline: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year from now
      status: 'Active',
      departmentId: null, // Company-wide
    });

    console.log('[Seed] Seeded 3 environmental goals.');

    // 6. Seed Carbon Transactions
    const now = new Date();
    
    // Last month transactions
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15);
    const lastMonth2 = new Date(now.getFullYear(), now.getMonth() - 1, 20);

    // This month transactions
    const thisMonth1 = new Date(now.getFullYear(), now.getMonth(), 5);
    const thisMonth2 = new Date(now.getFullYear(), now.getMonth(), 8);
    const thisMonth3 = new Date(now.getFullYear(), now.getMonth(), 10);

    // Insert historical transactions to demonstrate MoM and update goal values
    // Logistics transactions
    await CarbonTransaction.create({
      sourceModule: 'Fleet',
      recordId: 'FLEET-2026-001',
      rawValue: 200, // 200 liters of Diesel
      calculatedEmission: 200 * 2.68, // 536 kg CO2
      emissionFactorId: dieselFactor.id,
      departmentId: logisticsDept.id,
      timestamp: lastMonth,
    });

    await CarbonTransaction.create({
      sourceModule: 'Fleet',
      recordId: 'FLEET-2026-002',
      rawValue: 150, // 150 liters of Diesel
      calculatedEmission: 150 * 2.68, // 402 kg CO2
      emissionFactorId: dieselFactor.id,
      departmentId: logisticsDept.id,
      timestamp: thisMonth1,
    });

    // Manufacturing transactions
    await CarbonTransaction.create({
      sourceModule: 'Manufacturing',
      recordId: 'MFG-JOB-992',
      rawValue: 5000, // 5000 kWh Grid Electricity
      calculatedEmission: 5000 * 0.45, // 2250 kg CO2
      emissionFactorId: electricityFactor.id,
      departmentId: mfgDept.id,
      timestamp: lastMonth2,
    });

    await CarbonTransaction.create({
      sourceModule: 'Manufacturing',
      recordId: 'MFG-JOB-1024',
      rawValue: 3000, // 3000 kWh Grid Electricity
      calculatedEmission: 3000 * 0.45, // 1350 kg CO2
      emissionFactorId: electricityFactor.id,
      departmentId: mfgDept.id,
      timestamp: thisMonth2,
    });

    // Expense transactions (Business travel flight)
    await CarbonTransaction.create({
      sourceModule: 'Expense',
      recordId: 'EXP-TRV-8821',
      rawValue: 5000, // 5000 km travel
      calculatedEmission: 5000 * 0.12, // 600 kg CO2
      emissionFactorId: flightFactor.id,
      departmentId: adminDept.id,
      timestamp: thisMonth3,
    });

    console.log('[Seed] Seeded 5 carbon transactions across different months.');

    // 7. Seed Department Scores (with initial scores, will be updated based on calculations)
    await DepartmentScore.create({
      departmentId: adminDept.id,
      environmentalScore: 85,
      socialScore: 78,
      governanceScore: 82,
      totalScore: parseFloat(((85 * 0.4) + (78 * 0.3) + (82 * 0.3)).toFixed(2)),
      updatedAt: now,
    });

    await DepartmentScore.create({
      departmentId: logisticsDept.id,
      environmentalScore: 90,
      socialScore: 72,
      governanceScore: 75,
      totalScore: parseFloat(((90 * 0.4) + (72 * 0.3) + (75 * 0.3)).toFixed(2)),
      updatedAt: now,
    });

    await DepartmentScore.create({
      departmentId: mfgDept.id,
      environmentalScore: 65,
      socialScore: 80,
      governanceScore: 70,
      totalScore: parseFloat(((65 * 0.4) + (80 * 0.3) + (70 * 0.3)).toFixed(2)),
      updatedAt: now,
    });

    await DepartmentScore.create({
      departmentId: purchaseDept.id,
      environmentalScore: 80,
      socialScore: 75,
      governanceScore: 75,
      totalScore: parseFloat(((80 * 0.4) + (75 * 0.3) + (75 * 0.3)).toFixed(2)),
      updatedAt: now,
    });

    console.log('[Seed] Seeded 4 department score records.');

    // 7.5 Seed Mock Users for Authentication
    await User.create({
      username: 'sarah.ceo',
      password: 'ecosphere2026',
      name: 'Sarah Jenkins',
      role: 'CEO',
      departmentId: null,
    });

    await User.create({
      username: 'marcus.cto',
      password: 'ecosphere2026',
      name: 'Marcus Reed',
      role: 'CTO',
      departmentId: null,
    });

    await User.create({
      username: 'john.log',
      password: 'ecosphere2026',
      name: 'John Doe',
      role: 'DepartmentHead',
      departmentId: logisticsDept.id,
    });

    await User.create({
      username: 'alice.mfg',
      password: 'ecosphere2026',
      name: 'Alice Smith',
      role: 'DepartmentHead',
      departmentId: mfgDept.id,
    });

    await User.create({
      username: 'robert.pur',
      password: 'ecosphere2026',
      name: 'Robert Johnson',
      role: 'DepartmentHead',
      departmentId: purchaseDept.id,
    });

    await User.create({
      username: 'bill.emp',
      password: 'ecosphere2026',
      name: 'Bill Burns',
      role: 'Employee',
      departmentId: logisticsDept.id,
    });

    console.log('[Seed] Seeded 6 mock users.');

    // 8. Run score updates for all departments to synchronize active goal metrics
    console.log('[Seed] Synchronizing goal values and recalculating department scores...');
    await updateDepartmentScores([adminDept.id, logisticsDept.id, mfgDept.id, purchaseDept.id]);

    console.log('[Seed] Database seeding completed successfully.');
    process.exit(0);
  } catch (error) {
    console.error('[Seed] Database seeding failed:', error);
    process.exit(1);
  }
}

// Helper to run score updates sequentially for the seed script
async function updateDepartmentScores(ids: number[]) {
  // Direct import to bypass circular dependency during setup
  const { recalculateDepartmentScore } = require('./services/esgServices');
  for (const id of ids) {
    await recalculateDepartmentScore(id);
  }
}

seed();
