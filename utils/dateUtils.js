'use strict';

const REGEX_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

function criarDataUTC(ano, mes, dia) {
  return new Date(Date.UTC(ano, mes - 1, dia));
}

function extrairPartesISO(dataISO) {
  if (typeof dataISO !== 'string') {
    throw new Error('A data deve ser informada no formato YYYY-MM-DD.');
  }

  const valor = dataISO.trim();
  const match = valor.match(REGEX_ISO);
  if (!match) throw new Error(`Data inválida: "${dataISO}".`);

  const ano = Number(match[1]);
  const mes = Number(match[2]);
  const dia = Number(match[3]);
  const data = criarDataUTC(ano, mes, dia);

  if (
    data.getUTCFullYear() !== ano ||
    data.getUTCMonth() !== mes - 1 ||
    data.getUTCDate() !== dia
  ) {
    throw new Error(`A data ${valor} não existe.`);
  }

  return { ano, mes, dia };
}

function formatarISO(ano, mes, dia) {
  return `${String(ano).padStart(4, '0')}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

function validarDataISO(dataISO) {
  extrairPartesISO(dataISO);
  return true;
}

function dataISOParaDate(dataISO) {
  const { ano, mes, dia } = extrairPartesISO(dataISO);
  return criarDataUTC(ano, mes, dia);
}

function dateParaISO(data) {
  if (!(data instanceof Date) || Number.isNaN(data.getTime())) {
    throw new Error('Objeto Date inválido.');
  }

  return formatarISO(data.getUTCFullYear(), data.getUTCMonth() + 1, data.getUTCDate());
}

function compararDatasISO(dataA, dataB) {
  validarDataISO(dataA);
  validarDataISO(dataB);
  if (dataA === dataB) return 0;
  return dataA < dataB ? -1 : 1;
}

function adicionarDiasISO(dataISO, quantidadeDias) {
  if (!Number.isInteger(quantidadeDias)) {
    throw new Error('A quantidade de dias deve ser inteira.');
  }

  const data = dataISOParaDate(dataISO);
  data.setUTCDate(data.getUTCDate() + quantidadeDias);
  return dateParaISO(data);
}

function gerarIntervaloDias(inicioISO, fimISO, { incluirFim = true } = {}) {
  validarDataISO(inicioISO);
  validarDataISO(fimISO);

  const comparacao = compararDatasISO(fimISO, inicioISO);
  if (comparacao < 0) throw new Error('A data final não pode ser anterior à data inicial.');
  if (!incluirFim && comparacao === 0) {
    throw new Error('A data de saída deve ser posterior à entrada.');
  }

  const datas = [];
  let atual = inicioISO;

  while (
    incluirFim
      ? compararDatasISO(atual, fimISO) <= 0
      : compararDatasISO(atual, fimISO) < 0
  ) {
    datas.push(atual);
    atual = adicionarDiasISO(atual, 1);
  }

  return datas;
}

function gerarDatasPorDiasSemana(inicioISO, fimISO, diasSemana) {
  if (!Array.isArray(diasSemana) || diasSemana.length === 0) {
    throw new Error('Informe ao menos um dia da semana.');
  }

  const dias = [...new Set(diasSemana.map(Number))].sort((a, b) => a - b);
  if (dias.some((dia) => !Number.isInteger(dia) || dia < 1 || dia > 7)) {
    throw new Error('Os dias da semana devem estar entre 1 e 7.');
  }

  return gerarIntervaloDias(inicioISO, fimISO).filter((dataISO) => {
    const diaJS = dataISOParaDate(dataISO).getUTCDay();
    const diaISO = diaJS === 0 ? 7 : diaJS;
    return dias.includes(diaISO);
  });
}

function quantidadeDiasInclusivos(inicioISO, fimISO) {
  const inicio = dataISOParaDate(inicioISO).getTime();
  const fim = dataISOParaDate(fimISO).getTime();
  const diferenca = Math.round((fim - inicio) / 86400000);

  if (diferenca < 0) throw new Error('A data final não pode ser anterior à data inicial.');
  return diferenca + 1;
}

function formatarDataBR(dataISO) {
  const { ano, mes, dia } = extrairPartesISO(dataISO);
  return `${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}/${ano}`;
}

function hojeISOEmSaoPaulo() {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const mapa = Object.fromEntries(partes.map((parte) => [parte.type, parte.value]));
  return `${mapa.year}-${mapa.month}-${mapa.day}`;
}

module.exports = {
  validarDataISO,
  compararDatasISO,
  adicionarDiasISO,
  gerarIntervaloDias,
  gerarDatasPorDiasSemana,
  quantidadeDiasInclusivos,
  formatarDataBR,
  hojeISOEmSaoPaulo,
};
