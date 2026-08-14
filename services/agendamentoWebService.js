'use strict';

const {
  MAX_PETS_POR_RESERVA,
  MAX_DIAS_HOSPEDAGEM,
  MAX_DIAS_CRECHE,
  MAX_DIAS_DOMICILIAR,
  OWNER_WHATSAPP,
  SERVICOS,
  SERVICOS_VALIDOS,
} = require(
  '../config/agendamento'
);

const {
  validarDataISO,
  compararDatasISO,
  adicionarDiasISO,
  quantidadeDiasInclusivos,
  formatarDataBR,
  hojeISOEmSaoPaulo,
} = require(
  '../utils/dateUtils'
);

const disponibilidadeService =
  require(
    './disponibilidadeService'
  );

const precoService =
  require(
    './precoService'
  );

class DomainError extends Error {
  constructor(
    message,
    code = 'DADOS_INVALIDOS',
    status = 400,
    details = undefined
  ) {
    super(message);

    this.name =
      'DomainError';

    this.code =
      code;

    this.status =
      status;

    this.details =
      details;
  }
}

const SERVICE_LABELS =
  Object.freeze({
    [SERVICOS.HOSPEDAGEM_CAO]:
      'Hospedagem para Cães',

    [SERVICOS.HOSPEDAGEM_GATO]:
      'Hospedagem para Gatos',

    [SERVICOS.CRECHE]:
      'Creche Pet',

    [SERVICOS.DOMICILIAR]:
      'Atendimento Domiciliar',
  });

const WEEKDAY_LABELS =
  Object.freeze({
    1: 'Segunda-feira',
    2: 'Terça-feira',
    3: 'Quarta-feira',
    4: 'Quinta-feira',
    5: 'Sexta-feira',
  });

function texto(
  valor,
  campo,
  {
    min = 1,
    max = 300,
    opcional = false,
  } = {}
) {
  const normalizado =
    String(
      valor == null
        ? ''
        : valor
    )
      .replace(
        /\s+/g,
        ' '
      )
      .trim();

  if (
    !normalizado &&
    opcional
  ) {
    return null;
  }

  if (
    normalizado.length <
    min
  ) {
    throw new DomainError(
      `${campo} não foi informado corretamente.`,
      'CAMPO_INVALIDO'
    );
  }

  if (
    normalizado.length >
    max
  ) {
    throw new DomainError(
      `${campo} deve ter no máximo ${max} caracteres.`,
      'CAMPO_INVALIDO'
    );
  }

  return normalizado;
}

function inteiro(
  valor,
  campo,
  minimo,
  maximo
) {
  const numero =
    Number(valor);

  if (
    !Number.isInteger(
      numero
    ) ||
    numero < minimo ||
    numero > maximo
  ) {
    throw new DomainError(
      `${campo} deve ser um número inteiro entre ${minimo} e ${maximo}.`,
      'CAMPO_INVALIDO'
    );
  }

  return numero;
}

function telefone(valor) {
  const digitos =
    String(
      valor ||
        ''
    ).replace(
      /\D/g,
      ''
    );

  if (
    digitos.length < 10 ||
    digitos.length > 15
  ) {
    throw new DomainError(
      'Informe um telefone válido com DDD.',
      'TELEFONE_INVALIDO'
    );
  }

  return digitos;
}

function nomeCompleto(
  valor
) {
  const nome =
    texto(
      valor,
      'Nome do tutor',
      {
        min: 3,
        max: 120,
      }
    );

  if (
    nome
      .split(' ')
      .filter(Boolean)
      .length < 2
  ) {
    throw new DomainError(
      'Informe o nome completo do tutor, por exemplo: Maria Oliveira.',
      'NOME_INCOMPLETO'
    );
  }

  return nome;
}

function hora(
  valor,
  campo
) {
  const normalizado =
    String(
      valor ||
        ''
    ).trim();

  const match =
    normalizado.match(
      /^(\d{2}):(\d{2})$/
    );

  if (!match) {
    throw new DomainError(
      `${campo} deve estar no formato HH:MM.`,
      'HORARIO_INVALIDO'
    );
  }

  const horas =
    Number(
      match[1]
    );

  const minutos =
    Number(
      match[2]
    );

  if (
    horas < 0 ||
    horas > 23 ||
    minutos < 0 ||
    minutos > 59
  ) {
    throw new DomainError(
      `${campo} é inválido.`,
      'HORARIO_INVALIDO'
    );
  }

  return normalizado;
}

