#!/usr/bin/env node
'use strict';

const path = require('node:path');
const mongoose = require('mongoose');
const { File } = require('../api/db/models');
const {
  ensureTable,
  upsertFile,
  closeConnection,
} = require('../api/server/services/Files/postgresFileStore');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });

const MONGO_URI =
  process.env.MONGO_URI ??
  process.env.MONGODB_URI ??
  process.env.LIBRECHAT_MONGO_URI ??
  'mongodb://localhost:27017/librechat';

async function main() {
  if (!process.env.POSTGRES_URL && !process.env.DATABASE_URL) {
    throw new Error('POSTGRES_URL or DATABASE_URL must be set in your environment');
  }

  mongoose.set('strictQuery', true);
  await mongoose.connect(MONGO_URI, { dbName: 'librechat' });
  await ensureTable();

  const cursor = File.find().lean().cursor();
  let count = 0;

  for await (const file of cursor) {
    if (!file.file_id) {
      continue;
    }
    await upsertFile(file);
    count += 1;
  }

  await closeConnection();
  await mongoose.disconnect();

  console.log(`Synced ${count.toLocaleString()} files to Postgres.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
