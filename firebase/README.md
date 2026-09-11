# Funchal — portal Firebase

Interface React para acompanhar o financiamento, consultar o checklist e enviar arquivos classificados ao portal Funchal.

O cliente usa Firebase Authentication. Todas as chamadas à função `funchalApi` verificam o token da conta autenticada por e-mail e senha, a confirmação do e-mail e a conta autorizada configurada no servidor. Senha e código Funchal são encaminhados apenas durante o login. A sessão é cifrada em um banco Firestore separado; arquivos seguem para a Funchal e não são guardados no Firebase.

## Desenvolvimento e publicação

Use Node 22. Execute `npm ci` e `npm run build` nas pastas `client` e `functions`. Os testes do servidor são executados com `npm test` dentro de `functions`.

O projeto Firebase precisa de um Web App, um site Hosting separado, login por e-mail e senha habilitado e banco nomeado `funchal`. Associe o target Hosting `funchal` ao novo site em `.firebaserc`. Configure `FUNCHAL_OWNER_EMAIL`, `FUNCHAL_APP_ORIGIN` e `FUNCHAL_DATABASE_ID` no ambiente da função. Armazene uma chave aleatória de 32 bytes em base64 no segredo `FUNCHAL_SESSION_KEY` do Secret Manager.

Na pasta `firebase`, publique somente os recursos deste app:

```sh
firebase deploy --only functions:funchal,hosting:funchal,firestore:rules --project caixa-leilao
```

O arquivo `firebase.json` associa as regras exclusivamente ao banco nomeado `funchal`; não modifica os bancos existentes. A função usa até duas instâncias e não mantém instâncias mínimas. O consumo segue a cobrança do projeto Firebase.

## Documentos

O checklist vem do serviço autenticado da Funchal, incluindo instruções e condições. “Sem anexo” indica uma categoria sem arquivo, não uma exigência obrigatória em todos os casos. “Anexado” não significa aprovação bancária.

O envio pede arquivo, grupo, classificação, descrição e uma revisão explícita. O resultado só é confirmado após nova consulta aos anexos. Resultados incertos não são reenviados automaticamente. A substituição e a alteração da classificação de arquivos já enviados permanecem bloqueadas enquanto o comportamento correspondente do portal não estiver verificado.

Nunca publique arquivos `.env`, logs, chaves, sessões, documentos ou capturas do financiamento.
