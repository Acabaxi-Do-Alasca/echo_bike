# EcoBike

Plataforma de aluguel de bicicletas elétricas com sistema de pontos: quanto mais você pedala, mais pontos acumula, e esses pontos viram desconto em lojas parceiras (McDonald's, KFC, Burger King, Subway, ou qualquer empresa que se cadastre). Projeto voltado para incentivar mobilidade urbana sustentável e reduzir a pegada de carbono.

## Como funciona (visão geral)

1. A pessoa se cadastra com nome, CPF, data de nascimento e por quanto tempo vai usar a bike.
2. Ao "pedalar" (simulado no painel), ela ganha pontos com base na distância percorrida.
3. Os pontos podem ser trocados por cupons de desconto em empresas parceiras.
4. Cada cupom tem um código único, que a empresa parceira confere e valida na hora de dar o desconto.
5. Empresas também têm sua própria área: se cadastram com CNPJ, definem suas próprias regras de recompensa (quantos pontos = qual desconto) e validam os cupons dos clientes.

## Telas

| Arquivo | O que é |
|---|---|
| `index.html` | Tela inicial (splash) com a logo — clique leva para o cadastro. |
| `cadastro.html` | Formulário de cadastro do cliente + login por CPF (para quem já é cadastrado) + seções institucionais (Quem Somos, Como Funciona, Qual a Importância). |
| `dashboard.html` | Painel do cliente logado: km percorridos, saldo de pontos, registrar pedalada, recompensas disponíveis para resgate, e histórico de cupons já resgatados. |
| `parceiro.html` | Área da empresa parceira: cadastro/login com CNPJ, gerenciamento das próprias recompensas (adicionar/remover) e validação de cupons de clientes. |

## Regras de negócio

- **Pontos por pedalada**: 5 pontos por km percorrido (configurável em `server.py`, constante `PONTOS_POR_KM`). No painel dá para registrar a distância em metros ou km — metros é convertido automaticamente.
- **1 resgate por recompensa por pessoa**: depois de resgatar o desconto de uma empresa, essa recompensa some da lista de disponíveis para aquele cliente (mas continua valendo para os outros).
- **Cupom só é validado pela própria empresa**: uma empresa não consegue validar/usar o cupom de outra (ex: a KFC não pode validar um cupom gerado para o McDonald's).
- **Um cupom só pode ser validado uma vez**: depois de usado, tentar validar de novo mostra que já foi utilizado (com data/hora e nome do cliente).
- **Login por CPF/CNPJ**: tanto cliente quanto empresa usam CPF/CNPJ como identificador (não é feita validação de dígito verificador real — qualquer sequência de 11 ou 14 números é aceita, propositalmente, já que é um protótipo).
- **Senhas de empresa** são guardadas com hash SHA-256 + salt (nunca em texto puro), mas isso é um nível de segurança adequado para um protótipo de estudo, não para produção.

## Tecnologia

- **Front-end**: HTML, CSS e JavaScript puro. Sem framework, sem build step.
- **Back-end**: Python (só biblioteca padrão — `http.server`, `sqlite3`, `hashlib`, `json`). Nenhuma dependência externa é necessária para rodar com `python server.py`.
- **Banco de dados**: SQLite (`eco_bike.db`), criado automaticamente na primeira vez que o servidor roda.

Fica tudo num processo só: `server.py` serve os arquivos estáticos (HTML/CSS/JS) e responde a API (`/api/...`) na mesma porta (`8642`).

## Como rodar

### Opção 1 — com Python instalado

```bash
python server.py
```

Depois acesse `http://localhost:8642` no navegador.

### Opção 2 — sem Python instalado (Windows)

A pasta `server/` já vem pronta neste repositório com um `server.exe` autossuficiente (gerado com [PyInstaller](https://pyinstaller.org/)) — não precisa de Python instalado na máquina de destino. É só dar duplo clique em `iniciar_ecobike.bat`, que sobe o servidor e abre o navegador automaticamente em `http://localhost:8642`.

Se você alterar `server.py`, precisa regerar a pasta `server/` para as mudanças valerem no `.exe`:

```bash
pip install pyinstaller
pyinstaller --onedir --name server --distpath . server.py
```

## Banco de dados

Criado automaticamente (`eco_bike.db`) com estas tabelas:

- **usuarios** — id, nome, cpf, nascimento, tempo_uso, km_percorridos, pontos, criado_em
- **empresas** — id, nome, cnpj, senha_salt, senha_hash, criado_em
- **recompensas** — id, empresa_id, pontos_necessarios, valor_desconto, criado_em
- **resgates** — id, usuario_id, recompensa_id, codigo, pontos_gastos, usado, criado_em, usado_em

Na primeira execução, 4 empresas de demonstração já vêm cadastradas (para testar a área de parceiro sem precisar criar uma do zero):

| Empresa | CNPJ | Senha |
|---|---|---|
| McDonald's | 11.222.333/0001-81 | senha123 |
| KFC | 22.333.444/0001-62 | senha123 |
| Burger King | 33.444.555/0001-43 | senha123 |
| Subway | 44.555.666/0001-24 | senha123 |

## API

Todas as rotas abaixo respondem em JSON.

| Rota | Método | O que faz |
|---|---|---|
| `/api/cadastro` | POST | Cadastra um cliente novo (ou retorna o existente, se o CPF já estiver cadastrado). |
| `/api/login` | POST | Login do cliente por CPF. |
| `/api/usuario/<id>` | GET | Dados do cliente (nome, km percorridos, pontos). |
| `/api/usuario/<id>/cupons` | GET | Histórico de cupons resgatados pelo cliente. |
| `/api/pedalada` | POST | Registra uma pedalada (km) e soma pontos. |
| `/api/recompensas` | GET | Catálogo público de recompensas de todas as empresas. |
| `/api/resgatar` | POST | Troca pontos por um cupom de desconto. |
| `/api/validar-cupom` | POST | Empresa valida/consome o cupom de um cliente. |
| `/api/empresa/cadastro` | POST | Cadastra uma empresa parceira nova. |
| `/api/empresa/login` | POST | Login da empresa por CNPJ. |
| `/api/empresa/<id>/recompensas` | GET / POST | Lista ou cria recompensas daquela empresa. |
| `/api/empresa/<id>/recompensas/<rid>` | DELETE | Remove uma recompensa daquela empresa. |

## Estrutura do projeto

```
eco_bike/
├── index.html          # Tela inicial (splash)
├── cadastro.html        # Cadastro/login do cliente
├── dashboard.html        # Painel do cliente
├── parceiro.html         # Área da empresa parceira
├── style.css              # Estilos de todo o site
├── script.js               # Lógica do cadastro/login
├── dashboard.js             # Lógica do painel do cliente
├── parceiro.js               # Lógica da área da empresa
├── server.py                  # Backend (servidor + API + banco de dados)
├── iniciar_ecobike.bat         # Atalho: sobe o server.exe e abre o navegador
├── server/                      # server.exe pronto (gerado com PyInstaller, não precisa de Python)
└── assets/
    └── ecobike-logo.png         # Logo
```

## Limitações conhecidas (é um protótipo)

- CPF e CNPJ não passam por validação real de dígito verificador.
- Não existe um sistema de "aluguel" de fato — a distância pedalada é informada manualmente no painel (simulação), não vem de um GPS ou sensor.
- Sem recuperação de senha, e-mail de confirmação, ou qualquer notificação.
- `eco_bike.db` é um arquivo SQLite local — não pensado para múltiplos usuários simultâneos em produção.
