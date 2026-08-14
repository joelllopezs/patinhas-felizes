'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const { URL } = require('url');
const crypto = require('crypto');

const config = require('./config/agendamento');
const reservaModel = require('./models/reservaModel');
const tentativaPinModel = require('./models/tentativaPinModel');
const reservaService = require('./services/reservaService');
const comprovanteService = require('./services/comprovanteService');
const uploadTicketService = require('./services/uploadTicketService');
const {
  DomainError,
  SERVICE_LABELS,
  prepararSolicitacao,
  criarResumoCliente,
  montarMensagemWhatsApp,
  montarLinkWhatsAppEmpresa,
  montarLinkRespostaCliente,
} = require('./services/agendamentoWebService');
const {
  hojeISOEmSaoPaulo,
  formatarDataBR,
} = require('./utils/dateUtils');

const PUBLIC_DIR = path.join(__dirname, 'public');
const MAX_JSON_BYTES = 2 * 1024 * 1024;

class HttpError extends Error {
  constructor(status, message, code = 'ERRO_REQUISICAO', details = undefined) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function cabecalhosSeguranca(res, { permitirInlineStyle = false } = {}) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=()'
  );

  const styleSrc = permitirInlineStyle
    ? "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com"
    : "style-src 'self' https://fonts.googleapis.com";

  res.setHeader(
    'Content-Security-Policy',
    `default-src 'self'; ${styleSrc}; font-src 'self' https://fonts.gstatic.com; ` +
      "img-src 'self' data:; script-src 'self'; connect-src 'self' https://*.vercel-storage.com; " +
      "frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
  );
}

function enviarJSON(res, status, corpo) {
  const json = JSON.stringify(corpo);
  cabecalhosSeguranca(res);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(json),
    'Cache-Control': 'no-store',
  });
  res.end(json);
}

function enviarHTML(res, status, html) {
  cabecalhosSeguranca(res, { permitirInlineStyle: true });
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': Buffer.byteLength(html),
    'Cache-Control': 'no-store',
  });
  res.end(html);
}

function enviarErro(res, error) {
  const status = Number(error?.status) || 500;
  const message = status >= 500
    ? 'Ocorreu um erro interno. Tente novamente.'
    : error.message;
  const code = error?.code || 'ERRO_INTERNO';

  if (status >= 500) {
    console.error('[ERRO]', error);
  }

  enviarJSON(res, status, {
    ok: false,
    error: message,
    code,
    ...(error?.details ? { details: error.details } : {}),
  });
}

async function lerCorpo(req, limite) {
  const tamanhoInformado = Number(req.headers['content-length'] || 0);

  if (tamanhoInformado > limite) {
    throw new HttpError(
      413,
      'O conteúdo enviado ultrapassa o limite permitido.',
      'CONTEUDO_MUITO_GRANDE'
    );
  }

  const partes = [];
  let total = 0;

  for await (const parte of req) {
    total += parte.length;

    if (total > limite) {
      throw new HttpError(
        413,
        'O conteúdo enviado ultrapassa o limite permitido.',
        'CONTEUDO_MUITO_GRANDE'
      );
    }

    partes.push(parte);
  }

  return Buffer.concat(partes);
}

async function lerJSON(req) {
  const buffer = await lerCorpo(req, MAX_JSON_BYTES);

  if (buffer.length === 0) return {};

  try {
    return JSON.parse(buffer.toString('utf8'));
  } catch (_) {
    throw new HttpError(
      400,
      'A requisição não contém um JSON válido.',
      'JSON_INVALIDO'
    );
  }
}

async function lerFormulario(req) {
  const buffer = await lerCorpo(req, 16 * 1024);
  return Object.fromEntries(
    new URLSearchParams(buffer.toString('utf8')).entries()
  );
}

