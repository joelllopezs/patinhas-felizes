'use strict';

const http = require('node:http');
const crypto = require('node:crypto');
const { URL } = require('node:url');
const { google } = require('googleapis');

require('../utils/loadEnv')();

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
];

const clientId = String(
  process.env.GOOGLE_CLIENT_ID || ''
).trim();

const clientSecret = String(
  process.env.GOOGLE_CLIENT_SECRET || ''
).trim();

const redirectUri = String(
  process.env.GOOGLE_REDIRECT_URI ||
    'http://localhost:3000/google/callback'
).trim();

function validarConfiguracao() {
  const faltando = [];

  if (!clientId) {
    faltando.push('GOOGLE_CLIENT_ID');
  }

  if (!clientSecret) {
    faltando.push('GOOGLE_CLIENT_SECRET');
  }

  if (!redirectUri) {
    faltando.push('GOOGLE_REDIRECT_URI');
  }

  if (faltando.length > 0) {
    console.error('');
    console.error(
      '❌ Faltam configurações do Google no arquivo .env:'
    );

    faltando.forEach((nome) => {
      console.error(`   - ${nome}`);
    });

    console.error('');
    process.exit(1);
  }

  let url;

  try {
    url = new URL(redirectUri);
  } catch (_) {
    console.error('');
    console.error(
      '❌ GOOGLE_REDIRECT_URI não contém uma URL válida.'
    );
    console.error('');
    process.exit(1);
  }

  if (
    url.protocol !== 'http:' &&
    url.protocol !== 'https:'
  ) {
    console.error('');
    console.error(
      '❌ GOOGLE_REDIRECT_URI deve começar com http:// ou https://.'
    );
    console.error('');
    process.exit(1);
  }

  return url;
}

const redirectUrl = validarConfiguracao();

const oauth2Client =
  new google.auth.OAuth2(
    clientId,
    clientSecret,
    redirectUri
  );

const estadosValidos = new Map();

function limparEstadosExpirados() {
  const agora = Date.now();

  for (const [
    estado,
    criadoEm,
  ] of estadosValidos.entries()) {
    if (
      agora - criadoEm >
      10 * 60 * 1000
    ) {
      estadosValidos.delete(
        estado
      );
    }
  }
}

function gerarEstado() {
  limparEstadosExpirados();

  const estado =
    crypto
      .randomBytes(32)
      .toString('hex');

  estadosValidos.set(
    estado,
    Date.now()
  );

  return estado;
}

function consumirEstado(estado) {
  limparEstadosExpirados();

  const existe =
    estadosValidos.has(
      estado
    );

  if (existe) {
    estadosValidos.delete(
      estado
    );
  }

  return existe;
}

function gerarUrlAutorizacao() {
  const state =
    gerarEstado();

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',

    prompt: 'consent',

    scope: SCOPES,

    include_granted_scopes: true,

    state,
  });
}

function escaparHTML(valor) {
  return String(
    valor == null
      ? ''
      : valor
  )
    .replace(
      /&/g,
      '&amp;'
    )
    .replace(
      /</g,
      '&lt;'
    )
    .replace(
      />/g,
      '&gt;'
    )
    .replace(
      /"/g,
      '&quot;'
    )
    .replace(
      /'/g,
      '&#039;'
    );
}

function enviarHTML(
  res,
  status,
  html
) {
  res.writeHead(
    status,
    {
      'Content-Type':
        'text/html; charset=utf-8',

      'Cache-Control':
        'no-store',

      'X-Content-Type-Options':
        'nosniff',

      'X-Frame-Options':
        'DENY',

      'Referrer-Policy':
        'no-referrer',
    }
  );

  res.end(html);
}

function paginaInicial() {
  return `
<!DOCTYPE html>
<html lang="pt-BR">

<head>
  <meta charset="UTF-8">

  <meta
    name="viewport"
    content="width=device-width, initial-scale=1.0"
  >

  <title>
    Conectar Google Agenda
  </title>

  <style>
    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 24px;
      background: #fbf6ec;
      color: #1e3329;
      font-family:
        system-ui,
        -apple-system,
        BlinkMacSystemFont,
        "Segoe UI",
        sans-serif;
    }

    .card {
      width: min(
        580px,
        100%
      );
      padding: 32px;
      background: #ffffff;
      border-radius: 24px;
      box-shadow:
        0 20px 60px
        rgba(
          30,
          51,
          41,
          0.15
        );
    }

    h1 {
      margin:
        0 0 10px;
    }

    p {
      line-height: 1.6;
      color: #5b6b57;
    }

    .button {
      display:
        inline-flex;

      align-items:
        center;

      justify-content:
        center;

      margin-top:
        14px;

      padding:
        14px 22px;

      border-radius:
        999px;

      background:
        #2c4a3b;

      color:
        #ffffff;

      font-weight:
        800;

      text-decoration:
        none;
    }

    .warning {
      margin-top:
        22px;

      padding:
        14px;

      border-radius:
        14px;

      background:
        #fff6dc;

      font-size:
        0.9rem;

      color:
        #6b5420;
    }
  </style>
</head>

<body>
  <main class="card">

    <h1>
      🐾 Google Agenda
    </h1>

    <p>
      Esta página serve somente
      para autorizar a conta Google
      que receberá os agendamentos
      da Patinhas Felizes.
    </p>

    <p>
      Durante os testes,
      entre com uma das contas
      adicionadas como usuário
      de teste no Google Cloud.
    </p>

    <a
      class="button"
      href="/google/conectar"
    >
      Conectar Google Agenda
    </a>

    <div class="warning">
      O Client Secret e o Refresh Token
      não devem ser enviados para o GitHub.
    </div>

  </main>
</body>

</html>
`;
}

