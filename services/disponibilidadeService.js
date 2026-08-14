'use strict';

const reservaModel = require('../models/reservaModel');
const {
  gerarIntervaloDias,
  gerarDatasPorDiasSemana,
  validarDataISO,
  compararDatasISO,
  formatarDataBR,
} = require('../utils/dateUtils');
const {
  LIMITE_VAGAS_DIARIO,
  LIMITE_CLIENTES_GATOS_POR_DIA,
  MAX_PETS_POR_RESERVA,
  SERVICOS,
  SERVICOS_VALIDOS,
  SERVICOS_COM_CONTROLE_DE_VAGA,
  SERVICOS_EXCLUSIVOS_POR_DIA,
  SERVICOS_SEM_CONTROLE,
} = require('../config/agendamento');

function validarServico(servico) {
  if (!SERVICOS_VALIDOS.includes(servico)) throw new Error('Serviço inválido.');
}

function validarQuantidadePets(quantidadePets) {
  if (
    !Number.isInteger(quantidadePets) ||
    quantidadePets < 1 ||
    quantidadePets > MAX_PETS_POR_RESERVA
  ) {
    throw new Error(`A quantidade de pets deve estar entre 1 e ${MAX_PETS_POR_RESERVA}.`);
  }
}

function resolverDatasOcupacao({ servico, entradaISO, saidaISO, diasSemanaCreche }) {
  validarServico(servico);
  validarDataISO(entradaISO);
  validarDataISO(saidaISO);

  if (compararDatasISO(saidaISO, entradaISO) < 0) {
    throw new Error('A data final não pode ser anterior à data inicial.');
  }

  if (servico === SERVICOS.HOSPEDAGEM_CAO || servico === SERVICOS.HOSPEDAGEM_GATO) {
    return gerarIntervaloDias(entradaISO, saidaISO, { incluirFim: false });
  }

  if (servico === SERVICOS.CRECHE) {
    const dias = Array.isArray(diasSemanaCreche)
      ? [...new Set(diasSemanaCreche.map(Number))].sort((a, b) => a - b)
      : [];

    if (dias.length === 0 || dias.some((dia) => !Number.isInteger(dia) || dia < 1 || dia > 5)) {
      throw new Error('Informe os dias da creche entre segunda e sexta.');
    }

    const datas = gerarDatasPorDiasSemana(entradaISO, saidaISO, dias);
    if (datas.length === 0) {
      throw new Error('Nenhuma data da creche foi encontrada no período escolhido.');
    }
    return datas;
  }

  if (servico === SERVICOS.DOMICILIAR) {
    return gerarIntervaloDias(entradaISO, saidaISO);
  }

  throw new Error('Não foi possível determinar as datas do serviço.');
}

async function verificarDisponibilidade({
  servico,
  entradaISO,
  saidaISO,
  quantidadePets,
  diasSemanaCreche,
  excluirProtocolo = null,
  datasOcupacaoISO = null,
  client = null,
}) {
  validarServico(servico);
  validarQuantidadePets(quantidadePets);
  await reservaModel.expirarPendentes(undefined, client);

  const datasOcupacao = Array.isArray(datasOcupacaoISO) && datasOcupacaoISO.length > 0
    ? [...new Set(datasOcupacaoISO)].sort()
    : resolverDatasOcupacao({ servico, entradaISO, saidaISO, diasSemanaCreche });

  if (SERVICOS_SEM_CONTROLE.includes(servico)) {
    return {
      disponivel: true,
      datasOcupacao,
      mensagem: 'Atendimento sujeito à confirmação de rota e horário pela equipe.',
    };
  }

  if (SERVICOS_EXCLUSIVOS_POR_DIA.includes(servico)) {
    for (const data of datasOcupacao) {
      const total = await reservaModel.contarReservasConfirmadasNoDia(
        data,
        servico,
        excluirProtocolo,
        client
      );

      if (total >= LIMITE_CLIENTES_GATOS_POR_DIA) {
        return {
          disponivel: false,
          datasOcupacao,
          motivo:
            `Já existe uma hospedagem de gatos já reservada em ${formatarDataBR(data)}. ` +
            'É aceito somente um cliente de gatos por dia.',
        };
      }
    }

    return {
      disponivel: true,
      datasOcupacao,
      mensagem: 'Período disponível para hospedagem de gatos.',
    };
  }

  let menorSaldo = LIMITE_VAGAS_DIARIO;

  for (const data of datasOcupacao) {
    const ocupadas = await reservaModel.somaVagasOcupadasNoDia(
      data,
      SERVICOS_COM_CONTROLE_DE_VAGA,
      excluirProtocolo,
      client
    );
    const livres = Math.max(0, LIMITE_VAGAS_DIARIO - ocupadas);

    if (quantidadePets > livres) {
      return {
        disponivel: false,
        datasOcupacao,
        motivo:
          `Não há vagas suficientes em ${formatarDataBR(data)}. ` +
          `Existem ${livres} vaga(s) livre(s), mas o pedido precisa de ${quantidadePets}.`,
      };
    }

    menorSaldo = Math.min(menorSaldo, livres - quantidadePets);
  }

  return {
    disponivel: true,
    datasOcupacao,
    vagasRestantes: menorSaldo,
    mensagem:
      'Há disponibilidade. Após o envio do comprovante, o menor saldo do período será ' +
      `${menorSaldo} vaga(s).`,
  };
}

module.exports = {
  validarServico,
  validarQuantidadePets,
  resolverDatasOcupacao,
  verificarDisponibilidade,
};
