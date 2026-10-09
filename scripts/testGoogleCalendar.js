'use strict';

const { google } = require('googleapis');

require('../utils/loadEnv')();

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

const refreshToken = String(
  process.env.GOOGLE_REFRESH_TOKEN || ''
).trim();

const calendarId = String(
  process.env.GOOGLE_CALENDAR_ID ||
    'primary'
).trim();

function validarConfiguracao() {
  const faltando = [];

  if (!clientId) {
    faltando.push(
      'GOOGLE_CLIENT_ID'
    );
  }

  if (!clientSecret) {
    faltando.push(
      'GOOGLE_CLIENT_SECRET'
    );
  }

  if (!redirectUri) {
    faltando.push(
      'GOOGLE_REDIRECT_URI'
    );
  }

  if (!refreshToken) {
    faltando.push(
      'GOOGLE_REFRESH_TOKEN'
    );
  }

  if (faltando.length > 0) {
    console.error('');
    console.error(
      '❌ Faltam configurações no arquivo .env:'
    );

    faltando.forEach(
      (nome) => {
        console.error(
          `   - ${nome}`
        );
      }
    );

    console.error('');
    process.exit(1);
  }
}

async function criarEventoTeste() {
  validarConfiguracao();

  const oauth2Client =
    new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri
    );

  oauth2Client.setCredentials({
    refresh_token:
      refreshToken,
  });

  const calendar =
    google.calendar({
      version: 'v3',
      auth: oauth2Client,
    });

  const agora =
    new Date();

  const inicio =
    new Date(
      agora.getTime() +
        10 * 60 * 1000
    );

  const fim =
    new Date(
      inicio.getTime() +
        60 * 60 * 1000
    );

  const evento = {
    summary:
      '🐾 Teste Patinhas Felizes',

    description: [
      'Evento criado automaticamente',
      'pela integração da',
      'Patinhas Felizes.',
      '',
      'Este é somente um teste',
      'da Google Calendar API.',
    ].join('\n'),

    start: {
      dateTime:
        inicio.toISOString(),

      timeZone:
        'America/Sao_Paulo',
    },

    end: {
      dateTime:
        fim.toISOString(),

      timeZone:
        'America/Sao_Paulo',
    },

    reminders: {
      useDefault: false,

      overrides: [
        {
          method: 'popup',
          minutes: 10,
        },
      ],
    },
  };

  console.log('');
  console.log(
    '🐾 Patinhas Felizes'
  );

  console.log(
    'Testando integração com Google Agenda...'
  );

  console.log('');

  try {
    const resposta =
      await calendar.events.insert({
        calendarId,

        requestBody:
          evento,
      });

    const eventoCriado =
      resposta.data;

    console.log(
      '✅ Evento criado com sucesso!'
    );

    console.log('');

    console.log(
      'Título:'
    );

    console.log(
      eventoCriado.summary
    );

    console.log('');

    console.log(
      'ID do evento:'
    );

    console.log(
      eventoCriado.id
    );

    console.log('');

    console.log(
      'Início:'
    );

    console.log(
      eventoCriado.start?.dateTime ||
        eventoCriado.start?.date
    );

    console.log('');

    console.log(
      'Fim:'
    );

    console.log(
      eventoCriado.end?.dateTime ||
        eventoCriado.end?.date
    );

    if (
      eventoCriado.htmlLink
    ) {
      console.log('');

      console.log(
        'Abrir no Google Agenda:'
      );

      console.log(
        eventoCriado.htmlLink
      );
    }

    console.log('');

    console.log(
      '🎉 Integração funcionando.'
    );

    console.log('');
  } catch (error) {
    console.error('');
    console.error(
      '❌ Não foi possível criar o evento.'
    );

    console.error('');

    const resposta =
      error?.response?.data;

    if (resposta) {
      console.error(
        JSON.stringify(
          resposta,
          null,
          2
        )
      );
    } else {
      console.error(
        error?.message ||
          error
      );
    }

    console.error('');

    process.exitCode = 1;
  }
}

criarEventoTeste();