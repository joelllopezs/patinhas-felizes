'use strict';

const db = require('../database/connection');
const { PRECOS } = require('../config/agendamento');

const CHAVE_BASE = 'precos_base';

function baseDoCodigo() {
  return {
    hospedagem: PRECOS.HOSPEDAGEM_DIARIA,
    creche: { ...PRECOS.CRECHE },
    domiciliar: { ...PRECOS.DOMICILIAR },
    sinal: PRECOS.SINAL_RESERVA,
  };
}

function numero(valor, padrao) {
  const n = Number(valor);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : padrao;
}

function normalizarValores(origem, padrao) {
  const o = origem || {};
  return {
    hospedagem: numero(o.hospedagem, padrao.hospedagem),
    creche: Object.fromEntries([1, 2, 3, 4, 5].map((k) => [k, numero(o.creche && o.creche[k], padrao.creche[k])])),
    domiciliar: Object.fromEntries([1, 2].map((k) => [k, numero(o.domiciliar && o.domiciliar[k], padrao.domiciliar[k])])),
  };
}

async function tabelaExiste(nome, client = null) {
  const { rows } = await db.query('SELECT to_regclass($1) IS NOT NULL AS ok', [`public.${nome}`], client);
  return rows[0]?.ok === true;
}

/**
 * Tabela de preços vigente: { base, periodos }.
 * Sem as tabelas novas no banco, devolve os valores do código (nada quebra).
 */
async function obterTabela(client = null) {
  const padrao = baseDoCodigo();
  let base = padrao;

  if (await tabelaExiste('configuracoes', client)) {
    const { rows } = await db.query('SELECT valor FROM configuracoes WHERE chave = $1', [CHAVE_BASE], client);
    if (rows[0]) {
      try {
        const j = JSON.parse(rows[0].valor);
        base = { ...normalizarValores(j, padrao), sinal: numero(j.sinal, padrao.sinal) };
      } catch (_) { /* usa o padrão */ }
    }
  }

  let periodos = [];
  if (await tabelaExiste('precos_periodos', client)) {
    const { rows } = await db.query(
      `SELECT id, nome, to_char(inicio, 'YYYY-MM-DD') AS inicio, to_char(fim, 'YYYY-MM-DD') AS fim,
              hospedagem, creche, domiciliar
         FROM precos_periodos ORDER BY inicio, id`,
      [],
      client
    );
    periodos = rows.map((r) => ({
      id: Number(r.id),
      nome: r.nome,
      inicio: r.inicio,
      fim: r.fim,
      ...normalizarValores({ hospedagem: r.hospedagem, creche: r.creche, domiciliar: r.domiciliar }, base),
    }));
  }

  return { base, periodos };
}

async function salvarBase(base, client = null) {
  await db.query(
    `INSERT INTO configuracoes (chave, valor, atualizada_em) VALUES ($1, $2, NOW())
     ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, atualizada_em = NOW()`,
    [CHAVE_BASE, JSON.stringify(base)],
    client
  );
}

async function periodoSobreposto(inicio, fim, ignorarId = null, client = null) {
  const { rows } = await db.query(
    `SELECT id, nome FROM precos_periodos
      WHERE inicio <= $2::date AND fim >= $1::date AND ($3::bigint IS NULL OR id <> $3::bigint)
      LIMIT 1`,
    [inicio, fim, ignorarId],
    client
  );
  return rows[0] || null;
}

async function salvarPeriodo({ id, nome, inicio, fim, hospedagem, creche, domiciliar }, client = null) {
  if (id) {
    const { rowCount } = await db.query(
      `UPDATE precos_periodos
          SET nome = $2, inicio = $3::date, fim = $4::date, hospedagem = $5,
              creche = $6::jsonb, domiciliar = $7::jsonb, atualizado_em = NOW()
        WHERE id = $1`,
      [id, nome, inicio, fim, hospedagem, JSON.stringify(creche), JSON.stringify(domiciliar)],
      client
    );
    return rowCount > 0;
  }

  await db.query(
    `INSERT INTO precos_periodos (nome, inicio, fim, hospedagem, creche, domiciliar)
     VALUES ($1, $2::date, $3::date, $4, $5::jsonb, $6::jsonb)`,
    [nome, inicio, fim, hospedagem, JSON.stringify(creche), JSON.stringify(domiciliar)],
    client
  );
  return true;
}

async function removerPeriodo(id, client = null) {
  await db.query('DELETE FROM precos_periodos WHERE id = $1', [id], client);
}

module.exports = { obterTabela, salvarBase, periodoSobreposto, salvarPeriodo, removerPeriodo, baseDoCodigo };
