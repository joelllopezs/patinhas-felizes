'use strict';

const db = require('../database/connection');

const JANELA_MINUTOS = 15;
const LIMITE_TENTATIVAS = 5;

async function buscar(chaveHash) {
  const { rows } = await db.query(
    `
      SELECT chave_hash, inicio, tentativas, bloqueado_ate
      FROM validacao_tentativas
      WHERE chave_hash = $1
      LIMIT 1
    `,
    [chaveHash]
  );

  return rows[0] || null;
}

async function registrarFalha(chaveHash) {
  const { rows } = await db.query(
    `
      INSERT INTO validacao_tentativas (chave_hash, inicio, tentativas, bloqueado_ate)
      VALUES ($1, NOW(), 1, NULL)
      ON CONFLICT (chave_hash) DO UPDATE
      SET
        inicio = CASE
          WHEN validacao_tentativas.inicio > NOW() - ($2::text || ' minutes')::interval
            THEN validacao_tentativas.inicio
          ELSE NOW()
        END,
        tentativas = CASE
          WHEN validacao_tentativas.inicio > NOW() - ($2::text || ' minutes')::interval
            THEN validacao_tentativas.tentativas + 1
          ELSE 1
        END,
        bloqueado_ate = CASE
          WHEN (
            CASE
              WHEN validacao_tentativas.inicio > NOW() - ($2::text || ' minutes')::interval
                THEN validacao_tentativas.tentativas + 1
              ELSE 1
            END
          ) >= $3
            THEN NOW() + ($2::text || ' minutes')::interval
          ELSE NULL
        END
      RETURNING chave_hash, inicio, tentativas, bloqueado_ate
    `,
    [chaveHash, JANELA_MINUTOS, LIMITE_TENTATIVAS]
  );

  return rows[0];
}

async function limpar(chaveHash) {
  await db.query('DELETE FROM validacao_tentativas WHERE chave_hash = $1', [chaveHash]);
}

async function limparAntigas() {
  await db.query(
    `
      DELETE FROM validacao_tentativas
      WHERE inicio < NOW() - INTERVAL '1 day'
        AND (bloqueado_ate IS NULL OR bloqueado_ate < NOW())
    `
  );
}

module.exports = {
  JANELA_MINUTOS,
  LIMITE_TENTATIVAS,
  buscar,
  registrarFalha,
  limpar,
  limparAntigas,
};
