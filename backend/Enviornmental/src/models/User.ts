import { Model, DataTypes } from 'sequelize';
import sequelize from '../config/database';

export class User extends Model {
  declare id: number;
  declare username: string;
  declare password: string;
  declare name: string;
  declare role: string; // CEO, CTO, DepartmentHead, Employee
  declare departmentId: number | null;
  declare department?: any;
}

User.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    username: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    password: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    role: {
      type: DataTypes.STRING,
      allowNull: false, // CEO, CTO, DepartmentHead, Employee
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
    modelName: 'User',
    tableName: 'Users',
    timestamps: false,
  }
);

export default User;
