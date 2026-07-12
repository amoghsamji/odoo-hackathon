import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { initializeDatabase, sequelize } from './config/database';
import { QueryTypes } from 'sequelize';
import environmentalRoutes from './routes/environmentalRoutes';
import socialRoutes from './routes/socialRoutes';
import governanceRoutes from './routes/governanceRoutes';
import gamificationRoutes from './routes/gamificationRoutes';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS so the local frontend can communicate with the backend
app.use(cors());
app.use(express.json());

// Mount REST routes
app.use('/api/environmental', environmentalRoutes);
app.use('/api', socialRoutes);
app.use('/api', governanceRoutes);
app.use('/api', gamificationRoutes);

// Global Search endpoint
app.get('/api/search', async (req, res) => {
  const query = req.query.q as string;
  if (!query || query.trim() === '') {
    return res.json({
      environmental: [],
      social: [],
      governance: [],
      gamification: []
    });
  }

  const searchVal = `%${query.trim().toLowerCase()}%`;

  try {
    // 1. Search Environmental
    const envFactors = await sequelize.query(
      'SELECT id, name, category FROM emissionfactors WHERE LOWER(name) LIKE ? OR LOWER(category) LIKE ? LIMIT 5',
      { replacements: [searchVal, searchVal], type: QueryTypes.SELECT }
    ) as any[];

    const envProducts = await sequelize.query(
      'SELECT id, productName, sku FROM productesgprofiles WHERE LOWER(productName) LIKE ? OR LOWER(sku) LIKE ? LIMIT 5',
      { replacements: [searchVal, searchVal], type: QueryTypes.SELECT }
    ) as any[];

    const envGoals = await sequelize.query(
      'SELECT id, title, unit FROM environmentalgoals WHERE LOWER(title) LIKE ? OR LOWER(unit) LIKE ? LIMIT 5',
      { replacements: [searchVal, searchVal], type: QueryTypes.SELECT }
    ) as any[];

    // 2. Search Social
    const socialActivities = await sequelize.query(
      'SELECT id, name, category, description FROM csr_activities WHERE LOWER(name) LIKE ? OR LOWER(category) LIKE ? OR LOWER(description) LIKE ? LIMIT 5',
      { replacements: [searchVal, searchVal, searchVal], type: QueryTypes.SELECT }
    ) as any[];

    const socialTrainings = await sequelize.query(
      'SELECT id, name, description FROM trainings WHERE LOWER(name) LIKE ? OR LOWER(description) LIKE ? LIMIT 5',
      { replacements: [searchVal, searchVal], type: QueryTypes.SELECT }
    ) as any[];

    // 3. Search Governance
    const govPolicies = await sequelize.query(
      'SELECT id, title, description, owner_name FROM esg_policies WHERE LOWER(title) LIKE ? OR LOWER(description) LIKE ? OR LOWER(owner_name) LIKE ? LIMIT 5',
      { replacements: [searchVal, searchVal, searchVal], type: QueryTypes.SELECT }
    ) as any[];

    const govAudits = await sequelize.query(
      'SELECT id, title, auditor, status FROM audits WHERE LOWER(title) LIKE ? OR LOWER(auditor) LIKE ? LIMIT 5',
      { replacements: [searchVal, searchVal], type: QueryTypes.SELECT }
    ) as any[];

    const govIssues = await sequelize.query(
      'SELECT id, description, owner_name, severity, status FROM compliance_issues WHERE LOWER(description) LIKE ? OR LOWER(owner_name) LIKE ? LIMIT 5',
      { replacements: [searchVal, searchVal], type: QueryTypes.SELECT }
    ) as any[];

    // 4. Search Gamification
    const gameChallenges = await sequelize.query(
      'SELECT id, title, description, difficulty FROM challenges WHERE LOWER(title) LIKE ? OR LOWER(description) LIKE ? LIMIT 5',
      { replacements: [searchVal, searchVal], type: QueryTypes.SELECT }
    ) as any[];

    const gameBadges = await sequelize.query(
      'SELECT id, name, description FROM badges WHERE LOWER(name) LIKE ? OR LOWER(description) LIKE ? LIMIT 5',
      { replacements: [searchVal, searchVal], type: QueryTypes.SELECT }
    ) as any[];

    const gameRewards = await sequelize.query(
      'SELECT id, name, description FROM rewards WHERE LOWER(name) LIKE ? OR LOWER(description) LIKE ? LIMIT 5',
      { replacements: [searchVal, searchVal], type: QueryTypes.SELECT }
    ) as any[];

    res.json({
      environmental: [
        ...envFactors.map(f => ({ type: 'Emission Factor', title: f.name, subtitle: `${f.category}`, link: 'environmental.html#factors' })),
        ...envProducts.map(p => ({ type: 'Product Profile', title: p.productName, subtitle: `SKU: ${p.sku}`, link: 'environmental.html#profiles' })),
        ...envGoals.map(g => ({ type: 'Sustainability Goal', title: g.title, subtitle: `Unit: ${g.unit}`, link: 'environmental.html#goals' }))
      ],
      social: [
        ...socialActivities.map(a => ({ type: 'CSR Activity', title: a.name, subtitle: `${a.category}: ${a.description}`, link: 'social.html#activities' })),
        ...socialTrainings.map(t => ({ type: 'Training Program', title: t.name, subtitle: t.description, link: 'social.html#trainings' }))
      ],
      governance: [
        ...govPolicies.map(p => ({ type: 'ESG Policy', title: p.title, subtitle: `Owner: ${p.owner_name} | ${p.description}`, link: 'governance.html#policies' })),
        ...govAudits.map(a => ({ type: 'Audit Record', title: a.title, subtitle: `Auditor: ${a.auditor} (${a.status})`, link: 'governance.html#audits' })),
        ...govIssues.map(i => ({ type: 'Compliance Issue', title: i.description, subtitle: `Owner: ${i.owner_name} | Severity: ${i.severity}`, link: 'governance.html#issues' }))
      ],
      gamification: [
        ...gameChallenges.map(c => ({ type: 'Challenge', title: c.title, subtitle: `${c.difficulty} | ${c.description}`, link: 'gamification.html#challenges' })),
        ...gameBadges.map(b => ({ type: 'Milestone Badge', title: b.name, subtitle: b.description, link: 'gamification.html#badges' })),
        ...gameRewards.map(r => ({ type: 'Reward Item', title: r.name, subtitle: r.description, link: 'gamification.html#rewards' }))
      ]
    });
  } catch (error: any) {
    console.error('[Global Search API] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date() });
});

// Welcome and API Directory endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    message: 'Welcome to the EcoSphere ESG Platform Backend - Environmental Module',
    version: '1.0.0',
    endpoints: [
      { method: 'GET', path: '/health', description: 'API Health status check' },
      { method: 'GET', path: '/api/environmental/dashboard', description: 'Fetch company-wide aggregated dashboard metrics' },
      { method: 'GET', path: '/api/environmental/emission-factors', description: 'List all carbon emission factors' },
      { method: 'POST', path: '/api/environmental/emission-factors', description: 'Create a new carbon emission factor' },
      { method: 'POST', path: '/api/environmental/carbon-transactions', description: 'Record manual or automated ERP carbon activities' },
      { method: 'GET', path: '/api/environmental/departments/:id/carbon-tracking', description: 'Retrieve department-specific carbon metrics and goals' },
      { method: 'GET', path: '/api/environmental/goals', description: 'List all active sustainability goals' },
      { method: 'POST', path: '/api/environmental/goals', description: 'Create a new sustainability goal' },
      { method: 'GET', path: '/api/environmental/report', description: 'Filter raw transactions for the Environmental Report' },
      { method: 'GET', path: '/api/environmental/products', description: 'List product ESG profiles' },
      { method: 'POST', path: '/api/environmental/products', description: 'Create a product ESG profile' },
      { method: 'POST', path: '/api/environmental/auth/login', description: 'Authenticate users for role-based portal access' }
    ]
  });
});

async function startServer() {
  try {
    // 1. Verify and create the MySQL database if not exists
    await initializeDatabase();

    // 2. Sync all Sequelize models (creates tables if they do not exist)
    // Using force: false to avoid dropping existing data on restart.
    await sequelize.sync({ force: false });
    console.log('Database tables verified/created successfully.');

    // 3. Start Express server
    app.listen(PORT, () => {
      console.log(`[Server] EcoSphere Backend running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Only start the server when this file is run directly (useful for tests/seeding)
if (require.main === module || process.env.NODE_ENV !== 'test') {
  startServer();
}

export default app;
