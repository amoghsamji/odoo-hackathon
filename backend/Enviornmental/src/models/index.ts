import { Department } from './Department';
import { EmissionFactor } from './EmissionFactor';
import { ProductEsgProfile } from './ProductEsgProfile';
import { EnvironmentalGoal } from './EnvironmentalGoal';
import { CarbonTransaction } from './CarbonTransaction';
import { DepartmentScore } from './DepartmentScore';
import { User } from './User';

// Department Self-relation
Department.belongsTo(Department, {
  as: 'parentDepartment',
  foreignKey: 'parentDepartmentId',
});
Department.hasMany(Department, {
  as: 'childDepartments',
  foreignKey: 'parentDepartmentId',
});

// Department <-> EnvironmentalGoal
Department.hasMany(EnvironmentalGoal, {
  foreignKey: 'departmentId',
  as: 'goals',
  onDelete: 'CASCADE',
});
EnvironmentalGoal.belongsTo(Department, {
  foreignKey: 'departmentId',
  as: 'department',
});

// Department <-> CarbonTransaction
Department.hasMany(CarbonTransaction, {
  foreignKey: 'departmentId',
  as: 'carbonTransactions',
  onDelete: 'CASCADE',
});
CarbonTransaction.belongsTo(Department, {
  foreignKey: 'departmentId',
  as: 'department',
});

// EmissionFactor <-> CarbonTransaction
EmissionFactor.hasMany(CarbonTransaction, {
  foreignKey: 'emissionFactorId',
  as: 'carbonTransactions',
});
CarbonTransaction.belongsTo(EmissionFactor, {
  foreignKey: 'emissionFactorId',
  as: 'emissionFactor',
});

// Department <-> DepartmentScore
Department.hasOne(DepartmentScore, {
  foreignKey: 'departmentId',
  as: 'score',
  onDelete: 'CASCADE',
});
DepartmentScore.belongsTo(Department, {
  foreignKey: 'departmentId',
  as: 'department',
});

// Department <-> User
Department.hasMany(User, {
  foreignKey: 'departmentId',
  as: 'users',
  onDelete: 'SET NULL',
});
User.belongsTo(Department, {
  foreignKey: 'departmentId',
  as: 'department',
});

export {
  Department,
  EmissionFactor,
  ProductEsgProfile,
  EnvironmentalGoal,
  CarbonTransaction,
  DepartmentScore,
  User,
};
