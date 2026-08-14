'use strict';

const path = require('path');
const { Readable } = require('stream');
const { MAX_COMPROVANTE_BYTES } = require('../config/agendamento');
const { DomainError } = require('./agendamentoWebService');
const uploadTicketService = require('./uploadTicketService');

const TIPOS_PERMITIDOS = Object.freeze([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

function blobSdk() {
  return require('@vercel/blob');
}

function nomeSeguro(nome) {
  const base = path.basename(String(nome || 'comprovante'));
  const limpo = base
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._ -]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();

  return (limpo || 'comprovante').slice(0, 120);
}

function extensaoPorMime(mime) {
  const mapa = {
    'application/pdf': '.pdf',
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
  };
  return mapa[mime] || '';
}

function mimePorNome(nome) {
  const extensao = path.extname(String(nome || '')).toLowerCase();
  const mapa = {
    '.pdf': 'application/pdf',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
  };
  return mapa[extensao] || '';
}

function detectarTipo(buffer) {
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString('ascii') === '%PDF-') {
    return 'application/pdf';
  }

  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'image/png';
  }

  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }

  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }

  return null;
}


function validarMetadadosArquivo(arquivoRecebido) {
  const arquivo = arquivoRecebido && typeof arquivoRecebido === 'object'
    ? arquivoRecebido
    : {};
  const nome = nomeSeguro(arquivo.nomeArquivo);
  const mimeRecebido = String(arquivo.mime || '').toLowerCase().trim();
  const mime = TIPOS_PERMITIDOS.includes(mimeRecebido) ? mimeRecebido : mimePorNome(nome);
  const tamanho = Number(arquivo.tamanho || 0);

  if (!nome || !mime || !Number.isFinite(tamanho) || tamanho <= 0) {
    throw new DomainError('Selecione o comprovante antes de continuar.', 'COMPROVANTE_OBRIGATORIO');
  }

  if (!TIPOS_PERMITIDOS.includes(mime)) {
    throw new DomainError('Envie o comprovante em PDF, JPG, PNG ou WEBP.', 'COMPROVANTE_TIPO_INVALIDO');
  }

  if (tamanho > MAX_COMPROVANTE_BYTES) {
    throw new DomainError(
      `O comprovante deve ter no máximo ${Math.floor(MAX_COMPROVANTE_BYTES / 1024 / 1024)} MB.`,
      'COMPROVANTE_MUITO_GRANDE',
      413
    );
  }

  return { nomeArquivo: nome, mime, tamanho };
}

function normalizarNomeParaBlob(nome, mime) {
  const seguro = nomeSeguro(nome).replace(/\.[^.]+$/, '');
  const base = seguro.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'comprovante';
  return `${base.slice(0, 80)}${extensaoPorMime(mime) || '.bin'}`;
}

async function lerAssinaturaDoBlob(resultado) {
  const stream = resultado?.stream;
  if (!stream) return Buffer.alloc(0);

  if (typeof stream.getReader === 'function') {
    const reader = stream.getReader();
    try {
      const { value } = await reader.read();
      return Buffer.from(value || []).subarray(0, 32);
    } finally {
      try {
        await reader.cancel();
      } catch (_) {
        // O cancelamento é apenas uma otimização após ler a assinatura.
      }
    }
  }

  for await (const chunk of stream) {
    if (typeof stream.destroy === 'function') stream.destroy();
    return Buffer.from(chunk).subarray(0, 32);
  }

  return Buffer.alloc(0);
}

async function validarBlobRecebido(comprovanteRecebido, preparado) {
  const comprovante = comprovanteRecebido && typeof comprovanteRecebido === 'object'
    ? comprovanteRecebido
    : {};

  const ticketPayload = uploadTicketService.validarTicket(comprovante.uploadTicket, preparado);
  const pathname = String(comprovante.pathname || '').trim();
  const prefixo = uploadTicketService.prefixoDoTicket(ticketPayload);

  if (!pathname || !pathname.startsWith(prefixo) || pathname.includes('..')) {
    throw new DomainError('O comprovante enviado não pertence a este agendamento.', 'COMPROVANTE_INVALIDO', 403);
  }

  let resultado;
  try {
    const { get } = blobSdk();
    resultado = await get(pathname, { access: 'private', useCache: false });
  } catch (error) {
    if (error?.name === 'BlobNotFoundError') {
      throw new DomainError('O comprovante enviado não foi encontrado.', 'COMPROVANTE_NAO_ENCONTRADO', 400);
    }
    throw error;
  }

  if (!resultado || resultado.statusCode !== 200 || !resultado.blob) {
    throw new DomainError('O comprovante enviado não foi encontrado.', 'COMPROVANTE_NAO_ENCONTRADO', 400);
  }

  const tamanho = Number(resultado.blob.size || comprovante.tamanho || 0);
  const mimeInformado = String(resultado.blob.contentType || comprovante.mime || '').toLowerCase();

  if (!Number.isFinite(tamanho) || tamanho <= 0 || tamanho > MAX_COMPROVANTE_BYTES) {
    throw new DomainError(
      `O comprovante deve ter no máximo ${Math.floor(MAX_COMPROVANTE_BYTES / 1024 / 1024)} MB.`,
      'COMPROVANTE_MUITO_GRANDE',
      413
    );
  }

  if (!TIPOS_PERMITIDOS.includes(mimeInformado)) {
    throw new DomainError('Envie o comprovante em PDF, JPG, PNG ou WEBP.', 'COMPROVANTE_TIPO_INVALIDO');
  }

  const assinatura = await lerAssinaturaDoBlob(resultado);
  const mimeDetectado = detectarTipo(assinatura);

  if (!mimeDetectado || mimeDetectado !== mimeInformado) {
    throw new DomainError('O conteúdo do comprovante não corresponde ao tipo do arquivo.', 'COMPROVANTE_TIPO_INVALIDO');
  }

  return {
    nomeOriginal: nomeSeguro(comprovante.nomeArquivo),
    mime: mimeDetectado,
    nomeInterno: pathname,
    tamanho,
  };
}

async function obterComprovante(nomeInterno) {
  const pathname = String(nomeInterno || '').trim();
  if (!pathname.startsWith('comprovantes/') || pathname.includes('..')) return null;

  try {
    const { get } = blobSdk();
    const resultado = await get(pathname, { access: 'private' });
    return resultado?.statusCode === 200 ? resultado : null;
  } catch (error) {
    if (error?.name === 'BlobNotFoundError') return null;
    throw error;
  }
}

async function removerComprovante(nomeInterno) {
  const pathname = String(nomeInterno || '').trim();
  if (!pathname.startsWith('comprovantes/') || pathname.includes('..')) return;
  const { del } = blobSdk();
  await del(pathname);
}

function streamParaNode(stream) {
  if (!stream) return null;
  if (typeof stream.pipe === 'function') return stream;
  if (typeof Readable.fromWeb === 'function' && typeof stream.getReader === 'function') {
    return Readable.fromWeb(stream);
  }
  return Readable.from(stream);
}

module.exports = {
  TIPOS_PERMITIDOS,
  nomeSeguro,
  mimePorNome,
  validarMetadadosArquivo,
  normalizarNomeParaBlob,
  detectarTipo,
  validarBlobRecebido,
  obterComprovante,
  removerComprovante,
  streamParaNode,
};
