'use strict';

const crypto = require('crypto');
const { google } = require('googleapis');

require('../utils/loadEnv')();

const {
  SERVICOS,
} = require('../config/agendamento');

const TIME_ZONE = 'America/Sao_Paulo';

const GOOGLE_CLIENT_ID = String(
  process.env.GOOGLE_CLIENT_ID || ''
).trim();

const GOOGLE_CLIENT_SECRET = String(
  process.env.GOOGLE_CLIENT_SECRET || ''
).trim();

const GOOGLE_REDIRECT_URI = String(
  process.env.GOOGLE_REDIRECT_URI ||
    'http://localhost:3000/google/callback'
).trim();

const GOOGLE_REFRESH_TOKEN = String(
  process.env.GOOGLE_REFRESH_TOKEN || ''
).trim();

const GOOGLE_CALENDAR_ID = String(
  process.env.GOOGLE_CALENDAR_ID ||
    'primary'
).trim();

function estaConfigurado() {
  return Boolean(
    GOOGLE_CLIENT_ID &&
      GOOGLE_CLIENT_SECRET &&
      GOOGLE_REFRESH_TOKEN &&
      GOOGLE_CALENDAR_ID
  );
}

function criarClienteCalendar() {
  if (!estaConfigurado()) {
    throw new Error(
      'Integração Google Calendar não configurada.'
    );
  }

  const oauth2Client =
    new google.auth.OAuth2(
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET,
      GOOGLE_REDIRECT_URI
    );

  oauth2Client.setCredentials({
    refresh_token: GOOGLE_REFRESH_TOKEN,
  });

  return google.calendar({
    version: 'v3',
    auth: oauth2Client,
  });
}

function normalizarTexto(valor) {
  return String(
    valor == null ? '' : valor
  ).trim();
}

function formatarMoeda(valor) {
  return Number(valor || 0).toLocaleString(
    'pt-BR',
    {
      style: 'currency',
      currency: 'BRL',
    }
  );
}

function formatarDataBR(dataISO) {
  if (!dataISO) return '';

  const partes =
    String(dataISO)
      .slice(0, 10)
      .split('-');

  if (partes.length !== 3) {
    return String(dataISO);
  }

  return `${partes[2]}/${partes[1]}/${partes[0]}`;
}

function adicionarDias(dataISO, dias) {
  const [
    ano,
    mes,
    dia,
  ] = String(dataISO)
    .slice(0, 10)
    .split('-')
    .map(Number);

  const data =
    new Date(
      Date.UTC(
        ano,
        mes - 1,
        dia
      )
    );

  data.setUTCDate(
    data.getUTCDate() + dias
  );

  return data
    .toISOString()
    .slice(0, 10);
}

function listarDatasInclusive(
  inicioISO,
  fimISO
) {
  if (!inicioISO || !fimISO) {
    return [];
  }

  const resultado = [];
  let atual =
    String(inicioISO).slice(0, 10);

  const fim =
    String(fimISO).slice(0, 10);

  while (atual <= fim) {
    resultado.push(atual);

    atual =
      adicionarDias(
        atual,
        1
      );

    if (resultado.length > 370) {
      break;
    }
  }

  return resultado;
}

function labelServico(servico) {
  if (
    servico ===
    SERVICOS.HOSPEDAGEM_CAO
  ) {
    return 'Hospedagem de cão';
  }

  if (
    servico ===
    SERVICOS.HOSPEDAGEM_GATO
  ) {
    return 'Hospedagem de gato';
  }

  if (
    servico ===
    SERVICOS.CRECHE
  ) {
    return 'Creche';
  }

  if (
    servico ===
    SERVICOS.DOMICILIAR
  ) {
    return 'Atendimento domiciliar';
  }

  return servico || 'Agendamento';
}

function nomesPets(reserva) {
  const pets =
    Array.isArray(
      reserva.pets_detalhe
    )
      ? reserva.pets_detalhe
      : [];

  const nomes =
    pets
      .map((pet) =>
        normalizarTexto(
          pet?.nome
        )
      )
      .filter(Boolean);

  if (nomes.length > 0) {
    return nomes.join(', ');
  }

  const quantidade =
    Number(
      reserva.quantidade_pets || 0
    );

  return quantidade === 1
    ? '1 pet'
    : `${quantidade} pets`;
}

function detalhesPets(reserva) {
  const pets =
    Array.isArray(
      reserva.pets_detalhe
    )
      ? reserva.pets_detalhe
      : [];

  if (pets.length === 0) {
    return [];
  }

  return pets.map(
    (pet, index) => {
      const detalhes = [];

      if (pet.nome) {
        detalhes.push(
          normalizarTexto(
            pet.nome
          )
        );
      } else {
        detalhes.push(
          `Pet ${index + 1}`
        );
      }

      if (pet.raca) {
        detalhes.push(
          `Raça: ${normalizarTexto(
            pet.raca
          )}`
        );
      }

      if (pet.porte) {
        detalhes.push(
          `Porte: ${normalizarTexto(
            pet.porte
          )}`
        );
      }

      if (pet.cuidados) {
        detalhes.push(
          `Cuidados: ${normalizarTexto(
            pet.cuidados
          )}`
        );
      }

      return detalhes.join(
        ' | '
      );
    }
  );
}

