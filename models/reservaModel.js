'use strict';

const db = require('../database/connection');
const { STATUS, SERVICOS } = require('../config/agendamento');

const STATUS_QUE_OCUPAM_VAGA = Object.freeze([STATUS.AGUARDANDO_VALIDACAO, STATUS.CONFIRMADO]);
const LOCK_AGENDAMENTOS = 847221;

function agoraISO() {
  return new Date().toISOString();
}

function normalizarData(valor) {
  if (!valor) return valor;
  if (valor instanceof Date) return valor.toISOString().slice(0, 10);
  return String(valor).slice(0, 10);
}

function normalizarTimestamp(valor) {
  if (!valor) return valor;
  if (valor instanceof Date) return valor.toISOString();
  return String(valor);
}

function parseJSON(valor, fallback) {
  if (valor == null || valor === '') return fallback;
  if (Array.isArray(valor) || (typeof valor === 'object' && valor !== null)) return valor;
  try {
    return JSON.parse(valor);
  } catch (_) {
    return fallback;
  }
}

async function executarTransacaoImediata(callback) {
  return db.executarTransacao(async (client) => {
    // Serializa alterações de capacidade do calendário. É um lock transacional,
    // seguro para o pool do Neon/PgBouncer e liberado no COMMIT/ROLLBACK.
    await client.query('SELECT pg_advisory_xact_lock($1)', [LOCK_AGENDAMENTOS]);
    return callback(client);
  }, { isolamento: 'READ COMMITTED' });
}

async function listarDatasOcupacaoPorId(reservaId, client = null) {
  const { rows } = await db.query(
    'SELECT data FROM reserva_dias WHERE reserva_id = $1 ORDER BY data ASC',
    [reservaId],
    client
  );
  return rows.map((row) => normalizarData(row.data));
}

async function hidratarReserva(reserva, client = null) {
  if (!reserva) return null;

  return {
    ...reserva,
    entrada: normalizarData(reserva.entrada),
    saida: normalizarData(reserva.saida),
    data_criacao: normalizarTimestamp(reserva.data_criacao),
    data_atualizacao: normalizarTimestamp(reserva.data_atualizacao),
    data_expiracao: normalizarTimestamp(reserva.data_expiracao),
    data_confirmacao: normalizarTimestamp(reserva.data_confirmacao),
    valor_total: reserva.valor_total == null ? null : Number(reserva.valor_total),
    valor_sinal: reserva.valor_sinal == null ? null : Number(reserva.valor_sinal),
    valor_a_pagar: reserva.valor_a_pagar == null ? null : Number(reserva.valor_a_pagar),
    saldo_pendente: reserva.saldo_pendente == null ? null : Number(reserva.saldo_pendente),
    quantidade_pets: Number(reserva.quantidade_pets),
    quantidade_dias: reserva.quantidade_dias == null ? null : Number(reserva.quantidade_dias),
    visitas_dia: reserva.visitas_dia == null ? null : Number(reserva.visitas_dia),
    frequencia_semanal: reserva.frequencia_semanal == null ? null : Number(reserva.frequencia_semanal),
    comprovante_tamanho: reserva.comprovante_tamanho == null ? null : Number(reserva.comprovante_tamanho),
    pets_detalhe: parseJSON(reserva.pets_detalhe, []),
    dias_semana: parseJSON(reserva.dias_semana, []),
    datas_ocupacao: await listarDatasOcupacaoPorId(reserva.id, client),
  };
}

async function inserirReserva(reserva, client = null) {
  if (!client) {
    return executarTransacaoImediata((tx) => inserirReserva(reserva, tx));
  }

  const criadoEm = agoraISO();
  const { rows } = await db.query(
    `
      INSERT INTO reservas (
        protocolo, nome_cliente, telefone, servico, entrada, saida,
        quantidade_pets, status, comprovante, pets_detalhe, observacao,
        valor_total, data_criacao, data_atualizacao, hora_entrada,
        hora_saida, endereco, visitas_dia, frequencia_semanal, dias_semana,
        quantidade_dias, forma_pagamento, valor_sinal, valor_a_pagar,
        saldo_pendente, comprovante_nome, comprovante_mime,
        comprovante_caminho, comprovante_tamanho, token_comprovante,
        token_validacao, data_expiracao
      ) VALUES (
        $1, $2, $3, $4, $5::date, $6::date,
        $7, $8, $9, $10::jsonb, $11,
        $12, $13::timestamptz, $14::timestamptz, $15,
        $16, $17, $18, $19, $20::jsonb,
        $21, 'pix', $22, $23,
        $24, $25, $26,
        $27, $28, $29,
        $30, $31::timestamptz
      )
      RETURNING *
    `,
    [
      reserva.protocolo,
      reserva.nomeCliente,
      reserva.telefone,
      reserva.servico,
      reserva.entrada,
      reserva.saida,
      reserva.quantidadePets,
      STATUS.AGUARDANDO_VALIDACAO,
      reserva.comprovanteNome,
      JSON.stringify(reserva.petsDetalhe || []),
      reserva.observacao || null,
      reserva.valorTotal,
      criadoEm,
      criadoEm,
      reserva.horaEntrada || null,
      reserva.horaSaida || null,
      reserva.endereco || null,
      reserva.visitasDia || null,
      reserva.frequenciaSemanal || null,
      JSON.stringify(reserva.diasSemana || []),
      reserva.quantidadeDias || null,
      reserva.valorSinal,
      reserva.valorAPagar,
      reserva.saldoPendente,
      reserva.comprovanteNome,
      reserva.comprovanteMime,
      reserva.comprovanteCaminho,
      reserva.comprovanteTamanho || null,
      reserva.tokenComprovante,
      reserva.tokenValidacao,
      reserva.dataExpiracao,
    ],
    client
  );

  const criada = rows[0];
  const datas = [...new Set(reserva.datasOcupacao || [])];

  if (datas.length > 0) {
    await db.query(
      `
        INSERT INTO reserva_dias (reserva_id, data)
        SELECT $1, data::date
        FROM unnest($2::text[]) AS data
        ON CONFLICT (reserva_id, data) DO NOTHING
      `,
      [criada.id, datas],
      client
    );
  }

  return hidratarReserva(criada, client);
}