function paginaSucesso(
  refreshToken
) {
  return `
<!DOCTYPE html>
<html lang="pt-BR">

<head>
  <meta charset="UTF-8">

  <meta
    name="viewport"
    content="width=device-width, initial-scale=1.0"
  >

  <title>
    Google Agenda conectado
  </title>

  <style>
    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 24px;
      background: #fbf6ec;
      color: #1e3329;
      font-family:
        system-ui,
        -apple-system,
        BlinkMacSystemFont,
        "Segoe UI",
        sans-serif;
    }

    .card {
      width: min(
        720px,
        100%
      );
      padding: 32px;
      background: #ffffff;
      border-radius: 24px;
      box-shadow:
        0 20px 60px
        rgba(
          30,
          51,
          41,
          0.15
        );
    }

    h1 {
      margin:
        0 0 10px;

      color:
        #1d8d4c;
    }

    p {
      line-height: 1.6;
      color: #5b6b57;
    }

    code {
      display: block;
      padding: 16px;
      margin: 18px 0;
      border-radius: 14px;
      background: #f2e9d8;
      color: #1e3329;
      overflow-wrap: anywhere;
      word-break: break-all;
      user-select: all;
    }

    .warning {
      padding: 14px;
      border-radius: 14px;
      background: #fff0eb;
      color: #8e3927;
      font-weight: 700;
    }
  </style>
</head>

<body>
  <main class="card">

    <h1>
      ✅ Google Agenda autorizado
    </h1>

    <p>
      O Google retornou o Refresh Token
      necessário para o backend.
    </p>

    <p>
      Adicione a seguinte linha
      ao seu arquivo
      <strong>.env</strong>:
    </p>

    <code>GOOGLE_REFRESH_TOKEN=${escaparHTML(
      refreshToken
    )}</code>

    <div class="warning">
      ⚠️ Este token é secreto.
      Não envie para ninguém,
      não coloque no GitHub
      e não publique prints contendo
      esse valor.
    </div>

    <p>
      Depois de salvar o token no
      .env, você pode fechar esta página
      e encerrar este servidor
      pressionando Ctrl + C
      no terminal.
    </p>

  </main>
</body>

</html>
`;
}

function paginaSemRefreshToken() {
  return `
<!DOCTYPE html>
<html lang="pt-BR">

<head>
  <meta charset="UTF-8">

  <meta
    name="viewport"
    content="width=device-width, initial-scale=1.0"
  >

  <title>
    Refresh Token não recebido
  </title>
</head>

<body
  style="
    margin:0;
    min-height:100vh;
    display:grid;
    place-items:center;
    padding:24px;
    background:#fbf6ec;
    color:#1e3329;
    font-family:system-ui,sans-serif;
  "
>

  <main
    style="
      width:min(650px,100%);
      background:#fff;
      padding:32px;
      border-radius:24px;
    "
  >

    <h1>
      ⚠️ Refresh Token não recebido
    </h1>

    <p>
      A autorização foi concluída,
      mas o Google não retornou
      um novo Refresh Token.
    </p>

    <p>
      Isso costuma acontecer quando
      a conta já autorizou este aplicativo
      anteriormente.
    </p>

    <p>
      Remova o acesso do aplicativo
      nas configurações da sua Conta Google
      e execute novamente:
    </p>

    <pre>npm run google:auth</pre>

  </main>
</body>

</html>
`;
}

