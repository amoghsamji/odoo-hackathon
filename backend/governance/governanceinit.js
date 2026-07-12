const mysql = require('mysql2/promise');
require('dotenv').config();

async function init() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
  });

  await connection.query(`CREATE DATABASE IF NOT EXISTS \`${process.env.DB_NAME || 'ecosphere_db'}\`;`);
  await connection.end();

  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'ecosphere_db',
  });

  console.log('Initializing Governance tables...');

  // Policies
  await pool.query(`
    CREATE TABLE IF NOT EXISTS esg_policies (
      id INT AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      description TEXT NOT NULL,
      owner_name VARCHAR(255) NOT NULL,
      status ENUM('Active', 'Archived') DEFAULT 'Active',
      effective_date DATE NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Policy Acknowledgements
  await pool.query(`
    CREATE TABLE IF NOT EXISTS policy_acknowledgements (
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

  // Audits
  await pool.query(`
    CREATE TABLE IF NOT EXISTS audits (
      id INT AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      auditor VARCHAR(255) NOT NULL,
      audit_date DATE NOT NULL,
      status ENUM('Draft', 'In Progress', 'Completed') DEFAULT 'Draft',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Compliance Issues
  await pool.query(`
    CREATE TABLE IF NOT EXISTS compliance_issues (
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

  // Notifications
  await pool.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INT AUTO_INCREMENT PRIMARY KEY,
      type VARCHAR(50) NOT NULL,
      message TEXT NOT NULL,
      is_read BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Seed default data if empty
  const [policies] = await pool.query('SELECT id FROM esg_policies');
  if (policies.length === 0) {
    await pool.query(`
      INSERT INTO esg_policies (title, description, owner_name, status, effective_date) VALUES
      ('Code of Conduct', 'Comprehensive compliance guidelines and ethical operational code for all employees.', 'Marcus Reed', 'Active', '2026-01-10'),
      ('Supplier Code of Conduct', 'Outlines vendor ethical requirements, sustainability compliance, and carbon footprint targets.', 'Sarah Jenkins', 'Active', '2026-02-15'),
      ('Information Security & Data Privacy', 'Compliance controls for safeguarding corporate data and customer privacy.', 'Marcus Reed', 'Active', '2026-03-01')
    `);
  }

  const [audits] = await pool.query('SELECT id FROM audits');
  if (audits.length === 0) {
    await pool.query(`
      INSERT INTO audits (title, auditor, audit_date, status) VALUES
      ('Q3 Internal Controls Audit', 'Internal Risk Team', '2026-10-10', 'In Progress'),
      ('ISO 14001 Surveillance Audit', 'Bureau Veritas', '2026-11-15', 'Draft')
    `);
  }

  const [issues] = await pool.query('SELECT id FROM compliance_issues');
  if (issues.length === 0) {
    await pool.query(`
      INSERT INTO compliance_issues (audit_id, description, severity, owner_name, due_date, status) VALUES
      (1, 'Data Privacy Policy Update Delay (EU Region)', 'High', 'Marcus Reed', '2026-06-15', 'Flagged'),
      (1, 'Supplier Code of Conduct Missing Acknowledgements', 'Medium', 'Sarah Jenkins', '2026-11-02', 'Open'),
      (NULL, 'Q3 Board Diversity Reporting Gap', 'Low', 'Maria Lopez', '2026-05-30', 'Resolved')
    `);
  }

  // Populate Policy Acknowledgements for existing employees if empty
  const [acks] = await pool.query('SELECT id FROM policy_acknowledgements');
  if (acks.length === 0) {
    const [dbEmployees] = await pool.query('SELECT id, name FROM employees');
    const [dbPolicies] = await pool.query('SELECT id, title FROM esg_policies');

    for (const p of dbPolicies) {
      for (const e of dbEmployees) {
        // Sarah Jenkins and Marcus Reed have already signed off Code of Conduct
        let status = 'Pending';
        let ackAt = null;
        if (p.title === 'Code of Conduct' && (e.name === 'Sarah Jenkins' || e.name === 'Aditya S.')) {
          status = 'Acknowledged';
          ackAt = new Date();
        }
        await pool.query(
          'INSERT INTO policy_acknowledgements (policy_id, employee_id, status, acknowledged_at) VALUES (?, ?, ?, ?)',
          [p.id, e.id, status, ackAt]
        );
      }
    }
  }

  console.log('Governance database initialized.');
  await pool.end();
  process.exit(0);
}

init().catch(err => {
  console.error(err);
  process.exit(1);
});
