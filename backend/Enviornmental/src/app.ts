import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { initializeDatabase, sequelize } from './config/database';
import environmentalRoutes from './routes/environmentalRoutes';
import socialRoutes from './routes/socialRoutes';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS so the local frontend can communicate with the backend
app.use(cors());
app.use(express.json());

// Mount REST routes
app.use('/api/environmental', environmentalRoutes);
app.use('/api', socialRoutes);

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
