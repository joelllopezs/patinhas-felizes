'use strict';

const crypto = require('crypto');

const reservaModel =
  require('../models/reservaModel');

const disponibilidadeService =
  require('./disponibilidadeService');

const googleCalendarService =
  require('./googleCalendarService');

const {
  EXPIRACAO_VALIDACAO_HORAS,
  SERVICOS,
  STATUS,
} = require('../config/agendamento');

function prefixoProtocolo(servico) {
  if (
    servico === SERVICOS.HOSPEDAGEM_CAO ||
    servico === SERVICOS.HOSPEDAGEM_GATO
  ) {
    return 'HP';
  }

  if (servico === SERVICOS.CRECHE) {
    return 'CR';
  }

  return 'AD';
}

function dataCompacta() {
  const agora = new Date();

  const partes =
    new Intl.DateTimeFormat(
      'en-CA',
      {
        timeZone: 'America/Sao_Paulo',
        year: '2-digit',
        month: '2-digit',
        day: '2-digit',
      }
    ).formatToParts(agora);

  const mapa =
    Object.fromEntries(
      partes.map((parte) => [
        parte.type,
        parte.value,
      ])
    );

  return (
    `${mapa.year}` +
    `${mapa.month}` +
    `${mapa.day}`
  );
}

function gerarIdentificadores(servico) {
  return {
    protocolo:
      `#${prefixoProtocolo(
        servico
      )}${dataCompacta()}` +
      crypto
        .randomBytes(4)
        .toString('hex')
        .toUpperCase(),

    tokenComprovante:
      crypto
        .randomBytes(24)
        .toString('hex'),

    tokenValidacao:
      crypto
        .randomBytes(32)
        .toString('hex'),
  };
}

function dataExpiracao() {
  return new Date(
    Date.now() +
      EXPIRACAO_VALIDACAO_HORAS *
        60 *
        60 *
        1000
  ).toISOString();
}

function traduzirErroDeUnicidade(error) {
  if (
    error?.code !== '23505' &&
    !/unique constraint/i.test(
      String(error?.message || '')
    )
  ) {
    return false;
  }

  const constraint =
    String(
      error?.constraint || ''
    );

  const detail =
    String(
      error?.detail || ''
    );

  if (
    constraint ===
      'idx_reservas_comprovante_caminho' ||
    /comprovante_caminho/i.test(detail)
  ) {
    error.code =
      'COMPROVANTE_JA_UTILIZADO';

    error.status = 409;

    error.message =
      'Este comprovante ja foi vinculado a outro agendamento.';

    return true;
  }

  error.code =
    'IDENTIFICADOR_DUPLICADO';

  return true;
}

function registrarErroGoogle(
  operacao,
  reserva,
  error
) {
  console.error('');
  console.error(
    `❌ Google Calendar: falha ao ${operacao}.`
  );

  if (reserva?.protocolo) {
    console.error(
      `Protocolo: ${reserva.protocolo}`
    );
  }

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
}

async function sincronizarGoogleAposCriacao(
  reserva
) {
  try {
    const resultado =
      await googleCalendarService
        .sincronizarReservaConfirmada(
          reserva
        );

    if (resultado.ok) {
      console.log(
        `📅 Google Agenda: ${resultado.quantidade} evento(s) criado(s) para ${reserva.protocolo}.`
      );
    } else if (
      resultado.ignorado
    ) {
      console.log(
        `⚠️ Google Agenda não configurado. Reserva ${reserva.protocolo} criada normalmente.`
      );
    }

    return resultado;
  } catch (error) {
    registrarErroGoogle(
      'criar o evento da nova reserva',
      reserva,
      error
    );

    return {
      ok: false,
      error:
        error?.message ||
        'Falha ao sincronizar com Google Agenda.',
    };
  }
}

async function removerGoogleAposCancelamento(
  reserva
) {
  try {
    const resultado =
      await googleCalendarService
        .removerReservaCancelada(
          reserva
        );

    if (resultado.ok) {
      console.log(
        `🗑️ Google Agenda: ${resultado.quantidade} evento(s) removido(s) para ${reserva.protocolo}.`
      );
    }

    return resultado;
  } catch (error) {
    registrarErroGoogle(
      'remover a reserva cancelada',
      reserva,
      error
    );

    return {
      ok: false,
      error:
        error?.message ||
        'Falha ao remover evento do Google Agenda.',
    };
  }
}

