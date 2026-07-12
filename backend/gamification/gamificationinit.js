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

  console.log('Initializing Gamification tables...');

  // Ensure employees has xp column
  try {
    await pool.query('ALTER TABLE employees ADD COLUMN xp INT DEFAULT 0 AFTER points');
    console.log('Added xp column to employees.');
  } catch (e) {
    // Column already exists or table doesn't exist yet
  }

  // Challenges
  await pool.query(`
    CREATE TABLE IF NOT EXISTS challenges (
      id INT AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      description TEXT NOT NULL,
      xp INT NOT NULL,
      difficulty ENUM('Easy', 'Medium', 'Hard') DEFAULT 'Easy',
      evidence_required BOOLEAN DEFAULT FALSE,
      deadline DATE NOT NULL,
      status ENUM('Draft', 'Active', 'Under Review', 'Completed', 'Archived') DEFAULT 'Draft',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Challenge Participations
  await pool.query(`
    CREATE TABLE IF NOT EXISTS challenge_participations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      challenge_id INT NOT NULL,
      employee_id INT NOT NULL,
      progress INT DEFAULT 0,
      proof VARCHAR(255) NULL,
      status ENUM('Pending', 'Approved', 'Rejected') DEFAULT 'Pending',
      xp_awarded INT DEFAULT 0,
      completion_date TIMESTAMP NULL,
      FOREIGN KEY (challenge_id) REFERENCES challenges(id) ON DELETE CASCADE,
      FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
      UNIQUE KEY unique_participation (challenge_id, employee_id)
    )
  `);

  // Badges
  await pool.query(`
    CREATE TABLE IF NOT EXISTS badges (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      description TEXT NOT NULL,
      unlock_rule VARCHAR(255) NOT NULL,
      icon VARCHAR(100) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Employee Badges
  await pool.query(`
    CREATE TABLE IF NOT EXISTS employee_badges (
      id INT AUTO_INCREMENT PRIMARY KEY,
      employee_id INT NOT NULL,
      badge_id INT NOT NULL,
      awarded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
      FOREIGN KEY (badge_id) REFERENCES badges(id) ON DELETE CASCADE,
      UNIQUE KEY unique_badge (employee_id, badge_id)
    )
  `);

  // Rewards
  await pool.query(`
    CREATE TABLE IF NOT EXISTS rewards (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      description TEXT NOT NULL,
      points_required INT NOT NULL,
      stock INT NOT NULL,
      status ENUM('Active', 'Inactive') DEFAULT 'Active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Redemptions
  await pool.query(`
    CREATE TABLE IF NOT EXISTS redemptions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      employee_id INT NOT NULL,
      reward_id INT NOT NULL,
      redeemed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
      FOREIGN KEY (reward_id) REFERENCES rewards(id) ON DELETE CASCADE
    )
  `);

  // Seed default data if empty
  const [challenges] = await pool.query('SELECT id FROM challenges');
  if (challenges.length === 0) {
    await pool.query(`
      INSERT INTO challenges (title, description, xp, difficulty, evidence_required, deadline, status) VALUES
      ('Sustainability Sprint', 'Complete 5 carbon logging tasks this week.', 200, 'Hard', TRUE, '2026-07-20', 'Active'),
      ('Recycle Challenge', 'Log plastic recycling activities daily.', 80, 'Easy', FALSE, '2026-07-15', 'Active'),
      ('Commute Green Week', 'Cycle or walk to work for 5 days.', 120, 'Medium', TRUE, '2026-07-25', 'Draft')
    `);
  }

  const [badges] = await pool.query('SELECT id FROM badges');
  if (badges.length === 0) {
    await pool.query(`
      INSERT INTO badges (name, description, unlock_rule, icon) VALUES
      ('Green Beginner', 'Awarded when employee gets at least 500 XP.', 'min_xp:500', 'eco'),
      ('Carbon Saver', 'Awarded when employee completes 2 approved challenges.', 'challenges:2', 'local_fire_department'),
      ('Sustainability Champion', 'Awarded when employee reaches 2000 XP.', 'min_xp:2000', 'workspace_premium'),
      ('Team Player', 'Awarded when employee completes first challenge.', 'challenges:1', 'group')
    `);
  }

  const [rewards] = await pool.query('SELECT id FROM rewards');
  if (rewards.length === 0) {
    await pool.query(`
      INSERT INTO rewards (name, description, points_required, stock, status) VALUES
      ('Reusable Coffee Cup', 'High-quality bamboo fiber travel mug.', 500, 10, 'Active'),
      ('Donation: Plant a Tree', 'Donate a sapling planting in your name.', 800, 50, 'Active'),
      ('E-Scooter Rental (1 Wk)', 'One-week subscription card for city micro-mobility.', 2500, 0, 'Active')
    `);
  }

  console.log('Gamification database initialized.');
  await pool.end();
  process.exit(0);
}

init().catch(err => {
  console.error(err);
  process.exit(1);
});
