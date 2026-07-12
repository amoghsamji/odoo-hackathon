import { Model, DataTypes } from 'sequelize';
import sequelize from '../config/database';

export class EnvironmentalGoal extends Model {
  declare id: number;
  declare title: string;
  declare targetValue: number;
  declare currentValue: number;
  declare unit: string;
  declare deadline: Date;
  declare status: string;
  declare departmentId: number | null;
  declare department?: any;
}

EnvironmentalGoal.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    targetValue: {
      type: DataTypes.DOUBLE,
      allowNull: false,
    },
    currentValue: {
      type: DataTypes.DOUBLE,
      allowNull: false,
      defaultValue: 0.0,
    },
    unit: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    deadline: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'Active', // Active, Achieved, Failed
    },
    departmentId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'Departments',
        key: 'id',
      },
    },
  },
  {
    sequelize,
    modelName: 'EnvironmentalGoal',
    tableName: 'EnvironmentalGoals',
    timestamps: false,
  }
);

export default EnvironmentalGoal;
