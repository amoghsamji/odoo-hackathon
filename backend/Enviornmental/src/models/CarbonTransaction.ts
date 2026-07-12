import { Model, DataTypes } from 'sequelize';
import sequelize from '../config/database';

export class CarbonTransaction extends Model {
  declare id: number;
  declare sourceModule: string;
  declare recordId: string;
  declare rawValue: number;
  declare calculatedEmission: number;
  declare emissionFactorId: number;
  declare departmentId: number;
  declare timestamp: Date;
}

CarbonTransaction.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    sourceModule: {
      type: DataTypes.STRING,
      allowNull: false, // Purchase, Manufacturing, Expense, Fleet
    },
    recordId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    rawValue: {
      type: DataTypes.DOUBLE,
      allowNull: false,
    },
    calculatedEmission: {
      type: DataTypes.DOUBLE,
      allowNull: false, // rawValue * EmissionFactor value
    },
    emissionFactorId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'EmissionFactors',
        key: 'id',
      },
    },
    departmentId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'Departments',
        key: 'id',
      },
    },
    timestamp: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    modelName: 'CarbonTransaction',
    tableName: 'CarbonTransactions',
    timestamps: false,
    indexes: [
      {
        fields: ['emissionFactorId'],
      },
      {
        fields: ['departmentId'],
      },
      {
        fields: ['timestamp'],
      },
    ],
  }
);

export default CarbonTransaction;