function dataFuturaOuHoje(
  valor,
  campo
) {
  const data =
    String(
      valor ||
        ''
    ).trim();

  try {
    validarDataISO(
      data
    );
  } catch (error) {
    throw new DomainError(
      error.message,
      'DATA_INVALIDA'
    );
  }

  if (
    compararDatasISO(
      data,
      hojeISOEmSaoPaulo()
    ) < 0
  ) {
    throw new DomainError(
      `${campo} não pode ser anterior a hoje.`,
      'DATA_PASSADA'
    );
  }

  return data;
}

function validarPeriodo(
  inicioISO,
  fimISO,
  maxDias,
  nomeServico
) {
  if (
    compararDatasISO(
      fimISO,
      inicioISO
    ) < 0
  ) {
    throw new DomainError(
      'A data final não pode ser anterior à data inicial.',
      'PERIODO_INVALIDO'
    );
  }

  const dias =
    quantidadeDiasInclusivos(
      inicioISO,
      fimISO
    );

  if (
    dias > maxDias
  ) {
    throw new DomainError(
      `O período de ${nomeServico} pode ter no máximo ${maxDias} dias.`,
      'PERIODO_MUITO_LONGO'
    );
  }

  return dias;
}

function normalizarDiasSemana(
  valor,
  frequencia
) {
  const dias =
    Array.isArray(valor)
      ? [
          ...new Set(
            valor.map(Number)
          ),
        ].sort(
          (a, b) => a - b
        )
      : [];

  if (
    frequencia === 5
  ) {
    return [
      1,
      2,
      3,
      4,
      5,
    ];
  }

  if (
    dias.some(
      (dia) =>
        !Number.isInteger(
          dia
        ) ||
        dia < 1 ||
        dia > 5
    )
  ) {
    throw new DomainError(
      'Os dias da creche devem estar entre segunda e sexta.',
      'DIAS_CRECHE_INVALIDOS'
    );
  }

  if (
    dias.length !==
    frequencia
  ) {
    throw new DomainError(
      `Escolha exatamente ${frequencia} dia(s) diferente(s) para a creche.`,
      'DIAS_CRECHE_INVALIDOS'
    );
  }

  return dias;
}

function normalizarPetComum(
  pet,
  indice,
  {
    exigirRaca = true,
  } = {}
) {
  const objeto =
    pet &&
    typeof pet ===
      'object'
      ? pet
      : {};

  const resultado = {
    nome:
      texto(
        objeto.nome,
        `Nome do pet ${indice + 1}`,
        {
          min: 1,
          max: 60,
        }
      ),

    cuidados:
      texto(
        objeto.cuidados,
        `Cuidados do pet ${indice + 1}`,
        {
          min: 1,
          max: 500,
        }
      ),
  };

  if (exigirRaca) {
    resultado.raca =
      texto(
        objeto.raca,
        `Raça do pet ${indice + 1}`,
        {
          min: 1,
          max: 80,
        }
      );
  } else {
    resultado.raca =
      texto(
        objeto.raca,
        `Raça do pet ${indice + 1}`,
        {
          max: 80,
          opcional: true,
        }
      );
  }

  return resultado;
}

function normalizarPets(
  servico,
  petsRecebidos,
  quantidadePets
) {
  if (
    !Array.isArray(
      petsRecebidos
    ) ||
    petsRecebidos.length !==
      quantidadePets
  ) {
    throw new DomainError(
      `Informe os dados de exatamente ${quantidadePets} pet(s).`,
      'PETS_INVALIDOS'
    );
  }

  return petsRecebidos.map(
    (pet, indice) => {
      if (
        servico ===
        SERVICOS.HOSPEDAGEM_CAO
      ) {
        const comum =
          normalizarPetComum(
            pet,
            indice
          );

        const porte =
          texto(
            pet.porte,
            `Porte do pet ${indice + 1}`,
            {
              max: 20,
            }
          ).toLowerCase();

        if (
          ![
            'pequeno',
            'medio',
          ].includes(
            porte
          )
        ) {
          throw new DomainError(
            `Escolha o porte do pet ${indice + 1}.`,
            'PORTE_INVALIDO'
          );
        }

        return {
          ...comum,

          porte,

          convive:
            texto(
              pet.convive,
              `Convivência do pet ${indice + 1}`,
              {
                min: 1,
                max: 250,
              }
            ),

          castradoIdade:
            texto(
              pet.castradoIdade,
              `Castração e idade do pet ${indice + 1}`,
              {
                min: 1,
                max: 120,
              }
            ),
        };
      }

      if (
        servico ===
        SERVICOS.HOSPEDAGEM_GATO
      ) {
        const comum =
          normalizarPetComum(
            pet,
            indice,
            {
              exigirRaca:
                false,
            }
          );

        return {
          ...comum,

          castradoIdade:
            texto(
              pet.castradoIdade,
              `Castração e idade do pet ${indice + 1}`,
              {
                min: 1,
                max: 120,
              }
            ),
        };
      }

      return normalizarPetComum(
        pet,
        indice
      );
    }
  );
}

