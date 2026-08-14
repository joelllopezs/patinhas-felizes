'use strict';

require('../utils/loadEnv')();

function numeroInteiroEnv(
  nome,
  padrao,
  minimo,
  maximo
) {
  const valor =
    Number(
      process.env[nome]
    );

  if (
    !Number.isInteger(valor) ||
    valor < minimo ||
    valor > maximo
  ) {
    return padrao;
  }

  return valor;
}

const SERVICOS =
  Object.freeze({
    HOSPEDAGEM_CAO:
      'hospedagem_cao',

    HOSPEDAGEM_GATO:
      'hospedagem_gato',

    CRECHE:
      'creche',

    DOMICILIAR:
      'domiciliar',
  });

const STATUS =
  Object.freeze({
    AGUARDANDO_VALIDACAO:
      'aguardando_validacao',

    CONFIRMADO:
      'confirmado',

    CANCELADO:
      'cancelado',

    EXPIRADO:
      'expirado',
  });

const PRECOS =
  Object.freeze({
    HOSPEDAGEM_DIARIA: 60,

    CRECHE:
      Object.freeze({
        1: 160,
        2: 280,
        3: 360,
        4: 440,
        5: 520,
      }),

    DOMICILIAR:
      Object.freeze({
        1: 50,
        2: 100,
      }),

    SINAL_RESERVA: 60,
  });

const SERVICOS_VALIDOS =
  Object.freeze(
    Object.values(
      SERVICOS
    )
  );

const STATUS_VALIDOS =
  Object.freeze(
    Object.values(
      STATUS
    )
  );

module.exports =
  Object.freeze({
    APP_VERSION:
      '4.0.0',

    PORT:
      numeroInteiroEnv(
        'PORT',
        3000,
        1,
        65535
      ),

    HOST:
      process.env.HOST ||
      '0.0.0.0',

    PUBLIC_BASE_URL:
      String(
        process.env.PUBLIC_BASE_URL ||
          ''
      ).replace(
        /\/+$/,
        ''
      ),

    DATABASE_URL:
      String(
        process.env.DATABASE_URL ||
          ''
      ).trim(),

    DB_POOL_MAX:
      numeroInteiroEnv(
        'DB_POOL_MAX',
        3,
        1,
        10
      ),

    UPLOAD_SIGNING_SECRET:
      String(
        process.env.UPLOAD_SIGNING_SECRET ||
          ''
      ),

    UPLOAD_TICKET_MINUTOS:
      numeroInteiroEnv(
        'UPLOAD_TICKET_MINUTOS',
        30,
        5,
        120
      ),

    PIX_KEY:
      process.env.PIX_KEY ||
      '(14) 99720-0278',

    OWNER_WHATSAPP:
      String(
        process.env.OWNER_WHATSAPP ||
          '5514991937562'
      ).replace(
        /\D/g,
        ''
      ),

    VALIDATION_PIN:
      String(
        process.env.VALIDATION_PIN ||
          '2468'
      ),

    INSTAGRAM:
      '@Patinhasfelizesmarilia',

    LIMITE_VAGAS_DIARIO:
      15,

    LIMITE_CLIENTES_GATOS_POR_DIA:
      1,

    MAX_PETS_POR_RESERVA:
      10,

    MAX_DIAS_HOSPEDAGEM:
      60,

    MAX_DIAS_CRECHE:
      31,

    MAX_DIAS_DOMICILIAR:
      60,

    MAX_COMPROVANTE_BYTES:
      5 * 1024 * 1024,

    EXPIRACAO_VALIDACAO_HORAS:
      numeroInteiroEnv(
        'EXPIRACAO_VALIDACAO_HORAS',
        72,
        1,
        720
      ),

    SERVICOS,
    SERVICOS_VALIDOS,

    STATUS,
    STATUS_VALIDOS,

    PRECOS,

    SERVICOS_COM_CONTROLE_DE_VAGA:
      Object.freeze([
        SERVICOS.HOSPEDAGEM_CAO,
        SERVICOS.CRECHE,
      ]),

    SERVICOS_EXCLUSIVOS_POR_DIA:
      Object.freeze([
        SERVICOS.HOSPEDAGEM_GATO,
      ]),

    SERVICOS_SEM_CONTROLE:
      Object.freeze([
        SERVICOS.DOMICILIAR,
      ]),
  });