function escaparHTML(valor) {
  return String(valor == null ? '' : valor)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function moeda(valor) {
  return Number(valor || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

function baseUrlDaRequisicao(req) {
  if (config.PUBLIC_BASE_URL) return config.PUBLIC_BASE_URL;

  const protocoloEncaminhado = String(
    req.headers['x-forwarded-proto'] || ''
  )
    .split(',')[0]
    .trim();

  const protocolo =
    protocoloEncaminhado ||
    (req.socket.encrypted ? 'https' : 'http');

  const host = String(
    req.headers.host || `localhost:${config.PORT}`
  )
    .replace(/[\r\n]/g, '')
    .trim();

  return `${protocolo}://${host}`;
}

function normalizarErro(error) {
  if (error instanceof HttpError || error instanceof DomainError) {
    return error;
  }

  const wrapped = new HttpError(
    Number(error?.status) || 500,
    error?.message || 'Erro interno.',
    error?.code || 'ERRO_INTERNO',
    error?.details
  );

  if (wrapped.status >= 500 && error?.stack) {
    wrapped.stack = error.stack;
  }

  return wrapped;
}

async function gerarReservaComBlob(preparado, comprovanteValidado) {
  let ultimoErro = null;

  for (let tentativa = 1; tentativa <= 5; tentativa += 1) {
    const identificadores =
      reservaService.gerarIdentificadores(preparado.servico);

    try {
      return await reservaService.criarPreAgendamento({
        preparado,
        comprovante: comprovanteValidado,
        identificadores,
      });
    } catch (error) {
      ultimoErro = error;

      if (error.code !== 'IDENTIFICADOR_DUPLICADO') {
        throw error;
      }
    }
  }

  throw (
    ultimoErro ||
    new HttpError(
      500,
      'Não foi possível gerar um protocolo único.'
    )
  );
}

function serializarReservaPublica(reserva) {
  return {
    protocolo: reserva.protocolo,
    status: reserva.status,
    servico: reserva.servico,
    servicoLabel: SERVICE_LABELS[reserva.servico],
    valorTotal: reserva.valor_total,
    valorSinal: reserva.valor_sinal,
    valorAPagar: reserva.valor_a_pagar,
    saldoPendente: reserva.saldo_pendente,
  };
}

function mimeEstatico(caminho) {
  const extensao = path.extname(caminho).toLowerCase();

  const tipos = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
  };

  return tipos[extensao] || 'application/octet-stream';
}

function servirEstatico(pathname, res) {
  const mapa = {
    '/': 'index.html',
    '/index.html': 'index.html',
    '/styles.css': 'styles.css',
    '/script.js': 'script.js',
  };

  const arquivo = mapa[pathname];

  if (!arquivo) return false;

  const caminho = path.join(PUBLIC_DIR, arquivo);
  const conteudo = fs.readFileSync(caminho);

  cabecalhosSeguranca(res);

  res.writeHead(200, {
    'Content-Type': mimeEstatico(caminho),
    'Content-Length': conteudo.length,
    'Cache-Control': 'no-cache',
  });

  res.end(conteudo);

  return true;
}

function pinValido(pinRecebido) {
  const esperado = Buffer.from(config.VALIDATION_PIN);
  const recebido = Buffer.from(String(pinRecebido || ''));

  if (esperado.length !== recebido.length) {
    return false;
  }

  return crypto.timingSafeEqual(esperado, recebido);
}

function chaveTentativa(req, token) {
  const encaminhado = String(
    req.headers['x-forwarded-for'] || ''
  );

  const ip = (
    encaminhado.split(',')[0] ||
    req.socket.remoteAddress ||
    'desconhecido'
  ).trim();

  return crypto
    .createHash('sha256')
    .update(`${ip}:${token}`)
    .digest('hex');
}

async function verificarBloqueioPin(req, token) {
  const chave = chaveTentativa(req, token);
  const registro = await tentativaPinModel.buscar(chave);

  if (!registro?.bloqueado_ate) return;

  if (
    new Date(registro.bloqueado_ate).getTime() <= Date.now()
  ) {
    await tentativaPinModel.limpar(chave);
    return;
  }

  throw new HttpError(
    429,
    'Muitas tentativas de PIN. Aguarde alguns minutos e tente novamente.',
    'PIN_BLOQUEADO'
  );
}

async function registrarFalhaPin(req, token) {
  await tentativaPinModel.registrarFalha(
    chaveTentativa(req, token)
  );
}

async function limparFalhasPin(req, token) {
  await tentativaPinModel.limpar(
    chaveTentativa(req, token)
  );
}

function statusLabel(status) {
  const labels = {
    aguardando_validacao: 'Aguardando validação',
    confirmado: 'Confirmado',
    cancelado: 'Cancelado',
    expirado: 'Expirado',
    pendente: 'Pendente',
  };

  return labels[status] || status;
}

function petsHTML(reserva) {
  const pets = Array.isArray(reserva.pets_detalhe)
    ? reserva.pets_detalhe
    : [];

  return pets
    .map(
      (pet, index) => `
      <article class="pet">
        <strong>Pet ${index + 1}: ${escaparHTML(pet.nome)}</strong>
        ${
          pet.raca
            ? `<span>Raça: ${escaparHTML(pet.raca)}</span>`
            : ''
        }
        ${
          pet.porte
            ? `<span>Porte: ${escaparHTML(pet.porte)}</span>`
            : ''
        }
        ${
          pet.convive
            ? `<span>Convivência: ${escaparHTML(pet.convive)}</span>`
            : ''
        }
        ${
          pet.castradoIdade
            ? `<span>Castrado/idade: ${escaparHTML(
                pet.castradoIdade
              )}</span>`
            : ''
        }
        <span>Cuidados: ${escaparHTML(
          pet.cuidados || 'Não possui'
        )}</span>
      </article>
    `
    )
    .join('');
}

function renderValidacao(
  reserva,
  {
    mensagem = '',
    tipoMensagem = 'info',
    linkResposta = '',
  } = {}
) {
  const podeConfirmar =
    reserva.status === 'aguardando_validacao';

  const podeCancelar = [
    'aguardando_validacao',
    'confirmado',
  ].includes(reserva.status);

  const detalhesExtras = [
    reserva.hora_entrada
      ? `<div><span>Entrada</span><strong>${escaparHTML(
          reserva.hora_entrada
        )}</strong></div>`
      : '',
    reserva.hora_saida
      ? `<div><span>Retirada</span><strong>${escaparHTML(
          reserva.hora_saida
        )}</strong></div>`
      : '',
    reserva.endereco
      ? `<div><span>Endereço</span><strong>${escaparHTML(
          reserva.endereco
        )}</strong></div>`
      : '',
    reserva.visitas_dia
      ? `<div><span>Visitas por dia</span><strong>${reserva.visitas_dia}</strong></div>`
      : '',
  ].join('');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Validação rápida — Patinhas Felizes</title>
  <style>
    :root {
      color-scheme: light;
      --bg:#fbf6ec;
      --card:#fff;
      --green:#1e3329;
      --orange:#e2703a;
      --line:rgba(44,74,59,.16);
      --muted:#5b6b57;
      --ok:#1d8d4c;
      --danger:#b7432b;
    }

    * {
      box-sizing:border-box;
    }

    body {
      margin:0;
      background:var(--bg);
      color:var(--green);
      font-family:system-ui,-apple-system,Segoe UI,sans-serif;
      line-height:1.5;
    }

    main {
      width:min(760px,calc(100% - 28px));
      margin:32px auto;
    }

    .brand {
      font-size:1.3rem;
      font-weight:800;
      margin-bottom:18px;
    }

    .card {
      background:var(--card);
      border:1px solid var(--line);
      border-radius:24px;
      padding:clamp(20px,5vw,36px);
      box-shadow:0 18px 50px -30px rgba(30,51,41,.55);
    }

    h1 {
      margin:0 0 4px;
      font-size:clamp(1.55rem,5vw,2.2rem);
    }

    p {
      color:var(--muted);
    }

    .status {
      display:inline-flex;
      padding:7px 12px;
      border-radius:999px;
      background:#f2e9d8;
      font-weight:800;
    }

    .message {
      margin:18px 0;
      padding:14px 16px;
      border-radius:14px;
      font-weight:700;
      background:#eef3ef;
    }

    .message.ok {
      background:#e5f6eb;
      color:var(--ok);
    }

    .message.error {
      background:#fff0eb;
      color:var(--danger);
    }

    .grid {
      display:grid;
      grid-template-columns:1fr 1fr;
      gap:12px;
      margin:22px 0;
    }

    .grid div {
      border:1px solid var(--line);
      border-radius:14px;
      padding:12px;
      overflow-wrap:anywhere;
    }

    .grid span {
      display:block;
      color:var(--muted);
      font-size:.78rem;
      font-weight:700;
      text-transform:uppercase;
      letter-spacing:.06em;
    }

    .grid strong {
      display:block;
      margin-top:3px;
    }

    .pet {
      border:1px dashed var(--line);
      border-radius:14px;
      padding:13px;
      margin:9px 0;
    }

    .pet span {
      display:block;
      color:var(--muted);
      font-size:.92rem;
    }

    .proof {
      display:flex;
      justify-content:center;
      margin:20px 0;
    }

    .button,
    button {
      border:0;
      border-radius:999px;
      padding:13px 20px;
      font:inherit;
      font-weight:800;
      cursor:pointer;
      text-decoration:none;
      display:inline-flex;
      justify-content:center;
      align-items:center;
    }

    .button {
      background:var(--orange);
      color:white;
    }

    .button.whatsapp {
      background:#25d366;
    }

    form {
      border-top:1px solid var(--line);
      margin-top:24px;
      padding-top:24px;
    }

    label {
      display:block;
      font-weight:800;
      margin-bottom:7px;
    }

    input {
      width:100%;
      border:2px solid var(--line);
      border-radius:13px;
      padding:12px 14px;
      font:inherit;
      margin-bottom:14px;
    }

    .actions {
      display:flex;
      gap:10px;
      flex-wrap:wrap;
    }

    button.confirm {
      background:var(--ok);
      color:white;
    }

    button.cancel {
      background:var(--danger);
      color:white;
    }

    .note {
      font-size:.84rem;
    }

    @media (max-width:600px) {
      .grid {
        grid-template-columns:1fr;
      }

      .actions button,
      .button {
        width:100%;
      }
    }
  </style>
</head>

<body>
  <main>
    <div class="brand">🐾 Patinhas Felizes</div>

    <section class="card">
      <h1>Validação rápida</h1>

      <p>
        Este link corresponde a um único pré-agendamento recebido pelo WhatsApp.
      </p>

      <span class="status">
        ${escaparHTML(statusLabel(reserva.status))}
      </span>

      ${
        mensagem
          ? `<div class="message ${escaparHTML(
              tipoMensagem
            )}">${escaparHTML(mensagem)}</div>`
          : ''
      }

      <div class="grid">
        <div>
          <span>Protocolo</span>
          <strong>${escaparHTML(reserva.protocolo)}</strong>
        </div>

        <div>
          <span>Serviço</span>
          <strong>${escaparHTML(
            SERVICE_LABELS[reserva.servico] ||
              reserva.servico
          )}</strong>
        </div>

        <div>
          <span>Tutor</span>
          <strong>${escaparHTML(
            reserva.nome_cliente
          )}</strong>
        </div>

        <div>
          <span>Telefone</span>
          <strong>${escaparHTML(
            reserva.telefone
          )}</strong>
        </div>

        <div>
          <span>Período</span>
          <strong>
            ${formatarDataBR(reserva.entrada)}
            até
            ${formatarDataBR(reserva.saida)}
          </strong>
        </div>

        <div>
          <span>Pets</span>
          <strong>${reserva.quantidade_pets}</strong>
        </div>

        <div>
          <span>Valor total</span>
          <strong>${moeda(reserva.valor_total)}</strong>
        </div>

        <div>
          <span>Sinal esperado</span>
          <strong>${moeda(
            reserva.valor_a_pagar
          )}</strong>
        </div>

        ${detalhesExtras}
      </div>

      ${petsHTML(reserva)}

      ${
        reserva.observacao
          ? `<p><strong>Observações:</strong> ${escaparHTML(
              reserva.observacao
            )}</p>`
          : ''
      }

      <div class="proof">
        <a
          class="button"
          href="/comprovante/${encodeURIComponent(
            reserva.token_comprovante
          )}"
          target="_blank"
          rel="noopener"
        >
          Abrir comprovante
        </a>
      </div>

      ${
        linkResposta
          ? `<a
               class="button whatsapp"
               href="${escaparHTML(linkResposta)}"
               target="_blank"
               rel="noopener"
             >
               Responder ao cliente no WhatsApp
             </a>`
          : ''
      }

      ${
        podeConfirmar || podeCancelar
          ? `
        <form
          method="post"
          action="/validacao/${encodeURIComponent(
            reserva.token_validacao
          )}"
        >
          <label for="pin">PIN da empresa</label>

          <input
            id="pin"
            name="pin"
            type="password"
            inputmode="numeric"
            autocomplete="one-time-code"
            required
            maxlength="32"
            placeholder="Digite o PIN configurado no .env"
          >

          <div class="actions">
            ${
              podeConfirmar
                ? '<button class="confirm" type="submit" name="acao" value="confirmar">Confirmar reserva</button>'
                : ''
            }

            ${
              podeCancelar
                ? '<button class="cancel" type="submit" name="acao" value="cancelar">Cancelar e liberar vagas</button>'
                : ''
            }
          </div>

          <p class="note">
            A vaga já fica reservada no sistema após o envio do comprovante.
            A confirmação valida o pagamento e o cancelamento libera as vagas.
          </p>
        </form>
      `
          : ''
      }
    </section>
  </main>
</body>
</html>`;
}

async function rotear(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const pathname = decodeURIComponent(url.pathname);

  if (
    req.method === 'GET' &&
    servirEstatico(pathname, res)
  ) {
    return;
  }

  if (
    req.method === 'GET' &&
    pathname === '/favicon.ico'
  ) {
    cabecalhosSeguranca(res);

    res.writeHead(204);
    res.end();

    return;
  }

  if (
    req.method === 'GET' &&
    pathname === '/api/configuracoes'
  ) {
    enviarJSON(res, 200, {
      ok: true,
      configuracoes: {
        appVersion: config.APP_VERSION,
        hoje: hojeISOEmSaoPaulo(),
        pixKey: config.PIX_KEY,
        telefoneAtendimento: config.OWNER_WHATSAPP,
        limiteVagasDiario: config.LIMITE_VAGAS_DIARIO,
        maxPets: config.MAX_PETS_POR_RESERVA,
        maxDiasHospedagem: config.MAX_DIAS_HOSPEDAGEM,
        maxDiasCreche: config.MAX_DIAS_CRECHE,
        maxDiasDomiciliar: config.MAX_DIAS_DOMICILIAR,
        maxComprovanteMB: Math.floor(
          config.MAX_COMPROVANTE_BYTES /
            1024 /
            1024
        ),
        precos: {
          hospedagem:
            config.PRECOS.HOSPEDAGEM_DIARIA,
          creche: config.PRECOS.CRECHE,
          domiciliar:
            config.PRECOS.DOMICILIAR,
          sinal: config.PRECOS.SINAL_RESERVA,
        },
      },
    });

    return;
  }

  if (
    req.method === 'POST' &&
    pathname === '/api/disponibilidade'
  ) {
    const payload = await lerJSON(req);

    const preparado =
      await prepararSolicitacao(payload);

    enviarJSON(res, 200, {
      ok: true,
      resumo: criarResumoCliente(preparado),
    });

    return;
  }

  if (
    req.method === 'POST' &&
    pathname === '/api/comprovantes/autorizacao'
  ) {
    const payload = await lerJSON(req);

    const agendamento =
      payload.agendamento &&
      typeof payload.agendamento === 'object'
        ? payload.agendamento
        : {};

    const preparado =
      await prepararSolicitacao(agendamento);

    const arquivo =
      comprovanteService.validarMetadadosArquivo(
        payload.arquivo
      );

    const autorizacao =
      uploadTicketService.criarTicket(preparado);

    const ticketPayload =
      uploadTicketService.validarTicket(
        autorizacao.ticket,
        preparado
      );

    const pathnameBlob =
      uploadTicketService.prefixoDoTicket(
        ticketPayload
      ) +
      comprovanteService.normalizarNomeParaBlob(
        arquivo.nomeArquivo,
        arquivo.mime
      );

    enviarJSON(res, 200, {
      ok: true,
      uploadTicket: autorizacao.ticket,
      pathname: pathnameBlob,
      expiraEm: autorizacao.expiraEm,
    });

    return;
  }

  if (
    req.method === 'POST' &&
    pathname === '/api/comprovantes/upload'
  ) {
    const body = await lerJSON(req);

    const {
      handleUpload,
    } = require('@vercel/blob/client');

    const jsonResponse = await handleUpload({
      body,
      request: req,

      onBeforeGenerateToken: async (
        pathnameRecebido,
        clientPayload
      ) => {
        const ticketPayload =
          uploadTicketService.validarTicket(
            clientPayload
          );

        const prefixo =
          uploadTicketService.prefixoDoTicket(
            ticketPayload
          );

        if (
          !String(pathnameRecebido || '').startsWith(
            prefixo
          ) ||
          String(pathnameRecebido || '').includes('..')
        ) {
          throw new HttpError(
            403,
            'Destino de upload inválido.',
            'UPLOAD_NAO_AUTORIZADO'
          );
        }

        return {
          allowedContentTypes:
            comprovanteService.TIPOS_PERMITIDOS,

          maximumSizeInBytes:
            config.MAX_COMPROVANTE_BYTES,

          addRandomSuffix: true,

          cacheControlMaxAge: 60,

          tokenPayload: JSON.stringify({
            nonce: ticketPayload.nonce,
          }),
        };
      },
    });

    enviarJSON(res, 200, jsonResponse);

    return;
  }

  if (
    req.method === 'POST' &&
    pathname === '/api/pre-agendamentos'
  ) {
    const payload = await lerJSON(req);

    const preparado =
      await prepararSolicitacao(payload);

    let comprovanteValidado = null;
    let reservaCriada = false;

    try {
      comprovanteValidado =
        await comprovanteService.validarBlobRecebido(
          payload.comprovante,
          preparado
        );

      const reserva =
        await gerarReservaComBlob(
          preparado,
          comprovanteValidado
        );

      reservaCriada = true;

      const baseUrl =
        baseUrlDaRequisicao(req);

      const mensagem =
        montarMensagemWhatsApp(
          reserva,
          baseUrl
        );

      enviarJSON(res, 201, {
        ok: true,

        reserva:
          serializarReservaPublica(reserva),

        whatsappUrl:
          montarLinkWhatsAppEmpresa(mensagem),

        mensagem:
          'Comprovante recebido, vaga reservada e protocolo criado. Abra o WhatsApp e envie a mensagem preparada para o estabelecimento.',
      });

      return;
    } catch (error) {
      if (
        comprovanteValidado?.nomeInterno &&
        !reservaCriada &&
        error?.code !==
          'COMPROVANTE_JA_UTILIZADO'
      ) {
        try {
          await comprovanteService.removerComprovante(
            comprovanteValidado.nomeInterno
          );
        } catch (cleanupError) {
          console.error(
            '[BLOB] Falha ao limpar comprovante sem reserva:',
            cleanupError
          );
        }
      }

      throw error;
    }
  }

  const comprovanteMatch = pathname.match(
    /^\/comprovante\/([a-f0-9]{48})\/?$/i
  );

  if (
    req.method === 'GET' &&
    comprovanteMatch
  ) {
    const reserva =
      await reservaModel.buscarPorTokenComprovante(
        comprovanteMatch[1]
      );

    if (
      !reserva ||
      !reserva.comprovante_caminho
    ) {
      throw new HttpError(
        404,
        'Comprovante não encontrado.',
        'COMPROVANTE_NAO_ENCONTRADO'
      );
    }

    const resultado =
      await comprovanteService.obterComprovante(
        reserva.comprovante_caminho
      );

    if (
      !resultado?.stream ||
      !resultado?.blob
    ) {
      throw new HttpError(
        404,
        'Arquivo do comprovante não encontrado.',
        'COMPROVANTE_NAO_ENCONTRADO'
      );
    }

    const nome = String(
      reserva.comprovante_nome ||
        'comprovante'
    ).replace(/[\r\n"]/g, '_');

    const stream =
      comprovanteService.streamParaNode(
        resultado.stream
      );

    cabecalhosSeguranca(res);

    res.writeHead(200, {
      'Content-Type':
        reserva.comprovante_mime ||
        resultado.blob.contentType ||
        'application/octet-stream',

      ...(resultado.blob.size
        ? {
            'Content-Length': String(
              resultado.blob.size
            ),
          }
        : {}),

      'Content-Disposition':
        `inline; filename="${nome}"`,

      'Cache-Control':
        'private, no-store',
    });

    stream.on('error', (error) => {
      console.error(
        '[BLOB] Falha durante leitura do comprovante:',
        error
      );

      if (!res.destroyed) {
        res.destroy(error);
      }
    });

    stream.pipe(res);

    return;
  }

  const validacaoMatch = pathname.match(
    /^\/validacao\/([a-f0-9]{64})\/?$/i
  );

  if (
    validacaoMatch &&
    req.method === 'GET'
  ) {
    await reservaModel.expirarPendentes();

    const reserva =
      await reservaModel.buscarPorTokenValidacao(
        validacaoMatch[1]
      );

    if (!reserva) {
      enviarHTML(
        res,
        404,
        '<!doctype html><meta charset="utf-8"><title>Não encontrado</title><p>Solicitação não encontrada.</p>'
      );

      return;
    }

    enviarHTML(
      res,
      200,
      renderValidacao(reserva)
    );

    return;
  }

  if (
    validacaoMatch &&
    req.method === 'POST'
  ) {
    await verificarBloqueioPin(
      req,
      validacaoMatch[1]
    );

    const formulario =
      await lerFormulario(req);

    if (!pinValido(formulario.pin)) {
      await registrarFalhaPin(
        req,
        validacaoMatch[1]
      );

      const reserva =
        await reservaModel.buscarPorTokenValidacao(
          validacaoMatch[1]
        );

      if (!reserva) {
        throw new HttpError(
          404,
          'Solicitação não encontrada.',
          'RESERVA_NAO_ENCONTRADA'
        );
      }

      enviarHTML(
        res,
        403,
        renderValidacao(reserva, {
          mensagem:
            'PIN incorreto. Confira a variável VALIDATION_PIN configurada no ambiente.',
          tipoMensagem: 'error',
        })
      );

      return;
    }

    await limparFalhasPin(
      req,
      validacaoMatch[1]
    );

    const acao = String(
      formulario.acao || ''
    );

    let resultado;

    if (acao === 'confirmar') {
      resultado =
        await reservaService.confirmarPorToken(
          validacaoMatch[1]
        );
    } else if (acao === 'cancelar') {
      resultado =
        await reservaService.cancelarPorToken(
          validacaoMatch[1]
        );
    } else {
      throw new HttpError(
        400,
        'Ação inválida.',
        'ACAO_INVALIDA'
      );
    }

    const reserva =
      resultado.reserva ||
      (await reservaModel.buscarPorTokenValidacao(
        validacaoMatch[1]
      ));

    const linkResposta = reserva
      ? montarLinkRespostaCliente(
          reserva,
          resultado.ok &&
            acao === 'confirmar'
            ? 'confirmado'
            : 'cancelado'
        )
      : '';

    enviarHTML(
      res,
      resultado.ok ? 200 : 409,
      renderValidacao(reserva, {
        mensagem: resultado.ok
          ? acao === 'confirmar'
            ? 'Pagamento validado e reserva confirmada. As vagas já estavam reservadas desde o envio do comprovante.'
            : 'Reserva cancelada. As vagas foram liberadas.'
          : resultado.error,

        tipoMensagem:
          resultado.ok
            ? 'ok'
            : 'error',

        linkResposta:
          resultado.ok
            ? linkResposta
            : '',
      })
    );

    return;
  }

  if (pathname.startsWith('/api/')) {
    throw new HttpError(
      404,
      'Rota da API não encontrada.',
      'ROTA_NAO_ENCONTRADA'
    );
  }

  enviarHTML(
    res,
    404,
    '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Página não encontrada</title><body><p>Página não encontrada.</p><a href="/">Voltar ao início</a></body></html>'
  );
}

function createServer() {
  return http.createServer(
    async (req, res) => {
      try {
        await rotear(req, res);
      } catch (error) {
        if (res.headersSent) {
          res.destroy();
          return;
        }

        enviarErro(
          res,
          normalizarErro(error)
        );
      }
    }
  );
}

const server = createServer();

function iniciar() {
  if (server.listening) {
    return server;
  }

  server.listen(
    config.PORT,
    config.HOST,
    () => {
      console.log(
        `\n🐾 Patinhas Felizes disponível em http://localhost:${config.PORT}`
      );

      console.log(
        '✅ Fluxo público, comprovante, protocolo e validação rápida pelo WhatsApp ativos.'
      );

      console.log(
        'ℹ️ Não existe painel administrativo nesta versão.'
      );

      if (
        config.VALIDATION_PIN === '2468'
      ) {
        console.log(
          '⚠️ Troque o VALIDATION_PIN padrão nas variáveis de ambiente antes de publicar.'
        );
      }

      if (!config.PUBLIC_BASE_URL) {
        console.log(
          '⚠️ Em produção, configure PUBLIC_BASE_URL para gerar links acessíveis no celular.'
        );
      }

      console.log('');
    }
  );

  return server;
}

// A Vercel exige que o export principal seja
// uma função ou um http.Server.
//
// Mantemos createServer/iniciar como propriedades
// para os testes e para execução local.
module.exports = server;
module.exports.createServer = createServer;
module.exports.iniciar = iniciar;

// Localmente executamos o listen() normalmente.
// Na Vercel ela recebe o http.Server exportado acima.
if (
  require.main === module &&
  !process.env.VERCEL
) {
  iniciar();
}