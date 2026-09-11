# Funchal · Meu crédito

**[Acessar pelo GitHub](https://danielraimann.github.io/funchal/)** · **[Abrir o portal Firebase](https://funchal-raimann.web.app)**

O novo portal funciona no Chrome do celular, sem extensão. A página pública do GitHub encaminha para o ambiente privado no Firebase. Entre com a conta Google autorizada e depois conecte sua conta Funchal com usuário, senha e código de autenticação.

A aplicação permite acompanhar a proposta, consultar anexos, baixar documentos e revisar arquivo, grupo, classificação e descrição antes do envio. O checklist consulta as categorias, instruções, condições e quantidades de anexos retornadas pela Funchal. Uma categoria sem anexo não é automaticamente obrigatória; um arquivo anexado não significa aprovação do banco.

O código da nova aplicação está em [`firebase/`](firebase/). O servidor protege as sessões em um banco Firestore separado. Senhas, códigos de autenticação e arquivos não são armazenados nesse banco. O GitHub contém apenas código e documentação.

A substituição e a reclassificação de anexos existentes ainda dependem da validação do comportamento do portal original. Envios com resultado incerto não são repetidos automaticamente. O código de upload tem testes locais; nenhum documento de teste foi enviado à proposta real.

## Extensão para computador

Uma camada visual para a página `Default.aspx` do Portal Funchal. Os dados são lidos da página autenticada e as consultas e aberturas de documentos acionam os controles originais. Não é um aplicativo oficial do Bradesco ou da Funchal.

**[Baixar a extensão](https://github.com/danielraimann/funchal/releases/latest/download/meu-credito-extensao.zip)** · **[Baixar o userscript](https://github.com/danielraimann/funchal/releases/latest/download/funchal.user.js)** · **[Abrir o portal](https://formalizabra.creditoimobiliario.funchalnegocios.com.br/)**

Este endereço distribui a interface. Para usá-la automaticamente em cada acesso, instale a extensão no navegador em que você acessa o portal. Abrir este repositório não conecta sua conta de financiamento.

## O que está implementado

- Resumo da proposta, valor, prazo, protocolo e dados do titular.
- Seis etapas, com a etapa atual e o texto retornado pela consulta original do portal.
- Documentos com busca por descrição, tipo e data, acionando a abertura original.
- Histórico somente quando a conta o disponibiliza.
- Atualização das etapas, documentos e histórico pela ação original de seleção da proposta.
- Layout para telas estreitas e amplas, navegação por teclado e retorno ao visual original.

O valor e os dados da proposta vêm da lista carregada pelo portal. “Atualizar acompanhamento” reconsulta as etapas, os documentos e o histórico; uma atualização completa da lista exige recarregar a página original.

## Uso durável no computador

1. Baixe o ZIP acima e extraia em uma pasta permanente no computador.
2. No Chrome, abra `chrome://extensions`. No Edge, abra `edge://extensions`.
3. Ative **Modo do desenvolvedor**.
4. Escolha **Carregar sem compactação** e selecione a pasta `extension` que você extraiu — a pasta que contém `manifest.json`.
5. Abra o portal e entre normalmente. O visual será aplicado automaticamente à página de acompanhamento.

A extensão só atua no domínio indicado e não pede acesso a outros sites, cookies, armazenamento ou histórico do navegador. Não apague a pasta instalada: o navegador continua carregando a extensão a partir dela.

Acesse o portal normalmente e conclua o login e o código por e-mail. A visualização é aplicada à página de acompanhamento. As telas de login, anexação, informações e assinatura continuam sendo as do portal original.

`npm run package` gera também um userscript na pasta `outputs`, para navegadores que suportem um gerenciador compatível. A versão da extensão usa content script no mundo MAIN para acompanhar os eventos jQuery do próprio portal.

Para atualizar a extensão, substitua os arquivos na mesma pasta e use o botão **Recarregar** na página de extensões. O pacote não instala atualizações automáticas. Para remover o visual, use **Remover** na página de extensões.

## Diferença entre as versões

Os pacotes desta release são a extensão e o userscript para execução dentro do portal original. Para o Chrome no celular, use o endereço privado da versão web acima. A extensão continua sendo uma opção separada para computador.

## Privacidade e limites da extensão

Na extensão distribuída neste repositório, não há servidor novo, armazenamento local de informações da conta, telemetria, coleta de senha/token, cópia de cookies ou chamadas a serviços externos. Somente o portal mantém a sessão. Nenhum dado de conta está incluído nos arquivos distribuídos.

A integração depende dos elementos e eventos da página original. Permissões são mantidas; a camada não libera histórico, detalhes ou ações que o portal não disponibiliza. Informações sem valor são apresentadas como “Não informado”, sem inferir aprovação, pendência, data prometida ou conclusão a partir da ausência de dados.

Na aplicação temporária a uma aba, o visual volta ao original ao recarregar, salvo quando a extensão/userscript já estiver instalado. O botão **Visual original** mantém a página original acessível.

## Verificação

`npm run check` verifica a sintaxe. Validação da integração requer uma sessão autenticada. Testes não devem enviar documentos, aceitar contratos, excluir dados ou modificar a contratação.