async function tratarCallback(
  req,
  res,
  url
) {
  const error =
    url.searchParams.get(
      'error'
    );

  if (error) {
    enviarHTML(
      res,
      400,
      `
        <!doctype html>
        <meta charset="utf-8">

        <h1>
          Autorização cancelada
        </h1>

        <p>
          O Google retornou:
          ${escaparHTML(error)}
        </p>
      `
    );

    return;
  }

  const code =
    url.searchParams.get(
      'code'
    );

  const state =
    url.searchParams.get(
      'state'
    );

  if (!state) {
    enviarHTML(
      res,
      400,
      `
        <!doctype html>
        <meta charset="utf-8">

        <h1>
          Estado OAuth ausente.
        </h1>
      `
    );

    return;
  }

  if (
    !consumirEstado(
      state
    )
  ) {
    enviarHTML(
      res,
      400,
      `
        <!doctype html>
        <meta charset="utf-8">

        <h1>
          Estado OAuth inválido ou expirado.
        </h1>

        <p>
          Inicie novamente a conexão
          pelo endereço local.
        </p>
      `
    );

    return;
  }

  if (!code) {
    enviarHTML(
      res,
      400,
      `
        <!doctype html>
        <meta charset="utf-8">

        <h1>
          Código de autorização não recebido.
        </h1>
      `
    );

    return;
  }

  try {
    const {
      tokens,
    } =
      await oauth2Client.getToken(
        code
      );

    oauth2Client.setCredentials(
      tokens
    );

    console.log('');
    console.log(
      '✅ Autorização Google concluída.'
    );

    if (
      tokens.refresh_token
    ) {
      console.log('');
      console.log(
        '=========================================='
      );

      console.log(
        'GOOGLE_REFRESH_TOKEN=' +
          tokens.refresh_token
      );

      console.log(
        '=========================================='
      );

      console.log('');
      console.log(
        '⚠️ Guarde este token no .env e não publique no GitHub.'
      );

      console.log('');

      enviarHTML(
        res,
        200,
        paginaSucesso(
          tokens.refresh_token
        )
      );

      return;
    }

    console.log('');
    console.log(
      '⚠️ O Google não retornou um novo Refresh Token.'
    );

    console.log('');

    enviarHTML(
      res,
      200,
      paginaSemRefreshToken()
    );
  } catch (error) {
    console.error('');
    console.error(
      '❌ Falha ao trocar o código OAuth pelos tokens:'
    );

    console.error(
      error
    );

    enviarHTML(
      res,
      500,
      `
        <!doctype html>
        <meta charset="utf-8">

        <h1>
          Erro ao concluir autorização.
        </h1>

        <p>
          Confira o terminal para ver
          os detalhes.
        </p>
      `
    );
  }
}

const hostname =
  redirectUrl.hostname;

const porta =
  Number(
    redirectUrl.port ||
      (
        redirectUrl.protocol ===
        'https:'
          ? 443
          : 80
      )
  );

const callbackPath =
  redirectUrl.pathname;

const servidor =
  http.createServer(
    async (
      req,
      res
    ) => {
      try {
        const url =
          new URL(
            req.url,
            `http://${req.headers.host}`
          );

        if (
          req.method ===
            'GET' &&
          url.pathname ===
            '/'
        ) {
          enviarHTML(
            res,
            200,
            paginaInicial()
          );

          return;
        }

        if (
          req.method ===
            'GET' &&
          url.pathname ===
            '/google/conectar'
        ) {
          const authorizationUrl =
            gerarUrlAutorizacao();

          res.writeHead(
            302,
            {
              Location:
                authorizationUrl,

              'Cache-Control':
                'no-store',
            }
          );

          res.end();

          return;
        }

        if (
          req.method ===
            'GET' &&
          url.pathname ===
            callbackPath
        ) {
          await tratarCallback(
            req,
            res,
            url
          );

          return;
        }

        enviarHTML(
          res,
          404,
          `
            <!doctype html>
            <meta charset="utf-8">

            <h1>
              Página não encontrada
            </h1>

            <p>
              <a href="/">
                Voltar
              </a>
            </p>
          `
        );
      } catch (error) {
        console.error(
          error
        );

        if (
          !res.headersSent
        ) {
          enviarHTML(
            res,
            500,
            `
              <!doctype html>
              <meta charset="utf-8">

              <h1>
                Erro interno
              </h1>
            `
          );
        } else {
          res.destroy();
        }
      }
    }
  );

servidor.listen(
  porta,
  hostname,
  () => {
    console.log('');
    console.log(
      '🐾 Autorização Google Agenda'
    );

    console.log(
      '──────────────────────────────────────────'
    );

    console.log(
      `Servidor temporário: http://${hostname}:${porta}`
    );

    console.log('');
    console.log(
      'Abra no navegador:'
    );

    console.log(
      `http://${hostname}:${porta}/google/conectar`
    );

    console.log('');
    console.log(
      'Depois de autorizar sua conta Google,'
    );

    console.log(
      'o Refresh Token aparecerá nesta tela'
    );

    console.log(
      'e também no terminal.'
    );

    console.log('');
    console.log(
      'Pressione Ctrl + C para encerrar.'
    );

    console.log('');
  }
);