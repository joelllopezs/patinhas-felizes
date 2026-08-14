'use strict';

const fs = require('fs');
const path = require('path');
const db = require('../database/connection');
const config = require('../config/agendamento');

async function main() {
  if (!config.DATABASE_URL) {
    throw new Error('DATABASE_URL nao configurada. Copie a connection string do Neon para o arquivo .env.');
  }

  const schemaPath = path.join(__dirname, '..', 'database', 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');

  console.log('[DB] Aplicando database/schema.sql...');
  await db.query(schema);

  const { rows } = await db.query('SELECT current_database() AS banco, NOW() AS agora');
  console.log(`[DB] Estrutura pronta em ${rows[0].banco}.`);
}

main()
  .catch((error) => {
    console.error('[DB] Falha ao preparar o banco:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await db.fechar();
    } catch (_) {
      // Nada a fazer no encerramento.
    }
  });