async function buscarUmaPorCampo(campo, valor, client = null) {
  const camposPermitidos = new Set(['protocolo', 'token_validacao', 'token_comprovante']);
  if (!camposPermitidos.has(campo)) throw new Error('Campo de busca inválido.');

  const { rows } = await db.query(`SELECT * FROM reservas WHERE ${campo} = $1 LIMIT 1`, [valor], client);
  return hidratarReserva(rows[0], client);
}

function buscarPorProtocolo(protocolo, client = null) {
  return buscarUmaPorCampo('protocolo', protocolo, client);
}

function buscarPorTokenValidacao(token, client = null) {
  return buscarUmaPorCampo('token_validacao', token, client);
}

function buscarPorTokenComprovante(token, client = null) {
  return buscarUmaPorCampo('token_comprovante', token, client);
}

async function atualizarStatusPorId(id, status, { motivo = null } = {}, client = null) {
  const atualizadoEm = agoraISO();
  const confirmadoEm = status === STATUS.CONFIRMADO ? atualizadoEm : null;

  const { rows } = await db.query(
    `
      UPDATE reservas
      SET status = $1,
          data_atualizacao = $2::timestamptz,
          data_confirmacao = CASE WHEN $3::timestamptz IS NOT NULL THEN $3::timestamptz ELSE data_confirmacao END,
          motivo_cancelamento = CASE WHEN $4::text IS NOT NULL THEN $4::text ELSE motivo_cancelamento END
      WHERE id = $5
      RETURNING *
    `,
    [status, atualizadoEm, confirmadoEm, motivo, id],
    client
  );

  return hidratarReserva(rows[0], client);
}

async function expirarPendentes(dataLimiteISO = agoraISO(), client = null) {
  const { rowCount } = await db.query(
    `
      UPDATE reservas
      SET status = $1, data_atualizacao = $2::timestamptz
      WHERE status = $3
        AND data_expiracao IS NOT NULL
        AND data_expiracao < $4::timestamptz
    `,
    [STATUS.EXPIRADO, agoraISO(), STATUS.AGUARDANDO_VALIDACAO, dataLimiteISO],
    client
  );

  return rowCount;
}

async function somaVagasOcupadasNoDia(dataISO, servicos, excluirProtocolo = null, client = null) {
  if (!Array.isArray(servicos) || servicos.length === 0) return 0;

  const { rows } = await db.query(
    `
      SELECT COALESCE(SUM(r.quantidade_pets), 0)::int AS total
      FROM reservas r
      WHERE r.status = ANY($1::text[])
        AND r.servico = ANY($2::text[])
        AND ($3::text IS NULL OR r.protocolo <> $3::text)
        AND (
          EXISTS (
            SELECT 1
            FROM reserva_dias rd
            WHERE rd.reserva_id = r.id AND rd.data = $4::date
          )
          OR (
            NOT EXISTS (SELECT 1 FROM reserva_dias rd_any WHERE rd_any.reserva_id = r.id)
            AND (
              (r.servico = $5 AND r.entrada <= $4::date AND r.saida > $4::date)
              OR
              (r.servico = $6 AND r.entrada <= $4::date AND r.saida >= $4::date)
            )
          )
        )
    `,
    [
      STATUS_QUE_OCUPAM_VAGA,
      servicos,
      excluirProtocolo,
      dataISO,
      SERVICOS.HOSPEDAGEM_CAO,
      SERVICOS.CRECHE,
    ],
    client
  );

  return Number(rows[0]?.total) || 0;
}

async function contarReservasConfirmadasNoDia(dataISO, servico, excluirProtocolo = null, client = null) {
  const { rows } = await db.query(
    `
      SELECT COUNT(*)::int AS total
      FROM reservas r
      WHERE r.status = ANY($1::text[])
        AND r.servico = $2
        AND ($3::text IS NULL OR r.protocolo <> $3::text)
        AND (
          EXISTS (
            SELECT 1
            FROM reserva_dias rd
            WHERE rd.reserva_id = r.id AND rd.data = $4::date
          )
          OR (
            NOT EXISTS (SELECT 1 FROM reserva_dias rd_any WHERE rd_any.reserva_id = r.id)
            AND r.entrada <= $4::date
            AND r.saida > $4::date
          )
        )
    `,
    [STATUS_QUE_OCUPAM_VAGA, servico, excluirProtocolo, dataISO],
    client
  );

  return Number(rows[0]?.total) || 0;
}

module.exports = {
  executarTransacaoImediata,
  inserirReserva,
  buscarPorProtocolo,
  buscarPorTokenValidacao,
  buscarPorTokenComprovante,
  atualizarStatusPorId,
  expirarPendentes,
  somaVagasOcupadasNoDia,
  contarReservasConfirmadasNoDia,
};
