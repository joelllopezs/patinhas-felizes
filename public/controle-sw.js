'use strict';

/**
 * Service worker do painel (escopo /controle/).
 * Propositalmente NÃO guarda dados em cache: o painel mostra telefones e valores
 * de clientes, então tudo vem sempre da rede. Só mostra um aviso se estiver sem internet.
 */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return;

  event.respondWith(
    fetch(event.request).catch(
      () =>
        new Response(
          '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sem conexão</title>' +
            '<body style="font-family:system-ui,sans-serif;background:#F1EAF9;color:#4B257A;padding:28px;text-align:center">' +
            '<h2>🐾 Sem conexão</h2><p>O painel precisa de internet. Conecte-se e abra de novo.</p></body></html>',
          { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        )
    )
  );
});