async function criarPreAgendamento({
  preparado,
  comprovante,
  identificadores,
}) {
  let reservaCriada;

  try {
    reservaCriada =
      await reservaModel
        .executarTransacaoImediata(
          async (client) => {
            const disponibilidade =
              await disponibilidadeService
                .verificarDisponibilidade({
                  verificarPausa: true,
                  servico:
                    preparado.servico,

                  entradaISO:
                    preparado.entradaISO,

                  saidaISO:
                    preparado.saidaISO,

                  quantidadePets:
                    preparado.quantidadePets,

                  diasSemanaCreche:
                    preparado.diasSemana,

                  datasOcupacaoISO:
                    preparado.datasOcupacao,

                  client,
                });

            if (
              !disponibilidade.disponivel
            ) {
              const error =
                new Error(
                  disponibilidade.motivo
                );

              error.code =
                'SEM_VAGAS';

              error.status =
                409;

              throw error;
            }

            return reservaModel
              .inserirReserva(
                {
                  protocolo:
                    identificadores.protocolo,

                  nomeCliente:
                    preparado.nomeCliente,

                  telefone:
                    preparado.telefone,

                  servico:
                    preparado.servico,

                  entrada:
                    preparado.entradaISO,

                  saida:
                    preparado.saidaISO,

                  quantidadePets:
                    preparado.quantidadePets,

                  petsDetalhe:
                    preparado.pets,

                  observacao:
                    preparado.observacao,

                  valorTotal:
                    preparado.preco
                      .valorTotal,

                  valorSinal:
                    preparado.preco
                      .valorSinal,

                  valorAPagar:
                    preparado.preco
                      .valorAPagarAgora,

                  saldoPendente:
                    preparado.preco
                      .saldoPendente,

                  horaEntrada:
                    preparado.horaEntrada,

                  horaSaida:
                    preparado.horaSaida,

                  endereco:
                    preparado.endereco,

                  visitasDia:
                    preparado.visitasDia,

                  frequenciaSemanal:
                    preparado
                      .frequenciaSemanal,

                  diasSemana:
                    preparado.diasSemana,

                  quantidadeDias:
                    preparado.quantidadeDias,

                  datasOcupacao:
                    preparado.datasOcupacao,

                  comprovanteNome:
                    comprovante.nomeOriginal,

                  comprovanteMime:
                    comprovante.mime,

                  comprovanteCaminho:
                    comprovante.nomeInterno,

                  comprovanteTamanho:
                    comprovante.tamanho,

                  tokenComprovante:
                    identificadores
                      .tokenComprovante,

                  tokenValidacao:
                    identificadores
                      .tokenValidacao,

                  dataExpiracao:
                    dataExpiracao(),
                },

                client
              );
          }
        );
  } catch (error) {
    traduzirErroDeUnicidade(
      error
    );

    throw error;
  }

  /*
   * IMPORTANTE:
   *
   * A reserva já foi criada no banco e já ocupa vaga.
   * Somente depois do COMMIT chamamos o Google Calendar.
   *
   * Se o Google estiver indisponível, a reserva NÃO é
   * desfeita e a vaga continua corretamente ocupada.
   */
  await sincronizarGoogleAposCriacao(
    reservaCriada
  );

  return reservaCriada;
}

async function confirmarPorToken(token) {
  await reservaModel
    .expirarPendentes();

  /*
   * Aqui NÃO criamos mais evento no Google.
   *
   * O evento já foi criado no momento em que
   * o comprovante foi enviado e a vaga reservada.
   *
   * Esta operação serve somente para validar
   * o comprovante/pagamento.
   */
  return reservaModel
    .executarTransacaoImediata(
      async (client) => {
        const reserva =
          await reservaModel
            .buscarPorTokenValidacao(
              token,
              client
            );

        if (!reserva) {
          return {
            ok: false,
            error:
              'Solicitação não encontrada.',
          };
        }

        if (
          reserva.status ===
          STATUS.CONFIRMADO
        ) {
          return {
            ok: true,
            jaConfirmada: true,
            reserva,
          };
        }

        if (
          reserva.status ===
          STATUS.CANCELADO
        ) {
          return {
            ok: false,
            error:
              'Esta solicitação já foi cancelada.',
            reserva,
          };
        }

        if (
          reserva.status ===
          STATUS.EXPIRADO
        ) {
          return {
            ok: false,

            error:
              'O prazo desta solicitação expirou. Peça ao cliente para refazer o agendamento.',

            reserva,
          };
        }

        const disponibilidade =
          await disponibilidadeService
            .verificarDisponibilidade({
              servico:
                reserva.servico,

              entradaISO:
                reserva.entrada,

              saidaISO:
                reserva.saida,

              quantidadePets:
                reserva.quantidade_pets,

              diasSemanaCreche:
                reserva.dias_semana,

              datasOcupacaoISO:
                reserva.datas_ocupacao,

              excluirProtocolo:
                reserva.protocolo,

              client,
            });

        if (
          !disponibilidade.disponivel
        ) {
          return {
            ok: false,
            error:
              disponibilidade.motivo,
            reserva,
          };
        }

        const confirmada =
          await reservaModel
            .atualizarStatusPorId(
              reserva.id,
              STATUS.CONFIRMADO,
              {},
              client
            );

        console.log(
          `✅ Comprovante validado: ${confirmada.protocolo}`
        );

        return {
          ok: true,
          reserva:
            confirmada,
        };
      }
    );
}

async function cancelarPorToken(
  token,
  motivo =
    'Cancelado pela empresa'
) {
  await reservaModel
    .expirarPendentes();

  const resultado =
    await reservaModel
      .executarTransacaoImediata(
        async (client) => {
          const reserva =
            await reservaModel
              .buscarPorTokenValidacao(
                token,
                client
              );

          if (!reserva) {
            return {
              ok: false,
              error:
                'Solicitação não encontrada.',
            };
          }

          if (
            reserva.status ===
            STATUS.CANCELADO
          ) {
            return {
              ok: true,
              jaCancelada: true,
              reserva,
            };
          }

          const cancelada =
            await reservaModel
              .atualizarStatusPorId(
                reserva.id,
                STATUS.CANCELADO,
                {
                  motivo,
                },
                client
              );

          return {
            ok: true,
            reserva:
              cancelada,
          };
        }
      );

  if (
    !resultado.ok ||
    !resultado.reserva
  ) {
    return resultado;
  }

  /*
   * A vaga foi cancelada no banco.
   * Agora removemos o evento correspondente
   * da Google Agenda.
   */
  const googleCalendar =
    await removerGoogleAposCancelamento(
      resultado.reserva
    );

  return {
    ...resultado,
    googleCalendar,
  };
}

module.exports = {
  gerarIdentificadores,
  criarPreAgendamento,
  confirmarPorToken,
  cancelarPorToken,
};