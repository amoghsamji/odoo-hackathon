import { initializeDatabase, sequelize } from './config/database';
import { Department, EmissionFactor, ProductEsgProfile, EnvironmentalGoal, CarbonTransaction, DepartmentScore, User } from './models';
import { QueryTypes } from 'sequelize';

async function seed() {
  try {
    console.log('[Seed] Starting database seeding...');
    
    // 1. Verify/create database and sync models with force: true to wipe existing tables
    await initializeDatabase();
    await sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
    await sequelize.query('DROP TABLE IF EXISTS compliance_issues');
    await sequelize.query('DROP TABLE IF EXISTS policy_acknowledgements');
    await sequelize.query('DROP TABLE IF EXISTS esg_policies');
    await sequelize.query('DROP TABLE IF EXISTS audits');
    await sequelize.query('DROP TABLE IF EXISTS notifications');
    await sequelize.query('DROP TABLE IF EXISTS employee_participations');
    await sequelize.query('DROP TABLE IF EXISTS settings');
    await sequelize.sync({ force: true });
    await sequelize.query('SET FOREIGN_KEY_CHECKS = 1');
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

    // 9. Rebuild and Seed Social Tables
    console.log('[Seed] Rebuilding and seeding Social module tables...');
    await sequelize.query('DROP TABLE IF EXISTS employee_participations');
    await sequelize.query('DROP TABLE IF EXISTS employee_trainings');
    await sequelize.query('DROP TABLE IF EXISTS csr_activities');
    await sequelize.query('DROP TABLE IF EXISTS trainings');
    await sequelize.query('DROP TABLE IF EXISTS employees');
    await sequelize.query('DROP TABLE IF EXISTS settings');

    // Create Employees
    await sequelize.query(`
      CREATE TABLE employees (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL UNIQUE,
        gender ENUM('Female', 'Male', 'Other') NOT NULL,
        ethnicity VARCHAR(255) NOT NULL,
        is_leadership BOOLEAN DEFAULT FALSE,
        is_board BOOLEAN DEFAULT FALSE,
        points INT DEFAULT 0,
        department_id INT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL
      )
    `);

    // Create Trainings
    await sequelize.query(`
      CREATE TABLE trainings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT NOT NULL,
        required_hours INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create CSR Activities
    await sequelize.query(`
      CREATE TABLE csr_activities (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        category VARCHAR(255) NOT NULL,
        description TEXT NOT NULL,
        points INT NOT NULL,
        icon VARCHAR(50) NOT NULL,
        prerequisite_training_id INT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (prerequisite_training_id) REFERENCES trainings(id) ON DELETE SET NULL
      )
    `);

    // Create Employee Participations
    await sequelize.query(`
      CREATE TABLE employee_participations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        employee_id INT NOT NULL,
        activity_id INT NOT NULL,
        proof VARCHAR(255),
        status ENUM('Pending', 'Approved', 'Rejected') DEFAULT 'Pending',
        points INT NOT NULL,
        hours_spent INT DEFAULT 0,
        employee_notes TEXT,
        completion_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
        FOREIGN KEY (activity_id) REFERENCES csr_activities(id) ON DELETE CASCADE
      )
    `);

    // Create Employee Trainings
    await sequelize.query(`
      CREATE TABLE employee_trainings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        employee_id INT NOT NULL,
        training_id INT NOT NULL,
        completion_date TIMESTAMP NULL,
        status ENUM('In Progress', 'Completed') DEFAULT 'In Progress',
        FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
        FOREIGN KEY (training_id) REFERENCES trainings(id) ON DELETE CASCADE
      )
    `);

    // Create Settings
    await sequelize.query(`
      CREATE TABLE settings (
        setting_key VARCHAR(255) PRIMARY KEY,
        setting_value VARCHAR(255) NOT NULL
      )
    `);

    // Seed Employees
    await sequelize.query(`
      INSERT INTO employees (name, email, gender, ethnicity, is_leadership, is_board, points, department_id) VALUES
      ('Aditya S.', 'aditya@ecosphere.com', 'Male', 'South Asian', FALSE, FALSE, 100, 2),
      ('Sohan Shah', 'sohan@ecosphere.com', 'Male', 'South Asian', FALSE, FALSE, 30, 3),
      ('Sarah Jenkins', 'sarah@ecosphere.com', 'Female', 'White', TRUE, FALSE, 200, 1),
      ('Maria Lopez', 'maria@ecosphere.com', 'Female', 'Hispanic', TRUE, TRUE, 150, 1),
      ('John Doe', 'john@ecosphere.com', 'Male', 'White', FALSE, TRUE, 80, 2),
      ('Alex Chen', 'alex@ecosphere.com', 'Other', 'East Asian', FALSE, FALSE, 50, 4)
    `);

    // Seed Trainings
    await sequelize.query(`
      INSERT INTO trainings (id, name, description, required_hours) VALUES
      (1, 'Safety & Environmental Health', 'Covers hazard prevention, waste disposal, and recycling protocols.', 3),
      (2, 'Diversity & Inclusion in Workplace', 'Fosters an inclusive workplace culture and unconscious bias training.', 2),
      (3, 'Data Privacy & Security Policies', 'Outlines details on personal data compliance, protection rules, and cybersecurity.', 4),
      (4, 'Ethical Decision Making', 'Introduction to the corporate compliance code and governance regulations.', 2)
    `);

    // Seed CSR Activities
    await sequelize.query(`
      INSERT INTO csr_activities (name, category, description, points, icon, prerequisite_training_id) VALUES
      ('Tree Plantation', 'Environmental', 'Participate in planting local native trees. Earn 50 points.', 50, 'forest', 1),
      ('Blood Donation', 'Social / Health', 'Participate in our quarterly corporate blood drive. Earn 30 points.', 30, 'volunteer_activism', NULL),
      ('Climate Change Seminar', 'Education', 'Learn about environmental impacts and carbon metrics. Earn 20 points.', 20, 'school', NULL),
      ('ESG Workshop', 'Governance', 'Understand ESG configuration policies and compliance. Earn 30 points.', 30, 'gavel', 4)
    `);

    // Fetch seeded employees and activities
    const dbEmployees = await sequelize.query('SELECT id, name FROM employees', { type: QueryTypes.SELECT }) as any[];
    const dbActivities = await sequelize.query('SELECT id, name FROM csr_activities', { type: QueryTypes.SELECT }) as any[];

    const aditya = dbEmployees.find(e => e.name === 'Aditya S.');
    const sohan = dbEmployees.find(e => e.name === 'Sohan Shah');
    const sarah = dbEmployees.find(e => e.name === 'Sarah Jenkins');
    const maria = dbEmployees.find(e => e.name === 'Maria Lopez');

    const treePlantation = dbActivities.find(a => a.name === 'Tree Plantation');
    const esgWorkshop = dbActivities.find(a => a.name === 'ESG Workshop');
    const bloodDonation = dbActivities.find(a => a.name === 'Blood Donation');
    const seminar = dbActivities.find(a => a.name === 'Climate Change Seminar');

    // Seed employee trainings
    if (aditya) {
      await sequelize.query(`INSERT INTO employee_trainings (employee_id, training_id, status, completion_date) VALUES (?, 1, 'Completed', NOW())`, { replacements: [aditya.id] });
      await sequelize.query(`INSERT INTO employee_trainings (employee_id, training_id, status) VALUES (?, 2, 'In Progress')`, { replacements: [aditya.id] });
    }
    if (sohan) {
      await sequelize.query(`INSERT INTO employee_trainings (employee_id, training_id, status, completion_date) VALUES (?, 2, 'Completed', NOW())`, { replacements: [sohan.id] });
    }
    if (sarah) {
      await sequelize.query(`INSERT INTO employee_trainings (employee_id, training_id, status, completion_date) VALUES (?, 3, 'Completed', NOW())`, { replacements: [sarah.id] });
      await sequelize.query(`INSERT INTO employee_trainings (employee_id, training_id, status, completion_date) VALUES (?, 4, 'Completed', NOW())`, { replacements: [sarah.id] });
    }
    if (maria) {
      await sequelize.query(`INSERT INTO employee_trainings (employee_id, training_id, status, completion_date) VALUES (?, 2, 'Completed', NOW())`, { replacements: [maria.id] });
    }

    // Seed participations
    if (aditya && treePlantation) {
      await sequelize.query(`
        INSERT INTO employee_participations (employee_id, activity_id, proof, status, points, hours_spent, employee_notes) VALUES
        (?, ?, 'Docx.pdf', 'Pending', 50, 4, 'Planted 5 pine saplings in the local park.')
      `, { replacements: [aditya.id, treePlantation.id] });
    }
    if (sohan && esgWorkshop) {
      await sequelize.query(`
        INSERT INTO employee_participations (employee_id, activity_id, proof, status, points, hours_spent, employee_notes) VALUES
        (?, ?, 'image.png', 'Approved', 30, 2, 'Attended governance and business integrity training.')
      `, { replacements: [sohan.id, esgWorkshop.id] });
    }
    if (sarah && bloodDonation) {
      await sequelize.query(`
        INSERT INTO employee_participations (employee_id, activity_id, proof, status, points, hours_spent, employee_notes) VALUES
        (?, ?, 'donation_cert.pdf', 'Approved', 30, 1, 'Donated 1 unit of O+ blood.')
      `, { replacements: [sarah.id, bloodDonation.id] });
    }
    if (maria && seminar) {
      await sequelize.query(`
        INSERT INTO employee_participations (employee_id, activity_id, proof, status, points, hours_spent, employee_notes) VALUES
        (?, ?, 'seminar_ticket.pdf', 'Approved', 20, 3, 'Learned about emission reporting methodologies.')
      `, { replacements: [maria.id, seminar.id] });
    }

    // Seed Settings
    await sequelize.query(`
      INSERT INTO settings (setting_key, setting_value) VALUES
      ('evidence_requirement', '1')
    `);

    console.log('[Seed] Social module tables populated successfully.');

    // 10. Rebuild and Seed Governance Tables
    console.log('[Seed] Rebuilding and seeding Governance module tables...');
    await sequelize.query('DROP TABLE IF EXISTS compliance_issues');
    await sequelize.query('DROP TABLE IF EXISTS policy_acknowledgements');
    await sequelize.query('DROP TABLE IF EXISTS esg_policies');
    await sequelize.query('DROP TABLE IF EXISTS audits');
    await sequelize.query('DROP TABLE IF EXISTS notifications');

    // Create Policies
    await sequelize.query(`
      CREATE TABLE esg_policies (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT NOT NULL,
        owner_name VARCHAR(255) NOT NULL,
        status ENUM('Active', 'Archived') DEFAULT 'Active',
        effective_date DATE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create Policy Acknowledgements
    await sequelize.query(`
      CREATE TABLE policy_acknowledgements (
        id INT AUTO_INCREMENT PRIMARY KEY,
        policy_id INT NOT NULL,
        employee_id INT NOT NULL,
        acknowledged_at TIMESTAMP NULL,
        status ENUM('Pending', 'Acknowledged') DEFAULT 'Pending',
        FOREIGN KEY (policy_id) REFERENCES esg_policies(id) ON DELETE CASCADE,
        FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
        UNIQUE KEY unique_ack (policy_id, employee_id)
      )
    `);

    // Create Audits
    await sequelize.query(`
      CREATE TABLE audits (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        auditor VARCHAR(255) NOT NULL,
        audit_date DATE NOT NULL,
        status ENUM('Draft', 'In Progress', 'Completed') DEFAULT 'Draft',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create Compliance Issues
    await sequelize.query(`
      CREATE TABLE compliance_issues (
        id INT AUTO_INCREMENT PRIMARY KEY,
        audit_id INT NULL,
        description TEXT NOT NULL,
        severity ENUM('Low', 'Medium', 'High', 'Critical') DEFAULT 'Low',
        owner_name VARCHAR(255) NOT NULL,
        due_date DATE NOT NULL,
        status ENUM('Open', 'Resolved', 'Flagged') DEFAULT 'Open',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (audit_id) REFERENCES audits(id) ON DELETE SET NULL
      )
    `);

    // Create Notifications
    await sequelize.query(`
      CREATE TABLE notifications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        type VARCHAR(50) NOT NULL,
        message TEXT NOT NULL,
        is_read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Seed default Policies
    await sequelize.query(`
      INSERT INTO esg_policies (title, description, owner_name, status, effective_date) VALUES
      ('Code of Conduct', 'Comprehensive compliance guidelines and ethical operational code for all employees.', 'Marcus Reed', 'Active', '2026-01-10'),
      ('Supplier Code of Conduct', 'Outlines vendor ethical requirements, sustainability compliance, and carbon footprint targets.', 'Sarah Jenkins', 'Active', '2026-02-15'),
      ('Information Security & Data Privacy', 'Compliance controls for safeguarding corporate data and customer privacy.', 'Marcus Reed', 'Active', '2026-03-01')
    `);

    // Seed Audits
    await sequelize.query(`
      INSERT INTO audits (title, auditor, audit_date, status) VALUES
      ('Q3 Internal Controls Audit', 'Internal Risk Team', '2026-10-10', 'In Progress'),
      ('ISO 14001 Surveillance Audit', 'Bureau Veritas', '2026-11-15', 'Draft')
    `);

    // Seed Compliance Issues
    await sequelize.query(`
      INSERT INTO compliance_issues (audit_id, description, severity, owner_name, due_date, status) VALUES
      (1, 'Data Privacy Policy Update Delay (EU Region)', 'High', 'Marcus Reed', '2026-06-15', 'Flagged'),
      (1, 'Supplier Code of Conduct Missing Acknowledgements', 'Medium', 'Sarah Jenkins', '2026-11-02', 'Open'),
      (NULL, 'Q3 Board Diversity Reporting Gap', 'Low', 'Maria Lopez', '2026-05-30', 'Resolved')
    `);

    // Seed Policy Acknowledgements for employees
    const dbEmpList = await sequelize.query('SELECT id, name FROM employees', { type: QueryTypes.SELECT }) as any[];
    const dbPolicyList = await sequelize.query('SELECT id, title FROM esg_policies', { type: QueryTypes.SELECT }) as any[];

    for (const p of dbPolicyList) {
      for (const e of dbEmpList) {
        let status = 'Pending';
        let ackAt = null;
        if (p.title === 'Code of Conduct' && (e.name === 'Sarah Jenkins' || e.name === 'Aditya S.')) {
          status = 'Acknowledged';
          ackAt = new Date();
        }
        await sequelize.query(
          'INSERT INTO policy_acknowledgements (policy_id, employee_id, status, acknowledged_at) VALUES (?, ?, ?, ?)',
          { replacements: [p.id, e.id, status, ackAt] }
        );
      }
    }

    console.log('[Seed] Governance module tables populated successfully.');

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