async function prepararSolicitacao(
  payloadRecebido
) {
  const payload =
    payloadRecebido &&
    typeof payloadRecebido ===
      'object'
      ? payloadRecebido
      : {};

  const servico =
    String(
      payload.servico ||
        ''
    );

  if (
    !SERVICOS_VALIDOS.includes(
      servico
    )
  ) {
    throw new DomainError(
      'Escolha um serviço válido.',
      'SERVICO_INVALIDO'
    );
  }

  const nomeCliente =
    nomeCompleto(
      payload.nomeTutor
    );

  const telefoneCliente =
    telefone(
      payload.telefoneTutor
    );

  const observacao =
    texto(
      payload.observacao,
      'Observação',
      {
        max: 1000,
        opcional: true,
      }
    );

  const detalhes =
    payload.detalhes &&
    typeof payload.detalhes ===
      'object'
      ? payload.detalhes
      : {};

  let preparado;

  if (
    servico ===
      SERVICOS.HOSPEDAGEM_CAO ||
    servico ===
      SERVICOS.HOSPEDAGEM_GATO
  ) {
    const entradaISO =
      dataFuturaOuHoje(
        detalhes.dataEntrada,
        'A data de entrada'
      );

    const diarias =
      inteiro(
        detalhes.diarias,
        'Quantidade de diárias',
        1,
        MAX_DIAS_HOSPEDAGEM
      );

    const quantidadePets =
      inteiro(
        detalhes.quantidadePets,
        'Quantidade de pets',
        1,
        MAX_PETS_POR_RESERVA
      );

    const saidaISO =
      adicionarDiasISO(
        entradaISO,
        diarias
      );

    const pets =
      normalizarPets(
        servico,
        payload.pets,
        quantidadePets
      );

    preparado = {
      servico,

      entradaISO,

      saidaISO,

      horaEntrada:
        hora(
          detalhes.horaEntrada,
          'Horário de entrada'
        ),

      horaSaida:
        hora(
          detalhes.horaSaida,
          'Horário de retirada'
        ),

      quantidadePets,

      quantidadeDias:
        diarias,

      diarias,

      pets,

      endereco: null,

      visitasDia: null,

      frequenciaSemanal:
        null,

      diasSemana: [],
    };
  } else if (
    servico ===
    SERVICOS.CRECHE
  ) {
    const entradaISO =
      dataFuturaOuHoje(
        detalhes.dataInicio,
        'A data inicial'
      );

    const saidaISO =
      dataFuturaOuHoje(
        detalhes.dataFim,
        'A data final'
      );

    const quantidadeDias =
      validarPeriodo(
        entradaISO,
        saidaISO,
        MAX_DIAS_CRECHE,
        'creche'
      );

    const frequencia =
      inteiro(
        detalhes.frequencia,
        'Frequência semanal',
        1,
        5
      );

    const diasSemana =
      normalizarDiasSemana(
        detalhes.diasSemana,
        frequencia
      );

    const pets =
      normalizarPets(
        servico,
        payload.pets,
        1
      );

    preparado = {
      servico,

      entradaISO,

      saidaISO,

      horaEntrada: null,

      horaSaida: null,

      quantidadePets: 1,

      quantidadeDias,

      diarias: null,

      pets,

      endereco: null,

      visitasDia: null,

      frequenciaSemanal:
        frequencia,

      diasSemana,
    };
  } else {
    const entradaISO =
      dataFuturaOuHoje(
        detalhes.dataInicio,
        'A data inicial'
      );

    const saidaISO =
      dataFuturaOuHoje(
        detalhes.dataFim,
        'A data final'
      );

    const quantidadeDias =
      validarPeriodo(
        entradaISO,
        saidaISO,
        MAX_DIAS_DOMICILIAR,
        'atendimento domiciliar'
      );

    const visitasDia =
      inteiro(
        detalhes.visitasDia,
        'Visitas por dia',
        1,
        2
      );

    const quantidadePets =
      inteiro(
        detalhes.quantidadePets,
        'Quantidade de pets',
        1,
        MAX_PETS_POR_RESERVA
      );

    const pets =
      normalizarPets(
        servico,
        payload.pets,
        quantidadePets
      );

    preparado = {
      servico,

      entradaISO,

      saidaISO,

      horaEntrada: null,

      horaSaida: null,

      quantidadePets,

      quantidadeDias,

      diarias: null,

      pets,

      endereco:
        texto(
          detalhes.endereco,
          'Endereço completo',
          {
            min: 8,
            max: 300,
          }
        ),

      visitasDia,

      frequenciaSemanal:
        null,

      diasSemana: [],
    };
  }

  const disponibilidade =
    await disponibilidadeService
      .verificarDisponibilidade({
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
      });

  if (
    !disponibilidade.disponivel
  ) {
    throw new DomainError(
      disponibilidade.motivo,
      'SEM_VAGAS',
      409,
      {
        datasOcupacao:
          disponibilidade
            .datasOcupacao,
      }
    );
  }

  const preco =
    precoService.calcularPreco({
      servico:
        preparado.servico,

      quantidadePets:
        preparado.quantidadePets,

      diarias:
        preparado.diarias,

      horaSaida:
        preparado.horaSaida,

      frequenciaSemanal:
        preparado.frequenciaSemanal,

      visitasDia:
        preparado.visitasDia,

      quantidadeDias:
        preparado.quantidadeDias,
    });

  return {
    ...preparado,

    nomeCliente,

    telefone:
      telefoneCliente,

    observacao,

    datasOcupacao:
      disponibilidade
        .datasOcupacao,

    disponibilidade,

    preco,
  };
}

