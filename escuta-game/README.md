# 👂 Jornada da Escuta

Jogo de capacitação gamificada em **escuta especializada** e **revelação espontânea** de violência contra crianças e adolescentes (Lei 13.431/2017, Decreto 9.603/2018 e ECA).

- Instalado **uma vez em um servidor compartilhado**; os participantes acessam pelo navegador (celular ou computador).
- **Só entra quem tem um código** (`ESC-XXXX-XXXX`) gerado pelo **administrador** no painel `/admin`.
- Sem dependências externas: apenas **Node.js 18+** (testado no 22). Dados em um único arquivo JSON.

## Como funciona o jogo

5 fases, 38 questões, até 380 XP:

| Fase | Formato | Tema |
|---|---|---|
| 📚 Fundamentos | quiz | escuta especializada × depoimento especial × revelação espontânea, direitos, formas de violência |
| 🤝 A Revelação | 2 cenas interativas com "vínculo de confiança" | o que dizer e fazer quando a criança/adolescente conta (escola e CRAS) |
| ❓ Perguntas que Protegem | rodada rápida | aberta × sugestiva × invasiva × culpabilizadora; revitimização |
| 🕸️ Rede de Proteção | ordenar passos + quiz | fluxo após a revelação, dever de comunicar, sigilo, Disque 100, autocuidado |
| 🏆 Desafio Final | cena complexa (creche) | libera após as 4 fases; reúne tudo |

Gamificação: XP, 5 níveis, 8 insígnias, sequência de acertos, ranking por grupo e certificado imprimível/PDF ao concluir. O gabarito fica **no servidor** (o navegador nunca recebe as respostas certas) e cada questão pontua uma única vez.

> ⚠️ **Revise o conteúdo antes de usar.** Os casos são fictícios e não descrevem detalhes da violência, mas devem ser validados pela equipe técnica e ajustados ao **protocolo/fluxo do seu município** (órgãos, nomes de serviços, telefones). O conteúdo está em `lib/content.js` e é fácil de editar.

## Instalação rápida (servidor Linux)

```bash
cd escuta-game
cp .env.example .env            # ajuste ADMIN_PASSWORD etc.
export $(grep -v '^#' .env | xargs)
npm start                        # http://servidor:3000   |   painel: /admin
```

Se `ADMIN_PASSWORD` não for definida, uma senha aleatória é gerada na 1ª execução, exibida no console e salva em `data/admin-password.txt`.

### Com Docker

```bash
export ADMIN_PASSWORD='uma-senha-longa-e-unica'
docker compose up -d --build     # dados persistem no volume "escuta-data"
```

### Como serviço (systemd)

```ini
# /etc/systemd/system/escuta.service
[Unit]
Description=Jornada da Escuta
After=network.target

[Service]
WorkingDirectory=/opt/escuta-game
EnvironmentFile=/opt/escuta-game/.env
ExecStart=/usr/bin/node server.js
Restart=always
User=escuta

[Install]
WantedBy=multi-user.target
```

### HTTPS e proxy reverso (recomendado)

Publique atrás de Nginx/Caddy/Traefik com HTTPS e defina `TRUST_PROXY=1` (para limitar tentativas por IP real; sem isso, todos os usuários atrás do proxy aparecem com o mesmo IP). Exemplo Nginx:

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

Os cookies de sessão são `HttpOnly`, `SameSite=Strict` e `Secure` automaticamente quando o acesso é por HTTPS.

## Uso pelo administrador (`/admin`)

1. Entre com a `ADMIN_PASSWORD`.
2. **Códigos de acesso → Gerar**: informe o nome da turma, quantidade, limite de participantes (0 = sem limite) e validade em dias (0 = sem prazo). Cada código forma um **grupo com ranking próprio**.
   - Turma com um código compartilhado: `quantidade 1`, limite = nº de alunos.
   - Acesso individual: `quantidade N`, limite `1`.
3. Distribua os códigos (botão *Copiar*). O endereço do jogo é a raiz do servidor.
4. **Revogar** bloqueia o código e derruba as sessões na hora (dá para reativar). **Excluir** apaga o código e os dados do grupo.
5. **Participantes**: XP, % de acerto, questões respondidas, conclusão; **Exportar CSV** (abre no Excel).
6. **Análise por questão**: onde o grupo mais errou, para reforçar na parte presencial da capacitação.

## Privacidade e segurança

- Sem cadastro: o participante informa só nome ou apelido (e é orientado a não escrever dados de casos reais). Quem repetir o mesmo nome no mesmo código retoma o progresso, então peça apelidos distintos.
- Código de 8 caracteres aleatórios (~10¹² combinações), limite de tentativas por IP, limite geral de requisições, validação de origem e `Content-Type`, cabeçalhos CSP/`nosniff`/`X-Frame-Options`, `noindex`.
- Senha do admin comparada em tempo constante; o CSV neutraliza fórmulas de planilha.
- Dados em `DATA_DIR/db.json` (permissão 600). **Faça backup** dessa pasta. Lembre-se da LGPD: use apelidos, informe a finalidade e apague os dados após a capacitação (botão *Excluir*).

## Desenvolvimento

```bash
npm test      # valida conteúdo, fluxo completo e segurança
```

Estrutura: `server.js` (API + estáticos) · `lib/content.js` (perguntas) · `lib/game.js` (pontuação, níveis, insígnias) · `lib/store.js` (persistência) · `public/` (interface do jogador e do admin).
