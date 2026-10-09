'use strict';

const db = require('../database/connection');


async function buscarStatusAgenda() {

  const resultado = await db.query(`
    SELECT *
    FROM controle_agenda
    ORDER BY id DESC
    LIMIT 1
  `);

  return resultado.rows[0] || {
    pausado: false
  };
}


async function buscarPausaAtiva() {

  const resultado = await db.query(`
    SELECT *
    FROM controle_agenda
    WHERE pausado = true
      AND CURRENT_DATE BETWEEN data_inicio AND data_fim
    ORDER BY id DESC
    LIMIT 1
  `);

  return resultado.rows[0] || null;
}


async function pausarAgenda({
  dataInicio,
  dataFim,
  motivo
}) {

  await db.query(`
    UPDATE controle_agenda
    SET pausado = false,
        atualizado_em = NOW()
  `);


  const resultado = await db.query(`
    INSERT INTO controle_agenda
    (
      pausado,
      data_inicio,
      data_fim,
      motivo
    )
    VALUES
    (
      true,
      $1,
      $2,
      $3
    )
    RETURNING *
  `,
  [
    dataInicio,
    dataFim,
    motivo || null
  ]);


  return resultado.rows[0];
}



async function liberarAgenda() {

  await db.query(`
    UPDATE controle_agenda
    SET pausado = false,
        atualizado_em = NOW()
  `);

}


module.exports = {
  buscarStatusAgenda,
  buscarPausaAtiva,
  pausarAgenda,
  liberarAgenda
};