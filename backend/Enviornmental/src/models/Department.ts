import { Model, DataTypes } from 'sequelize';
import sequelize from '../config/database';

export class Department extends Model {
  declare id: number;
  declare name: string;
  declare code: string;
  declare head: string | null;
  declare parentDepartmentId: number | null;
  declare employeeCount: number;
  declare status: string;
  declare score?: any;
  declare goals?: any[];
  declare carbonTransactions?: any[];
}

Department.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    code: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    head: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    parentDepartmentId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'Departments',
        key: 'id',
      },
    },
    employeeCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'Active',
    },
  },
  {
    sequelize,
    modelName: 'Department',
    tableName: 'Departments',
    timestamps: false,
  }
);

export default Department;
