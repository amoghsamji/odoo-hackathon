const mysql = require('mysql2/promise');
require('dotenv').config();

async function initializeDatabase() {
  const connectionConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
  };

  const dbName = process.env.DB_NAME || 'ecosphere_db';

  console.log(`Connecting to MySQL server at ${connectionConfig.host}...`);
  let connection;
  try {
    connection = await mysql.createConnection(connectionConfig);
  } catch (err) {
    console.error('Failed to connect to MySQL server. Please make sure MySQL is running and your .env credentials are correct.', err.message);
    process.exit(1);
  }

  console.log(`Creating database "${dbName}" if it does not exist...`);
  await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
  await connection.end();

  // Re-connect with database selected
  const dbConnection = await mysql.createConnection({
    ...connectionConfig,
    database: dbName,
  });

  console.log('Drop existing tables to rebuild with updated schema...');
  await dbConnection.query('DROP TABLE IF EXISTS employee_participations');
  await dbConnection.query('DROP TABLE IF EXISTS employee_trainings');
  await dbConnection.query('DROP TABLE IF EXISTS csr_activities');
  await dbConnection.query('DROP TABLE IF EXISTS trainings');
  await dbConnection.query('DROP TABLE IF EXISTS employees');
  await dbConnection.query('DROP TABLE IF EXISTS settings');

  console.log('Creating tables...');

  // 1. Employees Table
  await dbConnection.query(`
    CREATE TABLE employees (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL UNIQUE,
      gender ENUM('Female', 'Male', 'Other') NOT NULL,
      ethnicity VARCHAR(255) NOT NULL,
      is_leadership BOOLEAN DEFAULT FALSE,
      is_board BOOLEAN DEFAULT FALSE,
      points INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 2. Trainings Table
  await dbConnection.query(`
    CREATE TABLE trainings (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      description TEXT NOT NULL,
      required_hours INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 3. CSR Activities Table
  await dbConnection.query(`
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

  // 4. Employee Participations Table
  await dbConnection.query(`
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

  // 5. Employee Trainings Table
  await dbConnection.query(`
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

  // 6. Settings Table
  await dbConnection.query(`
    CREATE TABLE settings (
      setting_key VARCHAR(255) PRIMARY KEY,
      setting_value VARCHAR(255) NOT NULL
    )
  `);

  console.log('Seeding initial mock data...');

  // Seed Employees
  console.log('Inserting seed employees...');
  await dbConnection.query(`
    INSERT INTO employees (name, email, gender, ethnicity, is_leadership, is_board, points) VALUES
    ('Aditya S.', 'aditya@ecosphere.com', 'Male', 'South Asian', FALSE, FALSE, 100),
    ('Sohan Shah', 'sohan@ecosphere.com', 'Male', 'South Asian', FALSE, FALSE, 30),
    ('Sarah Jenkins', 'sarah@ecosphere.com', 'Female', 'White', TRUE, FALSE, 200),
    ('Maria Lopez', 'maria@ecosphere.com', 'Female', 'Hispanic', TRUE, TRUE, 150),
    ('John Doe', 'john@ecosphere.com', 'Male', 'White', FALSE, TRUE, 80),
    ('Alex Chen', 'alex@ecosphere.com', 'Other', 'East Asian', FALSE, FALSE, 50)
  `);

  // Seed Trainings
  console.log('Inserting seed trainings...');
  await dbConnection.query(`
    INSERT INTO trainings (id, name, description, required_hours) VALUES
    (1, 'Safety & Environmental Health', 'Covers hazard prevention, waste disposal, and recycling protocols.', 3),
    (2, 'Diversity & Inclusion in Workplace', 'Fosters an inclusive workplace culture and unconscious bias training.', 2),
    (3, 'Data Privacy & Security Policies', 'Outlines details on personal data compliance, protection rules, and cybersecurity.', 4),
    (4, 'Ethical Decision Making', 'Introduction to the corporate compliance code and governance regulations.', 2)
  `);

  // Seed CSR Activities with Prerequisites
  console.log('Inserting seed CSR activities...');
  await dbConnection.query(`
    INSERT INTO csr_activities (name, category, description, points, icon, prerequisite_training_id) VALUES
    ('Tree Plantation', 'Environmental', 'Participate in planting local native trees. Earn 50 points.', 50, 'forest', 1),
    ('Blood Donation', 'Social / Health', 'Participate in our quarterly corporate blood drive. Earn 30 points.', 30, 'volunteer_activism', NULL),
    ('Climate Change Seminar', 'Education', 'Learn about environmental impacts and carbon metrics. Earn 20 points.', 20, 'school', NULL),
    ('ESG Workshop', 'Governance', 'Understand ESG configuration policies and compliance. Earn 30 points.', 30, 'gavel', 4)
  `);

  // Fetch seeded employees and activities to link them
  const [dbEmployees] = await dbConnection.query('SELECT id, name FROM employees');
  const [dbActivities] = await dbConnection.query('SELECT id, name FROM csr_activities');

  const aditya = dbEmployees.find(e => e.name === 'Aditya S.');
  const sohan = dbEmployees.find(e => e.name === 'Sohan Shah');
  const sarah = dbEmployees.find(e => e.name === 'Sarah Jenkins');
  const maria = dbEmployees.find(e => e.name === 'Maria Lopez');

  const treePlantation = dbActivities.find(a => a.name === 'Tree Plantation');
  const esgWorkshop = dbActivities.find(a => a.name === 'ESG Workshop');
  const bloodDonation = dbActivities.find(a => a.name === 'Blood Donation');
  const seminar = dbActivities.find(a => a.name === 'Climate Change Seminar');

  // Seed Employee Trainings
  console.log('Inserting seed employee trainings...');
  if (aditya) {
    await dbConnection.query(`INSERT INTO employee_trainings (employee_id, training_id, status, completion_date) VALUES (?, 1, 'Completed', NOW())`, [aditya.id]);
    await dbConnection.query(`INSERT INTO employee_trainings (employee_id, training_id, status) VALUES (?, 2, 'In Progress')`, [aditya.id]);
  }
  if (sohan) {
    await dbConnection.query(`INSERT INTO employee_trainings (employee_id, training_id, status, completion_date) VALUES (?, 2, 'Completed', NOW())`, [sohan.id]);
  }
  if (sarah) {
    await dbConnection.query(`INSERT INTO employee_trainings (employee_id, training_id, status, completion_date) VALUES (?, 3, 'Completed', NOW())`, [sarah.id]);
    await dbConnection.query(`INSERT INTO employee_trainings (employee_id, training_id, status, completion_date) VALUES (?, 4, 'Completed', NOW())`, [sarah.id]);
  }
  if (maria) {
    await dbConnection.query(`INSERT INTO employee_trainings (employee_id, training_id, status, completion_date) VALUES (?, 2, 'Completed', NOW())`, [maria.id]);
  }

  // Seed Participations
  console.log('Inserting seed participations...');
  if (aditya && treePlantation) {
    await dbConnection.query(`
      INSERT INTO employee_participations (employee_id, activity_id, proof, status, points, hours_spent, employee_notes) VALUES
      (?, ?, 'Docx.pdf', 'Pending', 50, 4, 'Planted 5 pine saplings in the local park.')
    `, [aditya.id, treePlantation.id]);
  }

  if (sohan && esgWorkshop) {
    await dbConnection.query(`
      INSERT INTO employee_participations (employee_id, activity_id, proof, status, points, hours_spent, employee_notes) VALUES
      (?, ?, 'image.png', 'Approved', 30, 2, 'Attended governance and business integrity training.')
    `, [sohan.id, esgWorkshop.id]);
  }

  if (sarah && bloodDonation) {
    await dbConnection.query(`
      INSERT INTO employee_participations (employee_id, activity_id, proof, status, points, hours_spent, employee_notes) VALUES
      (?, ?, 'donation_cert.pdf', 'Approved', 30, 1, 'Donated 1 unit of O+ blood.')
    `, [sarah.id, bloodDonation.id]);
  }

  if (maria && seminar) {
    await dbConnection.query(`
      INSERT INTO employee_participations (employee_id, activity_id, proof, status, points, hours_spent, employee_notes) VALUES
      (?, ?, 'seminar_ticket.pdf', 'Approved', 20, 3, 'Learned about emission reporting methodologies.')
    `, [maria.id, seminar.id]);
  }

  // Seed Settings
  console.log('Inserting seed settings...');
  await dbConnection.query(`
    INSERT INTO settings (setting_key, setting_value) VALUES
    ('evidence_requirement', '1')
  `);

  console.log('Database initialized and seeded successfully!');
  await dbConnection.end();
}

initializeDatabase().catch(err => {
  console.error('Initialization error:', err);
  process.exit(1);
});
