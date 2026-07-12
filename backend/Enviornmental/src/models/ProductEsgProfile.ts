import { Model, DataTypes } from 'sequelize';
import sequelize from '../config/database';

export class ProductEsgProfile extends Model {
  declare id: number;
  declare productName: string;
  declare sku: string;
  declare carbonFootprintScore: number;
  declare sustainabilityRating: string;
}

ProductEsgProfile.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    productName: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    sku: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    carbonFootprintScore: {
      type: DataTypes.DOUBLE,
      allowNull: false,
    },
    sustainabilityRating: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    sequelize,
    modelName: 'ProductEsgProfile',
    tableName: 'ProductEsgProfiles',
    timestamps: false,
  }
);

export default ProductEsgProfile;
