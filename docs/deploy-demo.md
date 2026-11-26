# Deploy da demonstração (Cloudflare Pages + Convex Cloud)

Ambiente público e independente para apresentar o MedBridge, só com **dados fictícios**.
O desenvolvimento local continua igual: backend Convex local e login com o emulador do Google.

| Parte                         | Onde                                                                              | Como sobe                                        |
| ----------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------ |
| Backend + banco + tempo real  | Convex Cloud, projeto separado (ex.: `medbridge-demo`), deployment **Production** | `node script/demo-cloud.mjs deploy`, feito à mão |
| Frontend (arquivos estáticos) | Cloudflare Pages, branch `demo`                                                   | push na branch `demo`                            |
| Login                         | E-mail e senha, uma conta por hospital                                            | `node script/demo-cloud.mjs accounts`            |

## Regras de segurança

- A **deploy key** e a **senha** são digitadas com `Read-Host -AsSecureString` (passo 2): aparecem como `*`, não ficam no histórico do PowerShell e só existem na memória daquela janela. Nunca em arquivo, no `.env.local`, no Cloudflare ou no GitHub.
- **Não** digite `$env:CONVEX_DEPLOY_KEY = "..."` nem `$env:DEMO_PASSWORD = "..."`: o PowerShell 5.1 (PSReadLine 2.0) grava toda linha digitada em `%APPDATA%\Microsoft\Windows\PowerShell\PSReadLine\ConsoleHost_history.txt`.
- Não use `npx convex login`. Crie o projeto pelo painel web do Convex.
- Antes de qualquer operação, o script `script/demo-cloud.mjs` exige que a chave seja de **produção** (`prod:...`), que o deployment da chave seja **exatamente** `DEMO_EXPECTED_DEPLOYMENT`, que ele responda e que não seja o backend local. Nenhum segredo é mostrado na tela, nem em mensagens de erro.
- Depois da apresentação: troque a senha (`accounts` de novo) e revogue a deploy key no painel.

## 1. Criar as contas (feito pelo grupo)

1. **Convex**: no painel web, crie o projeto `medbridge-demo`. Em _Settings → Deploy keys_, gere uma **Production deploy key**. Anote também as URLs `https://<nome>.convex.cloud` e `https://<nome>.convex.site` (_Settings → URL and deploy key_).
2. **Cloudflare**: crie a conta e um projeto Pages ligado ao repositório do GitHub (passo 4).

## 2. Backend no Convex Cloud

Abra uma janela **nova** do PowerShell, na pasta do projeto, com `pnpm install` já feito.

**a) Função para digitar segredos com segurança** (cole uma vez por janela; a linha não contém nenhum segredo):

```powershell
function Set-SessaoSegredo([string]$Nome, [string]$Pergunta) { $seguro = Read-Host $Pergunta -AsSecureString; $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($seguro); try { [Environment]::SetEnvironmentVariable($Nome, [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr), 'Process') } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr); $seguro.Dispose() } }
```

Ela lê o valor como `SecureString`, copia para a variável de ambiente **só desta janela** e apaga na hora a cópia temporária em texto puro (`ZeroFreeBSTR`). O valor nunca vai para uma variável do PowerShell, para a tela ou para o histórico.

**b) Variáveis da sessão:**

```powershell
Set-SessaoSegredo CONVEX_DEPLOY_KEY "Cole a Production deploy key do medbridge-demo"
$env:DEMO_EXPECTED_DEPLOYMENT = "<nome-do-deployment>"   # o nome do deployment de produção, como aparece no painel
$env:DEMO_SITE_URL = "https://medbridge-demo.pages.dev"  # endereço do Cloudflare Pages
```

`DEMO_EXPECTED_DEPLOYMENT` e `DEMO_SITE_URL` não são segredos. O nome do deployment é a parte da chave entre `prod:` e `|`, e aparece no painel do Convex.

**c) Comandos:**

```powershell
node script/demo-cloud.mjs check    # confere chave e destino; mostra o SITE_URL atual; não muda nada
node script/demo-cloud.mjs env      # chaves de login novas + variáveis da demo; relê e confere o SITE_URL
node script/demo-cloud.mjs deploy   # publica as funções e o schema
```

Variáveis definidas pelo `env` no Convex Cloud:

| Variável                  | Valor                                                            |
| ------------------------- | ---------------------------------------------------------------- |
| `SITE_URL`                | endereço público do site                                         |
| `JWT_PRIVATE_KEY`, `JWKS` | chaves geradas só para a demo (não são mostradas)                |
| `AUTH_PASSWORD_ENABLED`   | `true` (login por e-mail e senha)                                |
| `AUTH_GOOGLE_DISABLED`    | `true` (sem Google na demo)                                      |
| `PLATFORM_ADMIN_EMAILS`   | `nenhum-admin@medbridge.invalid` (ninguém é admin da plataforma) |

