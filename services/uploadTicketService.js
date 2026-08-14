'use strict';

const crypto = require('crypto');
const config = require('../config/agendamento');
const { DomainError } = require('./agendamentoWebService');

function segredo() {
  const valor = String(config.UPLOAD_SIGNING_SECRET || '');

  if (valor.length < 32) {
    const error = new Error(
      'UPLOAD_SIGNING_SECRET precisa ter pelo menos 32 caracteres. Configure um segredo aleatório nas variáveis de ambiente.'
    );
    error.code = 'UPLOAD_SIGNING_SECRET_INVALIDO';
    throw error;
  }

  return valor;
}

function jsonCanonicoPreparado(preparado) {
  const pets = Array.isArray(preparado.pets)
    ? preparado.pets.map((pet) => ({
        nome: pet.nome || '',
        raca: pet.raca || '',
        porte: pet.porte || '',
        convive: pet.convive || '',
        castradoIdade: pet.castradoIdade || '',
        cuidados: pet.cuidados || '',
      }))
    : [];

  return JSON.stringify({
    servico: preparado.servico,
    nomeCliente: preparado.nomeCliente,
    telefone: preparado.telefone,
    entradaISO: preparado.entradaISO,
    saidaISO: preparado.saidaISO,
    horaEntrada: preparado.horaEntrada || null,
    horaSaida: preparado.horaSaida || null,
    quantidadePets: preparado.quantidadePets,
    quantidadeDias: preparado.quantidadeDias || null,
    endereco: preparado.endereco || null,
    visitasDia: preparado.visitasDia || null,
    frequenciaSemanal: preparado.frequenciaSemanal || null,
    diasSemana: preparado.diasSemana || [],
    datasOcupacao: preparado.datasOcupacao || [],
    observacao: preparado.observacao || '',
    pets,
    preco: preparado.preco,
  });
}

function digestPreparado(preparado) {
  return crypto.createHash('sha256').update(jsonCanonicoPreparado(preparado)).digest('hex');
}

function assinatura(payloadBase64) {
  return crypto.createHmac('sha256', segredo()).update(payloadBase64).digest('base64url');
}

function criarTicket(preparado) {
  const nonce = crypto.randomBytes(18).toString('hex');
  const agora = Date.now();
  const payload = {
    v: 1,
    iat: agora,
    exp: agora + config.UPLOAD_TICKET_MINUTOS * 60 * 1000,
    nonce,
    digest: digestPreparado(preparado),
  };
  const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const ticket = `${payloadBase64}.${assinatura(payloadBase64)}`;

  return {
    ticket,
    nonce,
    expiraEm: new Date(payload.exp).toISOString(),
  };
}

function validarTicket(ticketRecebido, preparado = null) {
  const ticket = String(ticketRecebido || '').trim();
  const [payloadBase64, assinaturaRecebida, extra] = ticket.split('.');

  if (!payloadBase64 || !assinaturaRecebida || extra) {
    throw new DomainError('Autorização de upload inválida.', 'UPLOAD_NAO_AUTORIZADO', 403);
  }

  const assinaturaEsperada = assinatura(payloadBase64);
  const recebido = Buffer.from(assinaturaRecebida);
  const esperado = Buffer.from(assinaturaEsperada);

  if (recebido.length !== esperado.length || !crypto.timingSafeEqual(recebido, esperado)) {
    throw new DomainError('Autorização de upload inválida.', 'UPLOAD_NAO_AUTORIZADO', 403);
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(payloadBase64, 'base64url').toString('utf8'));
  } catch (_) {
    throw new DomainError('Autorização de upload inválida.', 'UPLOAD_NAO_AUTORIZADO', 403);
  }

  if (payload.v !== 1 || !payload.nonce || !payload.digest || Number(payload.exp) <= Date.now()) {
    throw new DomainError(
      'A autorização para enviar o comprovante expirou. Tente novamente.',
      'UPLOAD_AUTORIZACAO_EXPIRADA',
      403
    );
  }

  if (preparado && payload.digest !== digestPreparado(preparado)) {
    throw new DomainError(
      'Os dados do agendamento mudaram depois da autorização do comprovante. Revise e envie novamente.',
      'UPLOAD_DADOS_DIVERGENTES',
      409
    );
  }

  return payload;
}

function prefixoDoTicket(ticketPayload) {
  return `comprovantes/${ticketPayload.nonce}/`;
}

module.exports = {
  criarTicket,
  validarTicket,
  prefixoDoTicket,
  digestPreparado,
};
