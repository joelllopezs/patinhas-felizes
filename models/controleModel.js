'use strict';

const db = require('../database/connection');
const config = require('../config/agendamento');
const precoService = require('../services/precoService');

const CHAVE_LIMITE = 'limite_vagas_diario';
const CHAVE_PRECOS = 'precos';
const HOJE_SP = "(NOW() AT TIME ZONE 'America/Sao_Paulo')::date";

async function tabelaExiste(nome, client = null) {
  const { rows } = await db.query('SELECT to_regclass($1) IS NOT NULL AS ok', [`public.${nome}`], client);
  return rows[0]?.ok === true;
}

async function obterLimiteVagas(client = null) {
  if (!(await tabelaExiste('configuracoes', client))) return config.LIMITE_VAGAS_DIARIO;
  const { rows } = await db.query('SELECT valor FROM configuracoes WHERE chave = $1', [CHAVE_LIMITE], client);
  const n = Number(rows[0]?.valor);
  return Number.isInteger(n) && n >= 0 && n <= 100 ? n : config.LIMITE_VAGAS_DIARIO;
}

async function definirLimiteVagas(limite, client = null) {
  await db.query(
    `INSERT INTO configuracoes (chave, valor, atualizada_em) VALUES ($1, $2, NOW())
     ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, atualizada_em = NOW()`,
    [CHAVE_LIMITE, String(limite)],
    client
  );
}

/**
 * Tabela de valores vigente (formato config.PRECOS) + data da última alteração.
 * Se nada foi salvo (ou o JSON estiver inválido), vale o padrão de config/agendamento.js.
 * Só afeta NOVOS cálculos: cada reserva grava o próprio valor_total ao ser criada.
 */
async function obterPrecosVigentes(client = null) {
  const padrao = { precos: config.PRECOS, atualizadoEm: null, personalizado: false };
  if (!(await tabelaExiste('configuracoes', client))) return padrao;
  const { rows } = await db.query(
    'SELECT valor, atualizada_em FROM configuracoes WHERE chave = $1',
    [CHAVE_PRECOS],
    client
  );
  if (!rows[0]) return padrao;
  try {
    const precos = precoService.normalizarPrecos(JSON.parse(rows[0].valor));
    return { precos, atualizadoEm: rows[0].atualizada_em, personalizado: true };
  } catch (_) {
    return padrao;
  }
}

async function obterPrecos(client = null) {
  return (await obterPrecosVigentes(client)).precos;
}

async function definirPrecos(precos, client = null) {
  await db.query(
    `INSERT INTO configuracoes (chave, valor, atualizada_em) VALUES ($1, $2, NOW())
     ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, atualizada_em = NOW()`,
    [CHAVE_PRECOS, JSON.stringify(precoService.precosParaApi(precos))],
    client
  );
}

async function restaurarPrecosPadrao(client = null) {
  await db.query('DELETE FROM configuracoes WHERE chave = $1', [CHAVE_PRECOS], client);
}

async function listarPausas(client = null) {
  if (!(await tabelaExiste('pausas', client))) return [];
  const { rows } = await db.query(
    `SELECT id, to_char(inicio, 'YYYY-MM-DD') AS inicio, to_char(fim, 'YYYY-MM-DD') AS fim, servico, motivo
       FROM pausas WHERE fim >= ${HOJE_SP} ORDER BY inicio, id`,
    [],
    client
  );
  return rows.map((r) => ({ ...r, id: Number(r.id) }));
}

async function criarPausa({ inicio, fim, servico, motivo }, client = null) {
  await db.query(
    'INSERT INTO pausas (inicio, fim, servico, motivo) VALUES ($1::date, $2::date, $3, $4)',
    [inicio, fim, servico || null, motivo || null],
    client
  );
}

async function removerPausa(id, client = null) {
  await db.query('DELETE FROM pausas WHERE id = $1', [id], client);
}

/** Pausa que cobre alguma das datas para o serviço (null = nenhuma). Só bloqueia NOVOS pedidos. */
async function buscarPausa({ servico, datas }, client = null) {
  if (!Array.isArray(datas) || datas.length === 0) return null;
  if (!(await tabelaExiste('pausas', client))) return null;
  const { rows } = await db.query(
    `SELECT to_char(inicio, 'YYYY-MM-DD') AS inicio, to_char(fim, 'YYYY-MM-DD') AS fim, motivo
       FROM pausas
      WHERE (servico IS NULL OR servico = $1)
        AND EXISTS (SELECT 1 FROM unnest($2::text[]) AS d WHERE d::date BETWEEN inicio AND fim)
      ORDER BY inicio LIMIT 1`,
    [servico, datas],
    client
  );
  return rows[0] || null;
}

async function listarReservasControle(client = null) {
  const { rows } = await db.query(
    `SELECT r.id, r.protocolo, r.nome_cliente, r.telefone, r.servico,
            to_char(r.entrada, 'YYYY-MM-DD') AS entrada, to_char(r.saida, 'YYYY-MM-DD') AS saida,
            r.hora_entrada, r.hora_saida, r.quantidade_pets, r.pets_detalhe, r.status, r.observacao,
            r.valor_total, r.valor_sinal, r.saldo_pendente, r.forma_pagamento, r.pago, r.endereco,
            r.comprovante_nome, r.comprovante_mime, r.token_comprovante,
            (r.comprovante_caminho IS NOT NULL) AS tem_comprovante,
            ARRAY(SELECT to_char(d.data, 'YYYY-MM-DD') FROM reserva_dias d WHERE d.reserva_id = r.id ORDER BY d.data) AS datas
       FROM reservas r
      ORDER BY r.entrada DESC, r.id DESC
      LIMIT 1500`,
    [],
    client
  );
  return rows;
}

async function buscarTokenValidacaoPorId(id, client = null) {
  const { rows } = await db.query('SELECT token_validacao FROM reservas WHERE id = $1', [id], client);
  return rows[0]?.token_validacao || null;
}

async function atualizarCamposControle(id, { pago, formaPagamento, valorTotal, observacao }, client = null) {
  const { rowCount } = await db.query(
    `UPDATE reservas
        SET pago = COALESCE($2::boolean, pago),
            saldo_pendente = CASE WHEN $2::boolean IS TRUE THEN 0 ELSE saldo_pendente END,
            forma_pagamento = COALESCE($3::text, forma_pagamento),
            valor_total = COALESCE($4::numeric, valor_total),
            observacao = CASE WHEN $5::boolean THEN $6::text ELSE observacao END,
            data_atualizacao = NOW()
      WHERE id = $1`,
    [id, pago ?? null, formaPagamento ?? null, valorTotal ?? null, observacao !== undefined, observacao ?? null],
    client
  );
  return rowCount > 0;
}

module.exports = {
  obterLimiteVagas,
  definirLimiteVagas,
  obterPrecos,
  obterPrecosVigentes,
  definirPrecos,
  restaurarPrecosPadrao,
  listarPausas,
  criarPausa,
  removerPausa,
  buscarPausa,
  listarReservasControle,
  buscarTokenValidacaoPorId,
  atualizarCamposControle,
};
