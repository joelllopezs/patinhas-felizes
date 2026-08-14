'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const projetoDir = path.resolve(__dirname, '..');

process.env.UPLOAD_SIGNING_SECRET =
  process.env.UPLOAD_SIGNING_SECRET || 'teste-0123456789abcdef-0123456789abcdef';
process.env.VALIDATION_PIN = process.env.VALIDATION_PIN || '7391';
process.env.OWNER_WHATSAPP = process.env.OWNER_WHATSAPP || '5514999999999';
process.env.PIX_KEY = process.env.PIX_KEY || 'pix-teste-patinhas';
process.env.PUBLIC_BASE_URL = '';
process.env.HOST = '127.0.0.1';

const config = require('../config/agendamento');
const precoService = require('../services/precoService');
const comprovanteService = require('../services/comprovanteService');
const uploadTicketService = require('../services/uploadTicketService');
const { createServer } = require('../server');

function ler(relativo) {
  return fs.readFileSync(path.join(projetoDir, relativo), 'utf8');
}

function testarEstrutura() {
  assert.equal(config.APP_VERSION, '4.0.0');
  assert.equal(config.MAX_COMPROVANTE_BYTES, 5 * 1024 * 1024);

  const connection = ler('database/connection.js');
  const schema = ler('database/schema.sql');
  const server = ler('server.js');
  const browser = ler('src/script.js');
  const packageJson = JSON.parse(ler('package.json'));

  assert.match(connection, /require\('pg'\)/);
  assert.doesNotMatch(connection, /node:sqlite/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS reservas/);
  assert.match(schema, /idx_reservas_comprovante_caminho/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS validacao_tentativas/);
  assert.match(server, /\/api\/comprovantes\/upload/);
  assert.match(server, /\/api\/comprovantes\/autorizacao/);
  assert.match(server, /tentativaPinModel/);
  assert.match(browser, /@vercel\/blob\/client/);
  assert.match(browser, /uploadBlob\(/);
  assert.doesNotMatch(browser, /FileReader/);
  assert.doesNotMatch(browser, /base64/);
  assert.equal(packageJson.dependencies['@vercel/blob'], '^2.8.0');
  assert.ok(packageJson.dependencies.pg);
}

function testarPreco() {
  const hotel = precoService.calcularPreco({
    servico: 'hospedagem_cao',
    quantidadePets: 2,
    diarias: 3,
  });

  assert.equal(hotel.valorTotal, 360);
  assert.equal(hotel.valorAPagarAgora, 60);
  assert.equal(hotel.saldoPendente, 300);

  const domiciliar = precoService.calcularPreco({
    servico: 'domiciliar',
    quantidadePets: 1,
    visitasDia: 2,
    quantidadeDias: 3,
  });

  assert.equal(domiciliar.valorTotal, 300);
  assert.equal(domiciliar.valorAPagarAgora, 60);
}

function testarComprovantes() {
  const pdf = Buffer.from('%PDF-1.7\n');
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
  const webp = Buffer.from('RIFF1234WEBP', 'ascii');

  assert.equal(comprovanteService.detectarTipo(pdf), 'application/pdf');
  assert.equal(comprovanteService.detectarTipo(png), 'image/png');
  assert.equal(comprovanteService.detectarTipo(jpg), 'image/jpeg');
  assert.equal(comprovanteService.detectarTipo(webp), 'image/webp');

  const meta = comprovanteService.validarMetadadosArquivo({
    nomeArquivo: 'comprovante pix.pdf',
    mime: 'application/pdf',
    tamanho: 1024,
  });

  assert.equal(meta.mime, 'application/pdf');
  assert.equal(meta.tamanho, 1024);

  const metaSemMime = comprovanteService.validarMetadadosArquivo({
    nomeArquivo: 'foto.JPG',
    mime: '',
    tamanho: 2048,
  });
  assert.equal(metaSemMime.mime, 'image/jpeg');
  assert.match(comprovanteService.normalizarNomeParaBlob(meta.nomeArquivo, meta.mime), /\.pdf$/);
}

function testarTicket() {
  const preparado = {
    servico: 'domiciliar',
    nomeCliente: 'Pessoa Teste',
    telefone: '14999999999',
    entradaISO: '2099-01-10',
    saidaISO: '2099-01-10',
    quantidadePets: 1,
    quantidadeDias: 1,
    visitasDia: 1,
    diasSemana: [],
    datasOcupacao: ['2099-01-10'],
    observacao: '',
    pets: [{ nome: 'Luna', raca: 'SRD', cuidados: 'Nao' }],
    preco: {
      valorTotal: 50,
      valorSinal: 50,
      valorAPagarAgora: 50,
      saldoPendente: 0,
    },
  };

  const criado = uploadTicketService.criarTicket(preparado);
  const payload = uploadTicketService.validarTicket(criado.ticket, preparado);

  assert.ok(payload.nonce);
  assert.match(uploadTicketService.prefixoDoTicket(payload), /^comprovantes\/[a-f0-9]+\/$/);

  assert.throws(
    () => uploadTicketService.validarTicket(criado.ticket, { ...preparado, telefone: '14888888888' }),
    (error) => error.code === 'UPLOAD_DADOS_DIVERGENTES'
  );
}

async function testarServidorBasico() {
  const server = createServer();

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  try {
    const endereco = server.address();
    const response = await fetch(`http://127.0.0.1:${endereco.port}/api/configuracoes`);
    const data = await response.json();

    assert.equal(response.status, 200);
    assert.equal(data.ok, true);
    assert.equal(data.configuracoes.appVersion, '4.0.0');
    assert.equal(data.configuracoes.maxComprovanteMB, 5);
    assert.equal(data.configuracoes.precos.sinal, 60);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function run() {
  testarEstrutura();
  testarPreco();
  testarComprovantes();
  testarTicket();
  await testarServidorBasico();
  console.log('Smoke test OK: estrutura Vercel/Neon/Blob, precos, tickets e API basica.');
}

run().catch((error) => {
  console.error('Smoke test falhou:');
  console.error(error);
  process.exitCode = 1;
});
