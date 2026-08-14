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

function aplicarSinal(valorTotal) {
  const valorSinal = Math.min(PRECOS.SINAL_RESERVA, valorTotal);

  return {
    valorSinal,
    valorAPagarAgora: valorSinal,
    saldoPendente: arredondarMoeda(
      Math.max(0, valorTotal - valorSinal)
    ),
  };
}

function calcularPreco({
  servico,
  quantidadePets,
  diarias,
  frequenciaSemanal,
  visitasDia,
  quantidadeDias,
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
        PRECOS.HOSPEDAGEM_DIARIA
    );

    return {
      valorUnitario: PRECOS.HOSPEDAGEM_DIARIA,
      valorTotal,

      ...aplicarSinal(valorTotal),

      descricao:
        `${totalDiarias} diária(s) × ` +
        `${pets} pet(s) × ` +
        `R$ ${PRECOS.HOSPEDAGEM_DIARIA
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
      PRECOS.CRECHE[frequencia];

    return {
      valorUnitario: valorTotal,
      valorTotal,

      ...aplicarSinal(valorTotal),

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
      PRECOS.DOMICILIAR[visitas];

    const valorTotal =
      valorDiario * dias;

    return {
      valorUnitario: valorDiario,
      valorTotal,

      ...aplicarSinal(valorTotal),

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

module.exports = {
  calcularPreco,
};