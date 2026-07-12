import { Sequelize } from 'sequelize';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const connectionUri = process.env.DATABASE_URL || 'mysql://root:@localhost:3306/ecosphere_db';

const parseConnectionUri = (uri: string) => {
  // Matches mysql://user:password@host:port/database or mysql://user@host:port/database
  const match = uri.match(/mysql:\/\/([^:]*):?([^@]*)@([^:]*):?(\d*)\/(.*)/);
  if (!match) {
    throw new Error('Invalid DATABASE_URL format');
  }
  const [, user, password, host, port, database] = match;
  return { user, password, host, port: parseInt(port || '3306', 10), database };
};

export const initializeDatabase = async () => {
  const { user, password, host, port, database } = parseConnectionUri(connectionUri);
  
  const connection = await mysql.createConnection({
    host,
    user: user || 'root',
    password: password || undefined,
    port: port || 3306,
  });
  
  await connection.query(`CREATE DATABASE IF NOT EXISTS \`${database}\`;`);
  await connection.end();
  console.log(`Database '${database}' verified/created successfully.`);
};

export const sequelize = new Sequelize(connectionUri, {
  dialect: 'mysql',
  logging: false,
  define: {
    timestamps: false, // Disabling globally to match Prisma's default behavior, except where specified
  }
});
export default sequelize;