function montarDescricao(
  reserva
) {
  const linhas = [
    '🐾 PATINHAS FELIZES',
    '',
    `Protocolo: ${normalizarTexto(
      reserva.protocolo
    )}`,
    `Serviço: ${labelServico(
      reserva.servico
    )}`,
    '',
    `Tutor: ${normalizarTexto(
      reserva.nome_cliente
    )}`,
    `Telefone: ${normalizarTexto(
      reserva.telefone
    )}`,
    `Pet(s): ${nomesPets(
      reserva
    )}`,
  ];

  const pets =
    detalhesPets(
      reserva
    );

  if (pets.length > 0) {
    linhas.push('');
    linhas.push(
      'Detalhes dos pets:'
    );

    pets.forEach(
      (pet) => {
        linhas.push(
          `• ${pet}`
        );
      }
    );
  }

  linhas.push('');
  linhas.push(
    `Entrada: ${formatarDataBR(
      reserva.entrada
    )}${
      reserva.hora_entrada
        ? ` às ${reserva.hora_entrada}`
        : ''
    }`
  );

  linhas.push(
    `Saída: ${formatarDataBR(
      reserva.saida
    )}${
      reserva.hora_saida
        ? ` às ${reserva.hora_saida}`
        : ''
    }`
  );

  if (
    reserva.visitas_dia
  ) {
    linhas.push(
      `Visitas por dia: ${reserva.visitas_dia}`
    );
  }

  if (
    reserva.endereco
  ) {
    linhas.push(
      `Endereço: ${normalizarTexto(
        reserva.endereco
      )}`
    );
  }

  linhas.push('');
  linhas.push(
    `Valor total: ${formatarMoeda(
      reserva.valor_total
    )}`
  );

  linhas.push(
    `Valor pago/sinal: ${formatarMoeda(
      reserva.valor_a_pagar
    )}`
  );

  linhas.push(
    `Saldo pendente: ${formatarMoeda(
      reserva.saldo_pendente
    )}`
  );

  if (
    reserva.observacao
  ) {
    linhas.push('');
    linhas.push(
      `Observações: ${normalizarTexto(
        reserva.observacao
      )}`
    );
  }

  linhas.push('');
  linhas.push(
    'Reserva confirmada pelo sistema Patinhas Felizes.'
  );

  return linhas.join('\n');
}

function gerarEventoId(
  protocolo,
  sufixo = 'principal'
) {
  const hash =
    crypto
      .createHash('sha256')
      .update(
        `${protocolo}:${sufixo}`
      )
      .digest('hex');

  return `pf${hash.slice(
    0,
    40
  )}`;
}

function horaValida(
  hora,
  fallback
) {
  const valor =
    normalizarTexto(
      hora
    );

  if (
    /^\d{2}:\d{2}$/.test(
      valor
    )
  ) {
    return valor;
  }

  return fallback;
}

function dataHoraLocal(
  dataISO,
  hora,
  fallback
) {
  return `${String(
    dataISO
  ).slice(0, 10)}T${horaValida(
    hora,
    fallback
  )}:00`;
}

function montarEventoHospedagem(
  reserva
) {
  const titulo =
    `🐾 ${labelServico(
      reserva.servico
    )} — ${nomesPets(
      reserva
    )}`;

  return {
    id: gerarEventoId(
      reserva.protocolo,
      'hospedagem'
    ),

    summary: titulo,

    description:
      montarDescricao(
        reserva
      ),

    start: {
      dateTime:
        dataHoraLocal(
          reserva.entrada,
          reserva.hora_entrada,
          '08:00'
        ),

      timeZone:
        TIME_ZONE,
    },

    end: {
      dateTime:
        dataHoraLocal(
          reserva.saida,
          reserva.hora_saida,
          '18:00'
        ),

      timeZone:
        TIME_ZONE,
    },

    reminders: {
      useDefault: false,

      overrides: [
        {
          method: 'popup',
          minutes: 24 * 60,
        },
        {
          method: 'popup',
          minutes: 120,
        },
      ],
    },
  };
}

function montarEventoDiaInteiro(
  reserva,
  dataISO,
  sufixo,
  titulo
) {
  return {
    id: gerarEventoId(
      reserva.protocolo,
      sufixo
    ),

    summary: titulo,

    description:
      montarDescricao(
        reserva
      ),

    start: {
      date:
        dataISO,
    },

    end: {
      date:
        adicionarDias(
          dataISO,
          1
        ),
    },

    reminders: {
      useDefault: true,
    },
  };
}

function obterDatasOcupacao(
  reserva
) {
  if (
    Array.isArray(
      reserva.datas_ocupacao
    ) &&
    reserva.datas_ocupacao.length > 0
  ) {
    return [
      ...new Set(
        reserva.datas_ocupacao.map(
          (data) =>
            String(data)
              .slice(0, 10)
        )
      ),
    ].sort();
  }

  return listarDatasInclusive(
    reserva.entrada,
    reserva.saida
  );
}