function criarResumoCliente(
  preparado
) {
  return {
    servico:
      preparado.servico,

    servicoLabel:
      SERVICE_LABELS[
        preparado.servico
      ],

    nomeTutor:
      preparado.nomeCliente,

    telefone:
      preparado.telefone,

    entrada:
      preparado.entradaISO,

    saida:
      preparado.saidaISO,

    horaEntrada:
      preparado.horaEntrada,

    horaSaida:
      preparado.horaSaida,

    quantidadePets:
      preparado.quantidadePets,

    quantidadeDias:
      preparado.quantidadeDias,

    pets:
      preparado.pets,

    observacao:
      preparado.observacao,

    endereco:
      preparado.endereco,

    visitasDia:
      preparado.visitasDia,

    frequenciaSemanal:
      preparado.frequenciaSemanal,

    diasSemana:
      preparado.diasSemana,

    diasSemanaLabels:
      preparado.diasSemana.map(
        (dia) =>
          WEEKDAY_LABELS[
            dia
          ]
      ),

    preco:
      preparado.preco,

    disponibilidade: {
      mensagem:
        preparado.disponibilidade
          .mensagem,

      vagasRestantes:
        preparado.disponibilidade
          .vagasRestantes,
    },
  };
}

function moeda(valor) {
  return Number(
    valor ||
      0
  ).toLocaleString(
    'pt-BR',
    {
      style:
        'currency',

      currency:
        'BRL',
    }
  );
}

function linhasPets(
  reserva
) {
  const pets =
    Array.isArray(
      reserva.pets_detalhe
    )
      ? reserva.pets_detalhe
      : [];

  const linhas = [];

  pets.forEach(
    (pet, indice) => {
      linhas.push(
        `🐾 Pet ${indice + 1}: ` +
        `${pet.nome}` +
        (
          pet.raca
            ? ` (${pet.raca})`
            : ''
        )
      );

      if (pet.porte) {
        linhas.push(
          `   Porte: ${pet.porte}`
        );
      }

      if (pet.convive) {
        linhas.push(
          `   Convive com outros: ${pet.convive}`
        );
      }

      if (
        pet.castradoIdade
      ) {
        linhas.push(
          `   Castrado/idade: ${pet.castradoIdade}`
        );
      }

      linhas.push(
        `   Cuidados: ${
          pet.cuidados ||
          'Não possui'
        }`
      );
    }
  );

  return linhas;
}

