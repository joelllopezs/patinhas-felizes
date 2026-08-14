# Deploy - Vercel + Neon + Vercel Blob Private

Este projeto nao usa mais SQLite nem a pasta uploads. A persistencia ficou assim:

- Neon PostgreSQL: reservas, datas ocupadas, protocolos e referencias dos comprovantes.
- Vercel Blob Private: PDF/JPG/PNG/WEBP dos comprovantes.
- Vercel: site, API Node.js e build do JavaScript do navegador.

## 1. Criar o banco no Neon

1. Crie um projeto no Neon.
2. Crie o projeto na regiao `AWS South America (Sao Paulo) - aws-sa-east-1`. O arquivo `vercel.json` fixa a Function em `gru1` (Sao Paulo), mantendo API e banco proximos.
3. No painel do Neon, copie a connection string com connection pooling. O host normalmente contem `-pooler`.
4. Coloque essa URL na variavel `DATABASE_URL`.
5. Execute o arquivo `database/schema.sql` no SQL Editor do Neon.

Alternativa local, depois de configurar `.env`:

```bash
npm install
npm run db:setup
```

O `schema.sql` pode ser executado novamente: ele usa `IF NOT EXISTS` onde necessario.

## 2. Criar o Vercel Blob Private

1. Crie/importa o projeto na Vercel.
2. Abra o projeto e entre em `Storage`.
3. Clique em `Create Database` e escolha `Blob`.
4. Escolha acesso `Private`.
5. Conecte o Blob ao mesmo projeto da aplicacao.
6. Inclua Production e Preview e, se quiser testar localmente com `vercel env pull`, tambem Development.
7. Em Project Settings -> Environment Variables, confirme que a conexao criou `BLOB_READ_WRITE_TOKEN`. O endpoint `handleUpload` usa esse token no servidor para emitir autorizacoes curtas de upload para o navegador.

Nao coloque a URL nem o token do Blob no codigo do navegador. O token fica somente nas variaveis do projeto/servidor. As leituras privadas feitas no servidor podem usar a autenticacao disponibilizada pela conexao do Blob.

## 3. Variaveis da Vercel

Em `Project Settings -> Environment Variables`, configure:

- `DATABASE_URL`: connection string pooler do Neon.
- `PUBLIC_BASE_URL`: URL final do site, sem `/` no final.
- `UPLOAD_SIGNING_SECRET`: segredo aleatorio com pelo menos 32 caracteres.
- `PIX_KEY`: chave Pix exibida no fluxo.
- `OWNER_WHATSAPP`: numero da empresa com DDI/DDD, apenas digitos.
- `VALIDATION_PIN`: PIN usado na tela privada de validacao.
- `EXPIRACAO_VALIDACAO_HORAS`: padrao 72.
- `DB_POOL_MAX`: padrao 3.
- `UPLOAD_TICKET_MINUTOS`: padrao 30.

Para gerar `UPLOAD_SIGNING_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

O Blob conectado ao projeto deve fornecer `BLOB_READ_WRITE_TOKEN` ao ambiente selecionado. Nao copie esse token para o frontend: o navegador recebe apenas tokens temporarios emitidos pelo endpoint `/api/comprovantes/upload`.

## 4. Fazer o deploy

O projeto inclui `vercel.json` e usa:

```bash
npm run build
```

O build empacota `src/script.js` em `public/script.js` com esbuild.

Depois do primeiro deploy, confirme a URL definitiva e configure `PUBLIC_BASE_URL`. Em seguida, faca um novo deploy para que links de validacao/comprovante e WhatsApp usem o dominio correto.

## 5. Checklist de validacao

Teste nesta ordem:

1. Abrir a pagina inicial.
2. Consultar disponibilidade.
3. Preencher um agendamento.
4. Selecionar PDF/JPG/PNG/WEBP de ate 5 MB.
5. Enviar o comprovante.
6. Conferir se apareceu um novo Blob no Storage.
7. Conferir a nova linha na tabela `reservas` do Neon.
8. Abrir o link de comprovante gerado pelo sistema.
9. Abrir o link de validacao e testar o PIN.
10. Confirmar e cancelar reservas de teste e conferir a liberacao das vagas.

## Desenvolvimento local

1. Rode `npm install`.
2. Copie `.env.example` para `.env`.
3. Configure `DATABASE_URL` e `UPLOAD_SIGNING_SECRET`.
4. Conecte o Blob ao ambiente Development na Vercel.
5. Se usar Vercel CLI, rode `vercel link` e `vercel env pull .env.local`.
6. Rode `npm run db:setup` uma vez.
7. Rode `npm start` ou `vercel dev`.

`utils/loadEnv.js` carrega primeiro `.env.local` e depois `.env`, sem sobrescrever variaveis ja definidas pelo ambiente.

## Arquivos principais alterados

- `server.js`
- `src/script.js`
- `database/connection.js`
- `database/schema.sql`
- `models/reservaModel.js`
- `models/tentativaPinModel.js`
- `services/agendamentoWebService.js`
- `services/disponibilidadeService.js`
- `services/reservaService.js`
- `services/comprovanteService.js`
- `services/uploadTicketService.js`
- `config/agendamento.js`
- `.env.example`
- `package.json`
- `vercel.json`