function montarEventosCreche(
  reserva
) {
  const datas =
    obterDatasOcupacao(
      reserva
    );

  const pets =
    nomesPets(
      reserva
    );

  return datas.map(
    (data) =>
      montarEventoDiaInteiro(
        reserva,
        data,
        `creche:${data}`,
        `🐾 Creche — ${pets}`
      )
  );
}

function montarEventosDomiciliar(
  reserva
) {
  const datas =
    obterDatasOcupacao(
      reserva
    );

  const pets =
    nomesPets(
      reserva
    );

  const visitas =
    Number(
      reserva.visitas_dia || 1
    );

  return datas.map(
    (data) =>
      montarEventoDiaInteiro(
        reserva,
        data,
        `domiciliar:${data}`,
        `🏠 Atendimento domiciliar — ${pets} — ${visitas} ${
          visitas === 1
            ? 'visita'
            : 'visitas'
        }`
      )
  );
}

function montarEventosReserva(
  reserva
) {
  if (!reserva) {
    return [];
  }

  if (
    reserva.servico ===
      SERVICOS.HOSPEDAGEM_CAO ||
    reserva.servico ===
      SERVICOS.HOSPEDAGEM_GATO
  ) {
    return [
      montarEventoHospedagem(
        reserva
      ),
    ];
  }

  if (
    reserva.servico ===
    SERVICOS.CRECHE
  ) {
    return montarEventosCreche(
      reserva
    );
  }

  if (
    reserva.servico ===
    SERVICOS.DOMICILIAR
  ) {
    return montarEventosDomiciliar(
      reserva
    );
  }

  return [
    montarEventoDiaInteiro(
      reserva,
      String(
        reserva.entrada
      ).slice(0, 10),
      'principal',
      `🐾 ${labelServico(
        reserva.servico
      )} — ${nomesPets(
        reserva
      )}`
    ),
  ];
}

function statusHttpGoogle(
  error
) {
  return Number(
    error?.response?.status ||
      error?.code ||
      error?.response?.data
        ?.error?.code ||
      0
  );
}

async function inserirOuAtualizarEvento(
  calendar,
  evento
) {
  try {
    const resposta =
      await calendar.events.insert({
        calendarId:
          GOOGLE_CALENDAR_ID,

        requestBody:
          evento,

        sendUpdates: 'none',
      });

    return {
      id: resposta.data.id,
      link:
        resposta.data.htmlLink ||
        null,
      operacao: 'criado',
    };
  } catch (error) {
    const status =
      statusHttpGoogle(
        error
      );

    if (status !== 409) {
      throw error;
    }

    const resposta =
      await calendar.events.update({
        calendarId:
          GOOGLE_CALENDAR_ID,

        eventId:
          evento.id,

        requestBody:
          evento,

        sendUpdates: 'none',
      });

    return {
      id: resposta.data.id,
      link:
        resposta.data.htmlLink ||
        null,
      operacao: 'atualizado',
    };
  }
}

async function sincronizarReservaConfirmada(
  reserva
) {
  if (!estaConfigurado()) {
    return {
      ok: false,
      ignorado: true,
      motivo:
        'Google Calendar não configurado.',
    };
  }

  const eventos =
    montarEventosReserva(
      reserva
    );

  if (eventos.length === 0) {
    return {
      ok: false,
      ignorado: true,
      motivo:
        'Nenhum evento foi gerado para a reserva.',
    };
  }

  const calendar =
    criarClienteCalendar();

  const resultados = [];

  for (
    const evento of eventos
  ) {
    const resultado =
      await inserirOuAtualizarEvento(
        calendar,
        evento
      );

    resultados.push(
      resultado
    );
  }

  return {
    ok: true,
    quantidade:
      resultados.length,
    eventos:
      resultados,
  };
}

async function excluirEvento(
  calendar,
  eventId
) {
  try {
    await calendar.events.delete({
      calendarId:
        GOOGLE_CALENDAR_ID,

      eventId,

      sendUpdates: 'none',
    });

    return {
      id: eventId,
      excluido: true,
    };
  } catch (error) {
    const status =
      statusHttpGoogle(
        error
      );

    if (status === 404) {
      return {
        id: eventId,
        excluido: true,
        jaNaoExistia: true,
      };
    }

    throw error;
  }
}

async function removerReservaCancelada(
  reserva
) {
  if (!estaConfigurado()) {
    return {
      ok: false,
      ignorado: true,
      motivo:
        'Google Calendar não configurado.',
    };
  }

  const eventos =
    montarEventosReserva(
      reserva
    );

  if (eventos.length === 0) {
    return {
      ok: true,
      quantidade: 0,
      eventos: [],
    };
  }

  const calendar =
    criarClienteCalendar();

  const resultados = [];

  for (
    const evento of eventos
  ) {
    const resultado =
      await excluirEvento(
        calendar,
        evento.id
      );

    resultados.push(
      resultado
    );
  }

  return {
    ok: true,
    quantidade:
      resultados.length,
    eventos:
      resultados,
  };
}

module.exports = {
  estaConfigurado,
  montarEventosReserva,
  sincronizarReservaConfirmada,
  removerReservaCancelada,
};