function montarMensagemWhatsApp(
  reserva,
  baseUrl
) {
  const comprovanteUrl =
    `${baseUrl}/comprovante/${reserva.token_comprovante}`;

  const validacaoUrl =
    `${baseUrl}/validacao/${reserva.token_validacao}`;

  const linhas = [
    '🐾 *NOVO PRÉ-AGENDAMENTO — PATINHAS FELIZES*',

    '',

    `📌 *Protocolo:* ${reserva.protocolo}`,

    `👤 *Tutor:* ${reserva.nome_cliente}`,

    `📱 *Telefone:* ${reserva.telefone}`,

    `🏡 *Serviço:* ${
      SERVICE_LABELS[
        reserva.servico
      ] ||
      reserva.servico
    }`,

    `📅 *Período:* ${
      formatarDataBR(
        reserva.entrada
      )
    } até ${
      formatarDataBR(
        reserva.saida
      )
    }`,
  ];

  if (
    reserva.hora_entrada
  ) {
    linhas.push(
      `🕒 *Entrada:* ${reserva.hora_entrada}`
    );
  }

  if (
    reserva.hora_saida
  ) {
    linhas.push(
      `🕒 *Retirada:* ${reserva.hora_saida}`
    );
  }

  if (
    reserva.endereco
  ) {
    linhas.push(
      `📍 *Endereço:* ${reserva.endereco}`
    );
  }

  if (
    reserva.visitas_dia
  ) {
    linhas.push(
      `🔁 *Visitas por dia:* ${reserva.visitas_dia}`
    );
  }

  if (
    reserva.frequencia_semanal
  ) {
    linhas.push(
      `🔁 *Frequência da creche:* ${reserva.frequencia_semanal}x por semana`
    );
  }

  if (
    Array.isArray(
      reserva.dias_semana
    ) &&
    reserva.dias_semana.length >
      0
  ) {
    linhas.push(
      `🗓️ *Dias da creche:* ${
        reserva.dias_semana
          .map(
            (dia) =>
              WEEKDAY_LABELS[
                dia
              ]
          )
          .join(', ')
      }`
    );
  }

  linhas.push(
    `🐾 *Quantidade de pets:* ${reserva.quantidade_pets}`,
    ''
  );

  linhas.push(
    ...linhasPets(
      reserva
    )
  );

  if (
    reserva.observacao
  ) {
    linhas.push(
      '',
      `📝 *Observações:* ${reserva.observacao}`
    );
  }

  linhas.push(
    '',

    `💰 *Valor total:* ${moeda(
      reserva.valor_total
    )}`,

    `💵 *Valor enviado no comprovante:* ${moeda(
      reserva.valor_a_pagar
    )}`,

    `💰 *Saldo restante:* ${moeda(
      reserva.saldo_pendente
    )}`,

    '',

    `📎 *Abrir comprovante:* ${comprovanteUrl}`,

    `✅ *Validar ou cancelar:* ${validacaoUrl}`,

    '',

    '⚠️ A vaga já foi reservada no sistema após o envio do comprovante. A empresa ainda precisa validar o pagamento.'
  );

  return linhas.join(
    '\n'
  );
}

function montarLinkWhatsAppEmpresa(
  mensagem
) {
  return (
    `https://wa.me/${OWNER_WHATSAPP}` +
    `?text=${encodeURIComponent(
      mensagem
    )}`
  );
}

function telefoneParaWhatsApp(
  telefoneCliente
) {
  const digitos =
    String(
      telefoneCliente ||
        ''
    ).replace(
      /\D/g,
      ''
    );

  return digitos.startsWith(
    '55'
  )
    ? digitos
    : `55${digitos}`;
}

function montarLinkRespostaCliente(
  reserva,
  acao
) {
  const confirmado =
    acao ===
    'confirmado';

  const mensagem =
    confirmado
      ? (
          `Olá, ${reserva.nome_cliente}! ` +
          `O pagamento do protocolo ${reserva.protocolo} ` +
          `foi validado e sua reserva está confirmada. 🐾💖`
        )
      : (
          `Olá, ${reserva.nome_cliente}. ` +
          `Precisamos falar sobre o protocolo ${reserva.protocolo}. ` +
          `Entre em contato para ajustarmos o agendamento. 🐾`
        );

  return (
    `https://wa.me/${telefoneParaWhatsApp(
      reserva.telefone
    )}` +
    `?text=${encodeURIComponent(
      mensagem
    )}`
  );
}

module.exports = {
  DomainError,

  SERVICE_LABELS,

  WEEKDAY_LABELS,

  prepararSolicitacao,

  criarResumoCliente,

  montarMensagemWhatsApp,

  montarLinkWhatsAppEmpresa,

  montarLinkRespostaCliente,
};