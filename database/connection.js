'use strict';

const config = require('../config/agendamento');

let pool = null;

function exigirDatabaseUrl() {
  if (!config.DATABASE_URL) {
    const error = new Error(
      'DATABASE_URL não configurada. Crie o banco no Neon e adicione a connection string nas variáveis de ambiente.'
    );
    error.code = 'DATABASE_URL_AUSENTE';
    throw error;
  }
}

function obterPool() {
  exigirDatabaseUrl();

  if (!pool) {
    // Carregado de forma tardia para permitir `npm run check` mesmo antes de `npm install`.
    const { Pool } = require('pg');

    pool = new Pool({
      connectionString: config.DATABASE_URL,
      max: config.DB_POOL_MAX,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
      allowExitOnIdle: true,
    });

    pool.on('error', (error) => {
      console.error('[BANCO] Erro inesperado em conexão ociosa:', error);
    });
  }

  return pool;
}

async function query(text, params = [], client = null) {
  const executor = client || obterPool();
  return executor.query(text, params);
}

async function executarTransacao(callback, { isolamento = 'SERIALIZABLE' } = {}) {
  if (typeof callback !== 'function') {
    throw new Error('A transação precisa receber uma função.');
  }

  const client = await obterPool().connect();

  try {
    await client.query(`BEGIN ISOLATION LEVEL ${isolamento}`);
    const resultado = await callback(client);
    await client.query('COMMIT');
    return resultado;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {
      // Preserva o erro original.
    }
    throw error;
  } finally {
    client.release();
  }
}

async function fechar() {
  if (!pool) return;
  const atual = pool;
  pool = null;
  await atual.end();
}

module.exports = {
  obterPool,
  query,
  executarTransacao,
  fechar,
};
