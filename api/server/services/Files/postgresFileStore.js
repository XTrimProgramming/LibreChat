const { Client } = require('pg');
const { logger } = require('@librechat/data-schemas');

const POSTGRES_URL = process.env.POSTGRES_URL ?? process.env.DATABASE_URL;
const TABLE_NAME = 'uploaded_files';
const COLUMNS = [
  'file_id',
  'user_id',
  'agent_id',
  'assistant_id',
  'conversation_id',
  'tool_resource',
  'filename',
  'filepath',
  'source',
  'context',
  'embedded',
  'created_at',
  'updated_at',
  'file_hash',
  'metadata',
  'last_synced_at',
];

let client;
let tableEnsured = false;

const getClient = async () => {
  if (!POSTGRES_URL) {
    return null;
  }
  if (!client) {
    client = new Client({ connectionString: POSTGRES_URL });
    await client.connect();
  }
  return client;
};

const normalizeDate = (value) => (value ? new Date(value) : null);

const normalizeFile = (file) => ({
  file_id: file.file_id,
  user_id: file.user ?? file.user_id ?? null,
  agent_id: file.agent_id ?? file.metadata?.agent_id ?? null,
  assistant_id: file.assistant_id ?? file.metadata?.assistant_id ?? null,
  conversation_id: file.conversationId ?? file.conversation_id ?? file.metadata?.conversation_id ?? null,
  tool_resource: file.tool_resource ?? file.metadata?.tool_resource ?? null,
  filename: file.filename,
  filepath: file.filepath,
  source: file.source,
  context: file.context,
  embedded: file.embedded ?? false,
  created_at: normalizeDate(file.createdAt) ?? normalizeDate(file.created_at),
  updated_at: normalizeDate(file.updatedAt) ?? normalizeDate(file.updated_at),
  file_hash: file.metadata?.fileHash ?? file.metadata?.hash ?? file.file_hash ?? null,
  metadata: file.metadata ?? null,
});

const ensureTable = async () => {
  const db = await getClient();
  if (!db || tableEnsured) {
    return;
  }
  await db.query(`
    CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
      id SERIAL PRIMARY KEY,
      file_id TEXT UNIQUE NOT NULL,
      user_id TEXT,
      agent_id TEXT,
      assistant_id TEXT,
      conversation_id TEXT,
      tool_resource TEXT,
      filename TEXT,
      filepath TEXT,
      source TEXT,
      context TEXT,
      embedded BOOLEAN,
      created_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ,
      file_hash TEXT,
      metadata JSONB,
      last_synced_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_${TABLE_NAME}_user_id ON ${TABLE_NAME}(user_id);`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_${TABLE_NAME}_conversation_id ON ${TABLE_NAME}(conversation_id);`);
  tableEnsured = true;
};

const runQuery = async (query, params) => {
  const db = await getClient();
  if (!db) {
    return null;
  }
  try {
    return await db.query(query, params);
  } catch (error) {
    logger.error('[postgresFileStore] Query error', error);
    return null;
  }
};

const upsertFile = async (file) => {
  const db = await getClient();
  if (!db) {
    return;
  }
  await ensureTable();
  const normalized = normalizeFile(file);
  const values = COLUMNS.map((column) => normalized[column]);
  const placeholders = values.map((_, index) => `$${index + 1}`).join(', ');
  const updates = COLUMNS.slice(1)
    .map((column) => `${column} = EXCLUDED.${column}`)
    .join(', ');

  await db.query(
    `INSERT INTO ${TABLE_NAME} (${COLUMNS.join(', ')}) VALUES (${placeholders})
     ON CONFLICT (file_id) DO UPDATE SET ${updates}, last_synced_at = NOW()`,
    values,
  );
};

const findFileByHash = async (fileHash) => {
  if (!fileHash) {
    return null;
  }
  const db = await getClient();
  if (!db) {
    return null;
  }
  await ensureTable();
  const result = await runQuery(`SELECT * FROM ${TABLE_NAME} WHERE file_hash = $1 LIMIT 1`, [fileHash]);
  return result?.rows?.[0] ?? null;
};

const closeConnection = async () => {
  if (client) {
    await client.end();
    client = null;
    tableEnsured = false;
  }
};

module.exports = {
  ensureTable,
  upsertFile,
  findFileByHash,
  closeConnection,
};
