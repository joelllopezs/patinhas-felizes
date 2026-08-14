'use strict';

const fs = require('fs');
const path = require('path');

let carregado = false;

function removerAspas(valor) {
  if (
    valor.length >= 2 &&
    ((valor.startsWith('"') && valor.endsWith('"')) ||
      (valor.startsWith("'") && valor.endsWith("'")))
  ) {
    return valor.slice(1, -1);
  }

  return valor;
}

function carregarArquivo(caminho) {
  if (!caminho || !fs.existsSync(caminho)) return;

  const conteudo = fs.readFileSync(caminho, 'utf8');

  for (const linhaOriginal of conteudo.split(/\r?\n/)) {
    const linha = linhaOriginal.trim();
    if (!linha || linha.startsWith('#')) continue;

    const separador = linha.indexOf('=');
    if (separador <= 0) continue;

    const chave = linha.slice(0, separador).trim();
    const valor = removerAspas(linha.slice(separador + 1).trim());

    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(chave) && process.env[chave] === undefined) {
      process.env[chave] = valor;
    }
  }
}

function loadEnv(caminho = null) {
  if (carregado) return;
  carregado = true;

  if (caminho) {
    carregarArquivo(caminho);
    return;
  }

  const raiz = path.join(__dirname, '..');
  carregarArquivo(path.join(raiz, '.env.local'));
  carregarArquivo(path.join(raiz, '.env'));
}

module.exports = loadEnv;
