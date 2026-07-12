import { CarbonTransaction, EmissionFactor, EnvironmentalGoal, DepartmentScore, Department } from '../models';

/**
 * Auto Emission Calculation Engine
 * Calculates emissions for a specific ERP operational record, logs a CarbonTransaction,
 * and triggers an asynchronous update to the department score.
 */
export async function calculateCarbon(
  sourceModule: string,
  recordId: string,
  rawValue: number,
  departmentId: number,
  emissionFactorId: number
) {
  // 1. Fetch active emission factor
  const factor = await EmissionFactor.findOne({
    where: { id: emissionFactorId, status: 'Active' },
  });

  if (!factor) {
    throw new Error(`Active Emission Factor with ID ${emissionFactorId} not found.`);
  }

  // Verify Department exists
  const dept = await Department.findByPk(departmentId);
  if (!dept) {
    throw new Error(`Department with ID ${departmentId} not found.`);
  }

  // 2. Compute calculated emission: rawValue * value (carbon per unit)
  const calculatedEmission = rawValue * factor.value;

  // 3. Write a new entry to CarbonTransaction
  const transaction = await CarbonTransaction.create({
    sourceModule,
    recordId,
    rawValue,
    calculatedEmission,
    emissionFactorId,
    departmentId,
    timestamp: new Date(),
  });

  console.log(
    `[Emission Engine] Recorded carbon transaction ID ${transaction.id}: ` +
    `${calculatedEmission} kg CO2 calculated from ${rawValue} units of ${factor.name} for Department ${departmentId}.`
  );

  // 4. Trigger asynchronous update to DepartmentScore
  // We run this without 'await' to satisfy the asynchronous requirement, logging any errors.
  recalculateDepartmentScore(departmentId).catch((err) => {
    console.error(`[Score Engine] Async score update failed for department ${departmentId}:`, err);
  });

  return transaction;
}

/**
 * Department Score Aggregator
 * Recalculates department's environmentalScore based on the sum of its CarbonTransaction values
 * relative to its EnvironmentalGoal targets, and updates the DepartmentScore table.
 */
export async function recalculateDepartmentScore(departmentId: number) {
  console.log(`[Score Engine] Recalculating score for department ${departmentId}...`);

  // 1. Compute total carbon emissions for this department
  const totalEmissionsResult = await CarbonTransaction.sum('calculatedEmission', {
    where: { departmentId },
  });
  const totalEmissions = totalEmissionsResult || 0;

  // 2. Fetch all active goals for this department
  const activeGoals = await EnvironmentalGoal.findAll({
    where: {
      departmentId,
      status: 'Active',
    },
  });

  // 3. Update currentValue and status for these goals
  const now = new Date();
  for (const goal of activeGoals) {
    goal.currentValue = totalEmissions;
    
    // Check if goal has exceeded target or passed deadline
    if (goal.currentValue > goal.targetValue) {
      goal.status = 'Failed'; // Carbon exceeded target
      console.log(`[Score Engine] Goal '${goal.title}' failed: emissions (${goal.currentValue}) exceeded target (${goal.targetValue})`);
    } else if (now > goal.deadline) {
      goal.status = 'Achieved'; // Kept under target past deadline
      console.log(`[Score Engine] Goal '${goal.title}' achieved: emissions (${goal.currentValue}) stayed under target (${goal.targetValue})`);
    }
    
    await goal.save();
  }

  // 4. Calculate Environmental Score
  // Fetch all goals for the department to determine the score (Active and Achieved goals)
  const trackableGoals = await EnvironmentalGoal.findAll({
    where: {
      departmentId,
    },
  });

  let environmentalScore = 0;

  if (trackableGoals.length > 0) {
    let scoreSum = 0;
    for (const goal of trackableGoals) {
      if (goal.currentValue <= goal.targetValue) {
        scoreSum += 100;
      } else {
        // Penalize score proportionally to the excess emissions
        const excessRatio = goal.currentValue / goal.targetValue;
        const score = Math.max(0, Math.round((1 / excessRatio) * 100));
        scoreSum += score;
      }
    }
    environmentalScore = Math.round(scoreSum / trackableGoals.length);
  } else {
    // Default score logic if no goals are defined
    // Base score of 80, deduct 1 point for every 200 kg CO2 emitted, minimum 0
    environmentalScore = Math.max(0, 80 - Math.round(totalEmissions / 200));
  }

  // 5. Update or Create DepartmentScore record
  let scoreRecord = await DepartmentScore.findOne({
    where: { departmentId },
  });

  const socialScore = scoreRecord ? scoreRecord.socialScore : 70.0;
  const governanceScore = scoreRecord ? scoreRecord.governanceScore : 70.0;
  
  // Total score calculation: Environmental 40%, Social 30%, Governance 30%
  const totalScore = parseFloat(
    ((environmentalScore * 0.4) + (socialScore * 0.3) + (governanceScore * 0.3)).toFixed(2)
  );

  if (scoreRecord) {
    scoreRecord.environmentalScore = environmentalScore;
    scoreRecord.totalScore = totalScore;
    scoreRecord.updatedAt = new Date();
    await scoreRecord.save();
  } else {
    scoreRecord = await DepartmentScore.create({
      departmentId,
      environmentalScore,
      socialScore,
      governanceScore,
      totalScore,
      updatedAt: new Date(),
    });
  }

  console.log(
    `[Score Engine] Updated scores for Department ${departmentId} -> ` +
    `Environmental: ${environmentalScore}, Social: ${socialScore}, Governance: ${governanceScore}, Total: ${totalScore}`
  );

  return scoreRecord;
}
