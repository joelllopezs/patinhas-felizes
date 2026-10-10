'use strict';

const { PRECOS, SERVICOS } = require('../config/agendamento');

/** Tabela usada quando nenhuma é informada (valores do código, sem períodos especiais). */
const TABELA_PADRAO = Object.freeze({
  base: Object.freeze({
    hospedagem: PRECOS.HOSPEDAGEM_DIARIA,
    creche: PRECOS.CRECHE,
    domiciliar: PRECOS.DOMICILIAR,
    sinal: PRECOS.SINAL_RESERVA,
  }),
  periodos: Object.freeze([]),
});

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

function moedaBR(valor) {
  return `R$ ${Number(valor).toFixed(2).replace('.', ',')}`;
}

function somarDias(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Valores vigentes numa data: o período especial que a cobre, ou o valor padrão. */
function valoresDoDia(tabela, iso) {
  if (iso) {
    const periodo = (tabela.periodos || []).find((p) => iso >= p.inicio && iso <= p.fim);
    if (periodo) return periodo;
  }

  return tabela.base;
}

function aplicarSinal(valorTotal, sinal) {
  const valorSinal = Math.min(sinal, valorTotal);

  return {
    valorSinal,
    valorAPagarAgora: valorSinal,
    saldoPendente: arredondarMoeda(Math.max(0, valorTotal - valorSinal)),
  };
}

/** Agrupa dias consecutivos com o mesmo valor: [{ n, v }]. */
function agrupar(valores) {
  const grupos = [];

  valores.forEach((v) => {
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.v === v) ultimo.n += 1;
    else grupos.push({ n: 1, v });
  });

  return grupos;
}

/**
 * Calcula o valor de um agendamento NOVO.
 * Reservas já lançadas guardam o próprio valor no banco e nunca são recalculadas.
 */
function calcularPreco({
  servico,
  quantidadePets,
  diarias,
  frequenciaSemanal,
  visitasDia,
  quantidadeDias,
  entradaISO = null,
  tabela = TABELA_PADRAO,
}) {
  const pets = inteiro(quantidadePets, 1, 10, 'Quantidade de pets');
  const sinal = tabela.base.sinal;

  if (servico === SERVICOS.HOSPEDAGEM_CAO || servico === SERVICOS.HOSPEDAGEM_GATO) {
    const totalDiarias = inteiro(diarias, 1, 60, 'Quantidade de diárias');

    // Cada diária usa o valor da sua própria data.
    const porDia = Array.from({ length: totalDiarias }, (_, i) =>
      valoresDoDia(tabela, entradaISO ? somarDias(entradaISO, i) : null).hospedagem
    );
    const grupos = agrupar(porDia);
    const valorTotal = arredondarMoeda(porDia.reduce((t, v) => t + v, 0) * pets);

    return {
      valorUnitario: grupos[0].v,
      valorTotal,
      ...aplicarSinal(valorTotal, sinal),
      descricao:
        grupos.length === 1
          ? `${totalDiarias} diária(s) × ${pets} pet(s) × ${moedaBR(grupos[0].v)}`
          : `${grupos.map((g) => `${g.n} diária(s) × ${moedaBR(g.v)}`).join(' + ')} (por pet) × ${pets} pet(s)`,
    };
  }

  if (servico === SERVICOS.CRECHE) {
    const frequencia = inteiro(frequenciaSemanal, 1, 5, 'Frequência semanal');
    const vigente = valoresDoDia(tabela, entradaISO);
    const valorTotal = vigente.creche[frequencia];

    return {
      valorUnitario: valorTotal,
      valorTotal,
      ...aplicarSinal(valorTotal, sinal),
      descricao: `Plano mensal de ${frequencia}x por semana${vigente.nome ? ` — ${vigente.nome}` : ''}`,
    };
  }

  if (servico === SERVICOS.DOMICILIAR) {
    const visitas = inteiro(visitasDia, 1, 2, 'Visitas por dia');
    const dias = inteiro(quantidadeDias, 1, 60, 'Quantidade de dias');

    const porDia = Array.from({ length: dias }, (_, i) =>
      valoresDoDia(tabela, entradaISO ? somarDias(entradaISO, i) : null).domiciliar[visitas]
    );
    const grupos = agrupar(porDia);
    const valorTotal = arredondarMoeda(porDia.reduce((t, v) => t + v, 0));

    return {
      valorUnitario: grupos[0].v,
      valorTotal,
      ...aplicarSinal(valorTotal, sinal),
      descricao:
        grupos.length === 1
          ? `${dias} dia(s) × ${visitas} visita(s) por dia — ${moedaBR(grupos[0].v)} por dia`
          : `${visitas} visita(s) por dia — ${grupos.map((g) => `${g.n} dia(s) × ${moedaBR(g.v)}`).join(' + ')}`,
    };
  }

  throw new Error('Não foi possível calcular o valor do serviço.');
}

module.exports = {
  calcularPreco,
};
