import mongoose from 'mongoose';
import env from './env.js';

mongoose.set('strictQuery', true);

export async function connectDB() {
  try {
    const conn = await mongoose.connect(env.mongoUri, {
      serverSelectionTimeoutMS: 8000,
    });
    console.log(`[db] MongoDB connected → ${conn.connection.host}/${conn.connection.name}`);
    return conn;
  } catch (err) {
    console.error('[db] Connection failed:', err.message);
    console.error('[db] Is mongod running? Try: mongod --dbpath <your-data-dir>');
    process.exit(1);
  }
}

export async function disconnectDB() {
  await mongoose.connection.close();
  console.log('[db] MongoDB disconnected');
}

export default connectDB;
