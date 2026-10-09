'use strict';

const { PRECOS, SERVICOS } = require('../config/agendamento');

function inteiro(valor, minimo, maximo, campo) {
  const numero = Number(valor);

  if (!Number.isInteger(numero) || numero < minimo || numero > maximo) {
    throw new Error(`${campo} inválido.`);
  }

  return numero;
}

function arredondarMoeda(valor) {
  return Math.round((Number(valor) + Number.EPSILON) * 100) / 100;
}

function aplicarSinal(valorTotal, precos = PRECOS) {
  const valorSinal = Math.min(precos.SINAL_RESERVA, valorTotal);

  return {
    valorSinal,
    valorAPagarAgora: valorSinal,
    saldoPendente: arredondarMoeda(
      Math.max(0, valorTotal - valorSinal)
    ),
  };
}

/**
 * `precos` segue o formato de config.PRECOS e permite usar a tabela
 * mantida pelo painel de controle. Sem ele, usa os valores padrão.
 */
function calcularPreco({
  servico,
  quantidadePets,
  diarias,
  frequenciaSemanal,
  visitasDia,
  quantidadeDias,
  precos = PRECOS,
}) {
  const pets = inteiro(
    quantidadePets,
    1,
    10,
    'Quantidade de pets'
  );

  if (
    servico === SERVICOS.HOSPEDAGEM_CAO ||
    servico === SERVICOS.HOSPEDAGEM_GATO
  ) {
    const totalDiarias = inteiro(
      diarias,
      1,
      60,
      'Quantidade de diárias'
    );

    const valorTotal = arredondarMoeda(
      totalDiarias *
        pets *
        precos.HOSPEDAGEM_DIARIA
    );

    return {
      valorUnitario: precos.HOSPEDAGEM_DIARIA,
      valorTotal,

      ...aplicarSinal(valorTotal, precos),

      descricao:
        `${totalDiarias} diária(s) × ` +
        `${pets} pet(s) × ` +
        `R$ ${precos.HOSPEDAGEM_DIARIA
          .toFixed(2)
          .replace('.', ',')}`,
    };
  }

  if (servico === SERVICOS.CRECHE) {
    const frequencia = inteiro(
      frequenciaSemanal,
      1,
      5,
      'Frequência semanal'
    );

    const valorTotal =
      precos.CRECHE[frequencia];

    return {
      valorUnitario: valorTotal,
      valorTotal,

      ...aplicarSinal(valorTotal, precos),

      descricao:
        `Plano mensal de ${frequencia}x por semana`,
    };
  }

  if (servico === SERVICOS.DOMICILIAR) {
    const visitas = inteiro(
      visitasDia,
      1,
      2,
      'Visitas por dia'
    );

    const dias = inteiro(
      quantidadeDias,
      1,
      60,
      'Quantidade de dias'
    );

    const valorDiario =
      precos.DOMICILIAR[visitas];

    const valorTotal =
      valorDiario * dias;

    return {
      valorUnitario: valorDiario,
      valorTotal,

      ...aplicarSinal(valorTotal, precos),

      descricao:
        `${dias} dia(s) × ` +
        `${visitas} visita(s) por dia — ` +
        `R$ ${valorDiario
          .toFixed(2)
          .replace('.', ',')} por dia`,
    };
  }

  throw new Error(
    'Não foi possível calcular o valor do serviço.'
  );
}

const LIMITE_VALOR = 100000;

function valorMoeda(v, campo, { permiteZero = false } = {}) {
  if (v === '' || v === null || v === undefined || typeof v === 'boolean') {
    throw new Error(`Informe ${campo}.`);
  }
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : Number(v);
  if (!Number.isFinite(n) || n < 0 || n > LIMITE_VALOR || (!permiteZero && n === 0)) {
    throw new Error(`Valor inválido em ${campo}.`);
  }
  return arredondarMoeda(n);
}

/**
 * Converte o formato da API ({hospedagem, creche:{1..5}, domiciliar:{1,2}, sinal})
 * para o formato interno (config.PRECOS), validando tudo.
 */
function normalizarPrecos(entrada) {
  if (!entrada || typeof entrada !== 'object') throw new Error('Valores inválidos.');
  const creche = {};
  for (let i = 1; i <= 5; i += 1) {
    creche[i] = valorMoeda(entrada.creche?.[i], `Creche ${i}x por semana`);
  }
  const domiciliar = {};
  for (let i = 1; i <= 2; i += 1) {
    domiciliar[i] = valorMoeda(entrada.domiciliar?.[i], `Visita em casa (${i} por dia)`);
  }
  return {
    HOSPEDAGEM_DIARIA: valorMoeda(entrada.hospedagem, 'Hospedagem (diária)'),
    CRECHE: creche,
    DOMICILIAR: domiciliar,
    SINAL_RESERVA: valorMoeda(entrada.sinal, 'Sinal', { permiteZero: true }),
  };
}

/** Formato interno (config.PRECOS) -> formato da API/painel/site. */
function precosParaApi(p = PRECOS) {
  return {
    hospedagem: p.HOSPEDAGEM_DIARIA,
    creche: { ...p.CRECHE },
    domiciliar: { ...p.DOMICILIAR },
    sinal: p.SINAL_RESERVA,
  };
}

module.exports = {
  calcularPreco,
  normalizarPrecos,
  precosParaApi,
};