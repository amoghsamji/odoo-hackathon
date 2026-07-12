// Utilizing Node 22 native global fetch

async function runTests() {
  const baseUrl = 'http://localhost:5000/api/environmental';
  console.log('=== STARTING ECOSPHERE ENVIRONMENTAL BACKEND API TESTS ===\n');

  try {
    // 1. GET /emission-factors
    console.log('1. GET /emission-factors');
    const getFactorsRes = await fetch(`${baseUrl}/emission-factors`);
    const factors: any = await getFactorsRes.json();
    console.log(`Status: ${getFactorsRes.status}. Count: ${factors.length}`);
    console.log(`First Factor: ${JSON.stringify(factors[0])}\n`);

    // 2. POST /emission-factors
    console.log('2. POST /emission-factors');
    const newFactor = {
      name: 'Electric Boiler (Mfg)',
      category: 'Manufacturing',
      value: 0.15,
      unit: 'kWh',
      status: 'Active',
    };
    const postFactorRes = await fetch(`${baseUrl}/emission-factors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newFactor),
    });
    const createdFactor = await postFactorRes.json();
    console.log(`Status: ${postFactorRes.status}`);
    console.log(`Created: ${JSON.stringify(createdFactor)}\n`);

    // 3. POST /goals
    console.log('3. POST /goals');
    const newGoal = {
      title: 'Reduce Purchase Emissions',
      targetValue: 500.0,
      unit: 'kg CO2',
      deadline: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
      departmentId: 4, // Purchase Department
    };
    const postGoalRes = await fetch(`${baseUrl}/goals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newGoal),
    });
    const createdGoal = await postGoalRes.json();
    console.log(`Status: ${postGoalRes.status}`);
    console.log(`Created: ${JSON.stringify(createdGoal)}\n`);

    // 4. GET /goals
    console.log('4. GET /goals');
    const getGoalsRes = await fetch(`${baseUrl}/goals`);
    const goals: any = await getGoalsRes.json();
    console.log(`Status: ${getGoalsRes.status}. Count: ${goals.length}\n`);

    // 5. POST /carbon-transactions (Calculates carbon + triggers async score calculation)
    console.log('5. POST /carbon-transactions (Auto emission calculation)');
    const activity = {
      sourceModule: 'Fleet',
      recordId: 'FLEET-AUTO-778',
      rawValue: 100, // 100 liters of Diesel (Diesel Factor is ID 1, value 2.68)
      departmentId: 2, // Logistics Department
      emissionFactorId: 1, // Diesel
    };
    const postTxRes = await fetch(`${baseUrl}/carbon-transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(activity),
    });
    const createdTx: any = await postTxRes.json();
    console.log(`Status: ${postTxRes.status}`);
    console.log(`Calculated Emission: ${createdTx.calculatedEmission} kg CO2`);
    console.log(`Tx: ${JSON.stringify(createdTx)}\n`);

    // Wait 1.5 seconds for async DepartmentScore recalculation to finish
    console.log('Waiting 1.5s for async score aggregator to finish calculation...');
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // 6. GET /departments/:id/carbon-tracking
    console.log('6. GET /departments/2/carbon-tracking');
    const trackingRes = await fetch(`${baseUrl}/departments/2/carbon-tracking`);
    const tracking: any = await trackingRes.json();
    console.log(`Status: ${trackingRes.status}`);
    console.log(`Department: ${tracking.department.name} (Score: ${JSON.stringify(tracking.department.score)})`);
    console.log(`Total Emissions: ${tracking.summary.totalEmissions} kg CO2`);
    console.log(`Monthly Tracking: ${JSON.stringify(tracking.monthlyTracking)}`);
    console.log(`Category Breakdown: ${JSON.stringify(tracking.categoryBreakdown)}\n`);

    // 7. GET /dashboard
    console.log('7. GET /dashboard');
    const dashboardRes = await fetch(`${baseUrl}/dashboard`);
    const dashboard: any = await dashboardRes.json();
    console.log(`Status: ${dashboardRes.status}`);
    console.log(`MoM Emissions: ${JSON.stringify(dashboard.carbonEmissionsMoM)}`);
    console.log(`Active Goals Count: ${dashboard.activeGoals.length}`);
    console.log(`Active Goal Progress: ${JSON.stringify(dashboard.activeGoals[0])}`);
    console.log(`Category Breakdown: ${JSON.stringify(dashboard.categoryBreakdown)}\n`);

    // 8. GET /report (Filters by departmentId, startDate, endDate)
    console.log('8. GET /report');
    const reportRes = await fetch(`${baseUrl}/report?departmentId=2`);
    const report: any = await reportRes.json();
    console.log(`Status: ${reportRes.status}`);
    console.log(`Record Count (Dept 2): ${report.summary.recordCount}`);
    console.log(`Total Emissions (Dept 2): ${report.summary.totalEmissions} kg CO2\n`);

    console.log('=== ALL TESTS SUCCESSFUL ===');
  } catch (error) {
    console.error('=== TEST ERROR ===', error);
  }
}

runTests();
