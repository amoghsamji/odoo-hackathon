import { Router } from 'express';
import {
  createEmissionFactor,
  listEmissionFactors,
  recordCarbonTransaction,
  getDepartmentCarbonTracking,
  createGoal,
  listGoals,
  getDashboardMetrics,
  getEnvironmentalReport,
  createProductEsgProfile,
  listProductEsgProfiles,
  loginUser,
} from '../controllers/environmentalController';

const router = Router();

// Emission Factors
router.post('/emission-factors', createEmissionFactor);
router.get('/emission-factors', listEmissionFactors);

// Carbon Transactions
router.post('/carbon-transactions', recordCarbonTransaction);

// Department Carbon Tracking
router.get('/departments/:id/carbon-tracking', getDepartmentCarbonTracking);

// Environmental Goals
router.post('/goals', createGoal);
router.get('/goals', listGoals);

// Dashboard Metrics
router.get('/dashboard', getDashboardMetrics);

// Report Generation
router.get('/report', getEnvironmentalReport);

// Product ESG Profiles
router.post('/products', createProductEsgProfile);
router.get('/products', listProductEsgProfiles);

// Authentication
router.post('/auth/login', loginUser);

export default router;
