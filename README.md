# Patinhas Felizes - Agendamento Web 4.0

Versao preparada para deploy na Vercel com persistencia externa:

- Node.js 22
- Neon PostgreSQL
- Vercel Blob Private
- upload direto do navegador para o Blob
- protocolo e validacao via WhatsApp
- controle transacional de vagas

## Inicio rapido

```bash
npm install
```

Copie `.env.example` para `.env`, configure `DATABASE_URL` e `UPLOAD_SIGNING_SECRET` e depois rode:

```bash
npm run db:setup
npm start
```

Acesse `http://localhost:3000`.

Para o passo a passo completo de producao, leia `DEPLOY.md`.

## Persistencia

O projeto nao usa mais `agendamento.db` nem `uploads/comprovantes`.

As reservas ficam no Neon. Os comprovantes ficam em Vercel Blob Private e o banco guarda apenas o pathname e os metadados necessarios para recuperacao protegida.

## Comandos

```bash
npm run build
npm run check
npm test
npm run db:setup
npm start
```

## Estrutura

- `public/`: HTML e CSS estaticos; `script.js` e gerado no build.
- `src/script.js`: JavaScript do navegador.
- `server.js`: servidor HTTP/API.
- `database/schema.sql`: estrutura PostgreSQL.
- `models/`: consultas PostgreSQL.
- `services/`: regras de negocio, disponibilidade, reserva e Blob.
- `DEPLOY.md`: configuracao Neon/Vercel.
# patinha-felizes
