'use strict';

/**
 * Painel do proprietário — sem login.
 * O acesso é um link secreto: /controle/<CONTROLE_TOKEN>
 * Sem CONTROLE_TOKEN (mín. 32 caracteres) o painel fica desligado (404).
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const config = require('../config/agendamento');
const reservaModel = require('../models/reservaModel');
const controleModel = require('../models/controleModel');
const reservaService = require('../services/reservaService');
const precoService = require('../services/precoService');
const disponibilidadeService = require('../services/disponibilidadeService');
const googleCalendarService = require('../services/googleCalendarService');
const { validarDataISO, hojeISOEmSaoPaulo } = require('../utils/dateUtils');

const { SERVICOS_VALIDOS, STATUS, MAX_PETS_POR_RESERVA } = config;
const FORMAS = ['pix', 'dinheiro', 'cartao'];

function tokenValido(recebido) {
  const esperado = config.CONTROLE_TOKEN;
  if (esperado.length < 32) return false;
  const a = Buffer.from(String(recebido));
  const b = Buffer.from(esperado);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function serializar(r) {
  const pets = Array.isArray(r.pets_detalhe) ? r.pets_detalhe : [];
  return {
    id: Number(r.id),
    protocolo: r.protocolo,
    cliente: r.nome_cliente,
    telefone: r.telefone,
    servico: r.servico,
    entrada: r.entrada,
    saida: r.saida,
    horaEntrada: r.hora_entrada,
    horaSaida: r.hora_saida,
    qtd: r.quantidade_pets,
    pets: pets.map((p) => p && p.nome).filter(Boolean),
    status: r.status,
    obs: r.observacao || '',
    total: r.valor_total === null ? 0 : Number(r.valor_total),
    sinal: r.valor_sinal === null ? 0 : Number(r.valor_sinal),
    pagamento: r.forma_pagamento,
    pago: r.pago === true,
    comprovante: r.tem_comprovante && r.token_comprovante
      ? { url: `/comprovante/${r.token_comprovante}`, nome: r.comprovante_nome, mime: r.comprovante_mime }
      : null,
    datas: r.datas || [],
  };
}

function erro(h, status, msg, code) {
  return new h.HttpError(status, msg, code || 'REQUISICAO_INVALIDA');
}

function dataOk(v) {
  try { return /^\d{4}-\d{2}-\d{2}$/.test(String(v)) && validarDataISO(String(v)); } catch (_) { return false; }
}

function idDaRota(txt, h) {
  const id = Number(txt);
  if (!Number.isSafeInteger(id) || id < 1) throw erro(h, 400, 'Identificador inválido.');
  return id;
}

async function criarReservaManual(b, h) {
  const servico = String(b.servico || '');
  if (!SERVICOS_VALIDOS.includes(servico)) throw erro(h, 400, 'Serviço inválido.');

  const nome = String(b.cliente || '').trim();
  const telefone = String(b.telefone || '').replace(/\D/g, '');
  const pets = (Array.isArray(b.pets) ? b.pets : []).map((p) => String(p).trim().slice(0, 60)).filter(Boolean);
  const entrada = String(b.entrada || '');
  let saida = String(b.saida || entrada);
  const total = Number(b.total);
  const forma = FORMAS.includes(b.pagamento) ? b.pagamento : 'pix';
  const pago = b.pago === true;
  const hora = (v) => (/^\d{2}:\d{2}$/.test(String(v || '')) ? String(v) : null);

  if (nome.length < 2) throw erro(h, 400, 'Informe o nome do tutor.');
  if (telefone.length < 10) throw erro(h, 400, 'Informe o telefone com DDD.');
  if (pets.length < 1 || pets.length > MAX_PETS_POR_RESERVA) throw erro(h, 400, `Informe de 1 a ${MAX_PETS_POR_RESERVA} pets.`);
  if (!dataOk(entrada) || !dataOk(saida) || saida < entrada) throw erro(h, 400, 'Confira as datas.');
  if (servico.startsWith('hospedagem') && saida <= entrada) throw erro(h, 400, 'Na hospedagem a saída deve ser depois da entrada.');
  if (!Number.isFinite(total) || total < 0) throw erro(h, 400, 'Informe o valor total.');

  const ids = reservaService.gerarIdentificadores(servico);
  const diasSemana = servico === 'creche' ? [1, 2, 3, 4, 5] : [];

  const resultado = await reservaModel.executarTransacaoImediata(async (client) => {
    const disp = await disponibilidadeService.verificarDisponibilidade({
      servico, entradaISO: entrada, saidaISO: saida, quantidadePets: pets.length,
      diasSemanaCreche: diasSemana, client,
    });
    if (!disp.disponivel) return { ok: false, motivo: disp.motivo };
    if (!disp.datasOcupacao || disp.datasOcupacao.length === 0) {
      return { ok: false, motivo: 'Nenhuma data válida no período escolhido.' };
    }

    const criada = await reservaModel.inserirReserva({
      protocolo: ids.protocolo, nomeCliente: nome, telefone, servico, entrada, saida,
      quantidadePets: pets.length, comprovanteNome: null,
      petsDetalhe: pets.map((n) => ({ nome: n })),
      observacao: String(b.obs || '').trim().slice(0, 500) || null,
      valorTotal: total, horaEntrada: hora(b.horaEntrada), horaSaida: hora(b.horaSaida),
      endereco: null, visitasDia: null, frequenciaSemanal: null, diasSemana,
      quantidadeDias: disp.datasOcupacao.length, valorSinal: null,
      valorAPagar: total, saldoPendente: pago ? 0 : total,
      comprovanteMime: null, comprovanteCaminho: null, comprovanteTamanho: null,
      tokenComprovante: null, tokenValidacao: ids.tokenValidacao, dataExpiracao: null,
      datasOcupacao: disp.datasOcupacao,
    }, client);

    const confirmada = await reservaModel.atualizarStatusPorId(criada.id, STATUS.CONFIRMADO, {}, client);
    await controleModel.atualizarCamposControle(criada.id, { pago, formaPagamento: forma }, client);
    return { ok: true, reserva: confirmada };
  });

  if (!resultado.ok) throw erro(h, 409, resultado.motivo, 'SEM_DISPONIBILIDADE');

  try {
    await googleCalendarService.sincronizarReservaConfirmada(resultado.reserva);
  } catch (e) {
    console.error('[GOOGLE] Falha ao criar evento da reserva manual:', e?.message || e);
  }
  return { ok: true, protocolo: resultado.reserva.protocolo };
}

async function tratar(req, res, pathname, h) {
  const pagina = pathname.match(/^\/controle\/([^/]+)\/?$/);
  if (req.method === 'GET' && pagina) {
    if (!tokenValido(pagina[1])) throw erro(h, 404, 'Página não encontrada.', 'ROTA_NAO_ENCONTRADA');
    const base = `/controle/${encodeURIComponent(config.CONTROLE_TOKEN)}`;
    const html = Buffer.from(
      fs
        .readFileSync(path.join(__dirname, '..', 'public', 'controle.html'), 'utf8')
        .replace('__MANIFEST__', `${base}/manifest.webmanifest`),
      'utf8'
    );
    h.cabecalhosSeguranca(res, { permitirInlineStyle: true });
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Length': html.length,
      'Cache-Control': 'no-store',
    });
    res.end(html);
    return true;
  }

  const manifesto = pathname.match(/^\/controle\/([^/]+)\/manifest\.webmanifest$/);
  if (req.method === 'GET' && manifesto) {
    if (!tokenValido(manifesto[1])) throw erro(h, 404, 'Página não encontrada.', 'ROTA_NAO_ENCONTRADA');
    const base = `/controle/${encodeURIComponent(config.CONTROLE_TOKEN)}`;
    const corpo = JSON.stringify({
      id: base,
      name: 'Patinhas Controle',
      short_name: 'Patinhas Controle',
      description: 'Painel do proprietário — Patinhas Felizes',
      lang: 'pt-BR',
      start_url: base,
      scope: base,
      display: 'standalone',
      background_color: '#F1EAF9',
      theme_color: '#4B257A',
      icons: [
        { src: '/icons/controle-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/icons/controle-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: '/icons/controle-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    });
    h.cabecalhosSeguranca(res);
    res.writeHead(200, {
      'Content-Type': 'application/manifest+json; charset=utf-8',
      'Content-Length': Buffer.byteLength(corpo),
      'Cache-Control': 'no-store',
    });
    res.end(corpo);
    return true;
  }

  const api = pathname.match(/^\/api\/controle\/([^/]+)\/(.+?)\/?$/);
  if (!api) return false;
  if (!tokenValido(api[1])) throw erro(h, 404, 'Rota da API não encontrada.', 'ROTA_NAO_ENCONTRADA');

  const rota = api[2];
  const ok = (extra = {}) => h.enviarJSON(res, 200, { ok: true, ...extra });

  if (req.method === 'GET' && rota === 'dados') {
    await reservaModel.expirarPendentes();
    const [reservas, pausas, limite, vigentes] = await Promise.all([
      controleModel.listarReservasControle(),
      controleModel.listarPausas(),
      controleModel.obterLimiteVagas(),
      controleModel.obterPrecosVigentes(),
    ]);
    ok({
      precos: precoService.precosParaApi(vigentes.precos),
      precosPadrao: precoService.precosParaApi(config.PRECOS),
      precosAtualizadoEm: vigentes.atualizadoEm,
      precosPersonalizados: vigentes.personalizado,
      hoje: hojeISOEmSaoPaulo(),
      limiteVagas: limite,
      limiteGatos: config.LIMITE_CLIENTES_GATOS_POR_DIA,
      pausas,
      reservas: reservas.map(serializar),
    });
    return true;
  }

  if (req.method !== 'POST') throw erro(h, 405, 'Método não permitido.', 'METODO_NAO_PERMITIDO');
  const b = await h.lerJSON(req);

  if (rota === 'reservas') {
    ok(await criarReservaManual(b, h));
    return true;
  }

  let m = rota.match(/^reservas\/(\d+)\/(editar|confirmar|cancelar)$/);
  if (m) {
    const id = idDaRota(m[1], h);
    if (m[2] === 'editar') {
      const campos = {};
      if (b.pago !== undefined) campos.pago = b.pago === true;
      if (b.pagamento !== undefined) {
        if (!FORMAS.includes(b.pagamento)) throw erro(h, 400, 'Forma de pagamento inválida.');
        campos.formaPagamento = b.pagamento;
      }
      if (b.total !== undefined) {
        const t = Number(b.total);
        if (!Number.isFinite(t) || t < 0) throw erro(h, 400, 'Valor total inválido.');
        campos.valorTotal = t;
      }
      if (b.obs !== undefined) campos.observacao = String(b.obs).trim().slice(0, 500) || null;
      if (!(await controleModel.atualizarCamposControle(id, campos))) throw erro(h, 404, 'Reserva não encontrada.', 'NAO_ENCONTRADA');
      ok();
      return true;
    }
    const token = await controleModel.buscarTokenValidacaoPorId(id);
    if (!token) throw erro(h, 404, 'Reserva não encontrada.', 'NAO_ENCONTRADA');
    const r = m[2] === 'confirmar'
      ? await reservaService.confirmarPorToken(token)
      : await reservaService.cancelarPorToken(token, 'Cancelado pelo painel de controle');
    if (!r.ok) throw erro(h, 409, r.error || 'Não foi possível concluir a ação.', 'ACAO_RECUSADA');
    ok();
    return true;
  }

  if (rota === 'pausas') {
    const servico = b.servico && b.servico !== 'todos' ? String(b.servico) : null;
    if (servico && !SERVICOS_VALIDOS.includes(servico)) throw erro(h, 400, 'Serviço inválido.');
    if (!dataOk(b.inicio) || !dataOk(b.fim) || b.fim < b.inicio) throw erro(h, 400, 'Confira as datas da pausa.');
    await controleModel.criarPausa({
      inicio: b.inicio, fim: b.fim, servico, motivo: String(b.motivo || '').trim().slice(0, 120),
    });
    ok();
    return true;
  }

  m = rota.match(/^pausas\/(\d+)\/remover$/);
  if (m) {
    await controleModel.removerPausa(idDaRota(m[1], h));
    ok();
    return true;
  }

  if (rota === 'precos') {
    let novos;
    try {
      novos = precoService.normalizarPrecos(b);
    } catch (e) {
      throw erro(h, 400, e.message, 'VALORES_INVALIDOS');
    }
    // Só grava a tabela vigente: reservas já lançadas guardam o próprio valor_total/sinal/saldo.
    await controleModel.definirPrecos(novos);
    ok({ precos: precoService.precosParaApi(novos) });
    return true;
  }

  if (rota === 'precos/restaurar') {
    await controleModel.restaurarPrecosPadrao();
    ok({ precos: precoService.precosParaApi(config.PRECOS) });
    return true;
  }

  if (rota === 'limite') {
    const n = Number(b.limite);
    if (!Number.isInteger(n) || n < 0 || n > 100) throw erro(h, 400, 'Limite inválido (0 a 100).');
    await controleModel.definirLimiteVagas(n);
    ok({ limiteVagas: n });
    return true;
  }

  throw erro(h, 404, 'Rota da API não encontrada.', 'ROTA_NAO_ENCONTRADA');
}

module.exports = { tratar };
