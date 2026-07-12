import { Model, DataTypes } from 'sequelize';
import sequelize from '../config/database';

export class DepartmentScore extends Model {
  declare id: number;
  declare departmentId: number;
  declare environmentalScore: number;
  declare socialScore: number;
  declare governanceScore: number;
  declare totalScore: number;
  declare updatedAt: Date;
}

DepartmentScore.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    departmentId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      unique: true,
      references: {
        model: 'Departments',
        key: 'id',
      },
    },
    environmentalScore: {
      type: DataTypes.DOUBLE,
      allowNull: false,
      defaultValue: 0.0,
    },
    socialScore: {
      type: DataTypes.DOUBLE,
      allowNull: false,
      defaultValue: 0.0,
    },
    governanceScore: {
      type: DataTypes.DOUBLE,
      allowNull: false,
      defaultValue: 0.0,
    },
    totalScore: {
      type: DataTypes.DOUBLE,
      allowNull: false,
      defaultValue: 0.0,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    modelName: 'DepartmentScore',
    tableName: 'DepartmentScores',
    timestamps: true,
    updatedAt: 'updatedAt',
    createdAt: false,
  }
);

export default DepartmentScore;