Não definir na demo: `AUTH_GOOGLE_*`, `AUTH_GOOGLE_EMULATE_URL`, `RESEND_*`, `E2E_*`.

## 3. Dados fictícios e contas

Na mesma janela do passo 2:

```powershell
node script/demo-cloud.mjs seed     # Hospital Blooma (vazio) + Hospital Esperança (exemplos)
Set-SessaoSegredo DEMO_PASSWORD "Senha das contas dos hospitais (minimo 8 caracteres)"
node script/demo-cloud.mjs accounts # cria/atualiza a senha de cada conta
Remove-Item Env:DEMO_PASSWORD       # a senha sai da memória da janela logo depois do uso
```

Ao terminar todo o passo 2 e 3, apague também a chave e feche a janela:

```powershell
Remove-Item Env:CONVEX_DEPLOY_KEY
```

- Contas: `hospital.blooma@example.com` e `hospital.esperanca@example.com`, com a senha definida acima.
- Cada conta é **admin só do próprio hospital** (para mostrar Configurações › Setores e leitos). Não é admin da plataforma.
- Para escolher os hospitais: `$env:DEMO_HOSPITALS = "hospital-blooma"` antes de `seed` ou `accounts`.

### Restaurar o estado inicial antes de uma apresentação

Numa janela com a função `Set-SessaoSegredo` (passo 2a):

```powershell
Set-SessaoSegredo CONVEX_DEPLOY_KEY "Cole a Production deploy key do medbridge-demo"
$env:DEMO_EXPECTED_DEPLOYMENT = "<nome-do-deployment>"
$env:DEMO_HOSPITALS = "hospital-esperanca"   # só o hospital que deve voltar ao início
node script/demo-cloud.mjs seed --reset
Remove-Item Env:CONVEX_DEPLOY_KEY
```

O `--reset` apaga e recria setores, leitos e pedidos **apenas** dos hospitais escolhidos. Os horários dos exemplos ("pedido há 6 min") contam a partir do momento do reset, então rode-o pouco antes de apresentar. Sem `--reset`, o `seed` não muda nada em hospitais que já existem. A conta e a senha não mudam com o reset.

## 4. Frontend no Cloudflare Pages

Crie a branch `demo` a partir da branch que será apresentada e envie para o GitHub. No Cloudflare Pages, conecte o repositório:

| Configuração           | Valor                                                                         |
| ---------------------- | ----------------------------------------------------------------------------- |
| Production branch      | `demo`                                                                        |
| Framework preset       | None                                                                          |
| Build command          | `corepack enable && pnpm install --frozen-lockfile && pnpm exec vite build`   |
| Build output directory | `dist/public`                                                                 |
| Root directory         | `/` (raiz do repositório)                                                     |
| Preview deployments    | **desligadas** (_Settings → Builds → Branch control_: só a production branch) |

Variáveis de ambiente (_Production_, todas públicas; nenhuma é segredo):

| Variável                  | Valor                                                          |
| ------------------------- | -------------------------------------------------------------- |
| `VITE_CONVEX_URL`         | `https://<nome>.convex.cloud`                                  |
| `VITE_CONVEX_SITE_URL`    | `https://<nome>.convex.site`                                   |
| `VITE_AUTH_MODE`          | `password`                                                     |
| `VITE_APP_ENV`            | `production`                                                   |
| `NODE_VERSION`            | `22.22.2`                                                      |
| `SKIP_DEPENDENCY_INSTALL` | `1` (a instalação acontece no build command, com o pnpm certo) |
| `HUSKY`                   | `0`                                                            |
| `CYPRESS_INSTALL_BINARY`  | `0`                                                            |

- Use `pnpm exec vite build`, **não** `pnpm run build`: este roda o Convex e precisaria da deploy key.
- Roteamento SPA: sem `404.html` na saída, o Cloudflare Pages devolve o `index.html` para qualquer rota. Não é preciso `_redirects`.
- `client/public/_headers` adiciona `noindex` (a demo não aparece em buscadores) e cabeçalhos básicos de segurança.
- Se o endereço final do site for diferente do `DEMO_SITE_URL` usado no passo 2, repita o passo 2 (a, b) com o endereço certo e rode só `check` e `env`.

## 5. Conferência final

1. Abrir o site e entrar com `hospital.esperanca@example.com`.
2. Alternar Enfermagem ↔ Farmácia com "Trocar perfil" (sem sair da conta).
3. Criar um pedido na Enfermagem e vê-lo aparecer na Farmácia; atualizar status.
4. Fechar e reabrir o navegador: a sessão e os pedidos continuam.
5. `/admin` volta para a tela inicial (sem acesso de plataforma).

## Ordem das atualizações

Backend primeiro (`deploy`), frontend depois (push na `demo`). Os dois são independentes: dá para republicar o site sem mexer nos dados, e restaurar dados sem republicar o site.
