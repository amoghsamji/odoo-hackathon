import { Model, DataTypes } from 'sequelize';
import sequelize from '../config/database';

export class EmissionFactor extends Model {
  declare id: number;
  declare name: string;
  declare category: string;
  declare value: number;
  declare unit: string;
  declare status: string;
}

EmissionFactor.init(
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
    category: {
      type: DataTypes.STRING,
      allowNull: false, // Fleet, Manufacturing, Purchase, Expense
    },
    value: {
      type: DataTypes.DOUBLE,
      allowNull: false, // carbon per unit
    },
    unit: {
      type: DataTypes.STRING,
      allowNull: false, // e.g., kWh, km, kg
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'Active',
    },
  },
  {
    sequelize,
    modelName: 'EmissionFactor',
    tableName: 'EmissionFactors',
    timestamps: false,
  }
);

export default EmissionFactor;
