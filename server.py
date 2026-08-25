import hashlib
import http.server
import json
import os
import re
import secrets
import sys
import sqlite3
import urllib.parse

PORT = 8642
PONTOS_POR_KM = 5

if len(sys.argv) > 1:
    # the launcher .bat passes the project folder explicitly, since the
    # bundled server.exe lives one level down, inside its own folder
    BASE_DIR = os.path.abspath(sys.argv[1])
elif getattr(sys, 'frozen', False):
    BASE_DIR = os.path.dirname(sys.executable)
else:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))

DB_PATH = os.path.join(BASE_DIR, 'eco_bike.db')

EMPRESAS_PADRAO = [
    # nome, cnpj, senha (so usada na primeira criacao do banco - demo)
    ('McDonald\'s', '11222333000181', 'senha123', 10, 'R$ 5 de desconto'),
    ('KFC', '22333444000162', 'senha123', 15, 'R$ 5 de desconto'),
    ('Burger King', '33444555000143', 'senha123', 20, 'R$ 8 de desconto'),
    ('Subway', '44555666000124', 'senha123', 25, 'R$ 10 de desconto'),
]


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def gerar_salt():
    return secrets.token_hex(8)


def hash_senha(senha, salt):
    return hashlib.sha256((salt + senha).encode('utf-8')).hexdigest()


def init_db():
    conn = get_db()
    conn.execute('''
        CREATE TABLE IF NOT EXISTS usuarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            cpf TEXT NOT NULL,
            nascimento TEXT,
            tempo_uso TEXT,
            km_percorridos REAL NOT NULL DEFAULT 0,
            pontos INTEGER NOT NULL DEFAULT 0,
            criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    conn.execute('''
        CREATE TABLE IF NOT EXISTS empresas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            cnpj TEXT NOT NULL UNIQUE,
            senha_salt TEXT NOT NULL,
            senha_hash TEXT NOT NULL,
            criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    conn.execute('''
        CREATE TABLE IF NOT EXISTS recompensas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            empresa_id INTEGER NOT NULL REFERENCES empresas(id),
            pontos_necessarios INTEGER NOT NULL,
            valor_desconto TEXT NOT NULL,
            criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    conn.execute('''
        CREATE TABLE IF NOT EXISTS resgates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            usuario_id INTEGER NOT NULL,
            recompensa_id INTEGER NOT NULL,
            codigo TEXT NOT NULL UNIQUE,
            pontos_gastos INTEGER NOT NULL,
            usado INTEGER NOT NULL DEFAULT 0,
            criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            usado_em TEXT
        )
    ''')

    if conn.execute('SELECT COUNT(*) AS n FROM empresas').fetchone()['n'] == 0:
        for nome, cnpj, senha, pontos, desconto in EMPRESAS_PADRAO:
            salt = gerar_salt()
            cur = conn.execute(
                'INSERT INTO empresas (nome, cnpj, senha_salt, senha_hash) VALUES (?, ?, ?, ?)',
                (nome, cnpj, salt, hash_senha(senha, salt))
            )
            conn.execute(
                'INSERT INTO recompensas (empresa_id, pontos_necessarios, valor_desconto) VALUES (?, ?, ?)',
                (cur.lastrowid, pontos, desconto)
            )

    conn.commit()
    conn.close()


def gerar_codigo_cupom():
    return '-'.join(secrets.token_hex(2).upper() for _ in range(2))


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BASE_DIR, **kwargs)

    def _send_json(self, status, payload):
        body = json.dumps(payload).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self):
        length = int(self.headers.get('Content-Length', 0))
        raw = self.rfile.read(length)
        return json.loads(raw or b'{}')

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)

        usuario_cupons = re.match(r'^/api/usuario/(\d+)/cupons$', parsed.path)
        if usuario_cupons:
            usuario_id = usuario_cupons.group(1)
            conn = get_db()
            rows = conn.execute('''
                SELECT r.codigo, r.recompensa_id, r.pontos_gastos, r.usado, r.criado_em, r.usado_em,
                       e.nome AS empresa, rc.valor_desconto
                FROM resgates r
                JOIN recompensas rc ON rc.id = r.recompensa_id
                JOIN empresas e ON e.id = rc.empresa_id
                WHERE r.usuario_id = ?
                ORDER BY r.criado_em DESC
            ''', (usuario_id,)).fetchall()
            conn.close()
            self._send_json(200, [dict(r) for r in rows])
            return

        if parsed.path.startswith('/api/usuario/'):
            user_id = parsed.path.rsplit('/', 1)[-1]
            if not user_id.isdigit():
                self._send_json(400, {'error': 'id invalido'})
                return
            conn = get_db()
            row = conn.execute(
                'SELECT id, nome, km_percorridos, pontos FROM usuarios WHERE id = ?',
                (user_id,)
            ).fetchone()
            conn.close()
            if row is None:
                self._send_json(404, {'error': 'usuario nao encontrado'})
                return
            self._send_json(200, dict(row))
            return

        if parsed.path == '/api/recompensas':
            conn = get_db()
            rows = conn.execute('''
                SELECT r.id, e.nome AS empresa, r.pontos_necessarios, r.valor_desconto
                FROM recompensas r
                JOIN empresas e ON e.id = r.empresa_id
                ORDER BY r.pontos_necessarios
            ''').fetchall()
            conn.close()
            self._send_json(200, [dict(r) for r in rows])
            return

        empresa_recompensas = re.match(r'^/api/empresa/(\d+)/recompensas$', parsed.path)
        if empresa_recompensas:
            empresa_id = empresa_recompensas.group(1)
            conn = get_db()
            rows = conn.execute(
                'SELECT id, pontos_necessarios, valor_desconto FROM recompensas WHERE empresa_id = ? ORDER BY pontos_necessarios',
                (empresa_id,)
            ).fetchall()
            conn.close()
            self._send_json(200, [dict(r) for r in rows])
            return

        super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)

        if parsed.path == '/api/cadastro':
            try:
                data = self._read_json()
            except json.JSONDecodeError:
                self._send_json(400, {'error': 'JSON invalido'})
                return

            nome = (data.get('nome') or '').strip()
            cpf = re.sub(r'\D', '', data.get('cpf') or '')
            nascimento = (data.get('nascimento') or '').strip()
            tempo_uso = (data.get('tempoUso') or '').strip()

            if not nome or not cpf:
                self._send_json(400, {'error': 'nome e cpf sao obrigatorios'})
                return

            conn = get_db()

            existente = conn.execute(
                'SELECT id, nome FROM usuarios WHERE cpf = ?', (cpf,)
            ).fetchone()
            if existente is not None:
                conn.close()
                self._send_json(200, {'id': existente['id'], 'nome': existente['nome'], 'existente': True})
                return

            cur = conn.execute(
                'INSERT INTO usuarios (nome, cpf, nascimento, tempo_uso) VALUES (?, ?, ?, ?)',
                (nome, cpf, nascimento, tempo_uso)
            )
            conn.commit()
            user_id = cur.lastrowid
            conn.close()
            self._send_json(201, {'id': user_id, 'nome': nome, 'existente': False})
            return

        if parsed.path == '/api/login':
            try:
                data = self._read_json()
            except json.JSONDecodeError:
                self._send_json(400, {'error': 'JSON invalido'})
                return

            cpf = re.sub(r'\D', '', data.get('cpf') or '')
            if not cpf:
                self._send_json(400, {'error': 'cpf obrigatorio'})
                return

            conn = get_db()
            row = conn.execute('SELECT id, nome FROM usuarios WHERE cpf = ?', (cpf,)).fetchone()
            conn.close()

            if row is None:
                self._send_json(404, {'error': 'cpf nao encontrado'})
                return

            self._send_json(200, {'id': row['id'], 'nome': row['nome']})
            return

        if parsed.path == '/api/pedalada':
            try:
                data = self._read_json()
            except json.JSONDecodeError:
                self._send_json(400, {'error': 'JSON invalido'})
                return

            usuario_id = data.get('usuarioId')
            km = data.get('km')
            try:
                km = float(km)
            except (TypeError, ValueError):
                km = None

            if not usuario_id or km is None or km <= 0:
                self._send_json(400, {'error': 'usuarioId e km (maior que zero) sao obrigatorios'})
                return

            conn = get_db()
            usuario = conn.execute('SELECT id FROM usuarios WHERE id = ?', (usuario_id,)).fetchone()
            if usuario is None:
                conn.close()
                self._send_json(404, {'error': 'usuario nao encontrado'})
                return

            pontos_ganhos = round(km * PONTOS_POR_KM)
            conn.execute(
                'UPDATE usuarios SET km_percorridos = km_percorridos + ?, pontos = pontos + ? WHERE id = ?',
                (km, pontos_ganhos, usuario_id)
            )
            conn.commit()
            row = conn.execute(
                'SELECT km_percorridos, pontos FROM usuarios WHERE id = ?', (usuario_id,)
            ).fetchone()
            conn.close()

            self._send_json(200, {
                'pontosGanhos': pontos_ganhos,
                'km_percorridos': row['km_percorridos'],
                'pontos': row['pontos']
            })
            return

        if parsed.path == '/api/resgatar':
            try:
                data = self._read_json()
            except json.JSONDecodeError:
                self._send_json(400, {'error': 'JSON invalido'})
                return

            usuario_id = data.get('usuarioId')
            recompensa_id = data.get('recompensaId')
            if not usuario_id or not recompensa_id:
                self._send_json(400, {'error': 'usuarioId e recompensaId sao obrigatorios'})
                return

            conn = get_db()
            usuario = conn.execute('SELECT id, pontos FROM usuarios WHERE id = ?', (usuario_id,)).fetchone()
            recompensa = conn.execute('''
                SELECT r.id, e.nome AS empresa, r.pontos_necessarios, r.valor_desconto
                FROM recompensas r
                JOIN empresas e ON e.id = r.empresa_id
                WHERE r.id = ?
            ''', (recompensa_id,)).fetchone()

            if usuario is None or recompensa is None:
                conn.close()
                self._send_json(404, {'error': 'usuario ou recompensa nao encontrado'})
                return

            ja_resgatado = conn.execute(
                'SELECT id FROM resgates WHERE usuario_id = ? AND recompensa_id = ?',
                (usuario_id, recompensa_id)
            ).fetchone()
            if ja_resgatado is not None:
                conn.close()
                self._send_json(400, {'error': 'ja resgatado'})
                return

            if usuario['pontos'] < recompensa['pontos_necessarios']:
                conn.close()
                self._send_json(400, {'error': 'pontos insuficientes'})
                return

            codigo = gerar_codigo_cupom()
            conn.execute(
                'UPDATE usuarios SET pontos = pontos - ? WHERE id = ?',
                (recompensa['pontos_necessarios'], usuario_id)
            )
            conn.execute(
                'INSERT INTO resgates (usuario_id, recompensa_id, codigo, pontos_gastos) VALUES (?, ?, ?, ?)',
                (usuario_id, recompensa_id, codigo, recompensa['pontos_necessarios'])
            )
            conn.commit()
            pontos_restantes = usuario['pontos'] - recompensa['pontos_necessarios']
            conn.close()

            self._send_json(201, {
                'codigo': codigo,
                'empresa': recompensa['empresa'],
                'valor_desconto': recompensa['valor_desconto'],
                'pontos_restantes': pontos_restantes
            })
            return

        if parsed.path == '/api/validar-cupom':
            try:
                data = self._read_json()
            except json.JSONDecodeError:
                self._send_json(400, {'error': 'JSON invalido'})
                return

            codigo = (data.get('codigo') or '').strip().upper()
            empresa_id = data.get('empresaId')
            if not codigo:
                self._send_json(400, {'error': 'codigo obrigatorio'})
                return

            conn = get_db()
            row = conn.execute('''
                SELECT r.id, r.usado, r.usado_em,
                       u.nome AS cliente_nome,
                       e.id AS empresa_id, e.nome AS empresa, rc.valor_desconto
                FROM resgates r
                JOIN usuarios u ON u.id = r.usuario_id
                JOIN recompensas rc ON rc.id = r.recompensa_id
                JOIN empresas e ON e.id = rc.empresa_id
                WHERE r.codigo = ?
            ''', (codigo,)).fetchone()

            if row is None:
                conn.close()
                self._send_json(404, {'error': 'cupom nao encontrado'})
                return

            if empresa_id and str(row['empresa_id']) != str(empresa_id):
                conn.close()
                self._send_json(403, {'error': 'cupom de outra empresa'})
                return

            if row['usado']:
                conn.close()
                self._send_json(409, {
                    'error': 'cupom ja utilizado',
                    'usado_em': row['usado_em'],
                    'cliente_nome': row['cliente_nome']
                })
                return

            conn.execute(
                "UPDATE resgates SET usado = 1, usado_em = CURRENT_TIMESTAMP WHERE codigo = ?",
                (codigo,)
            )
            conn.commit()
            conn.close()

            self._send_json(200, {
                'cliente_nome': row['cliente_nome'],
                'empresa': row['empresa'],
                'valor_desconto': row['valor_desconto']
            })
            return

        if parsed.path == '/api/empresa/cadastro':
            try:
                data = self._read_json()
            except json.JSONDecodeError:
                self._send_json(400, {'error': 'JSON invalido'})
                return

            nome = (data.get('nome') or '').strip()
            cnpj = re.sub(r'\D', '', data.get('cnpj') or '')
            senha = data.get('senha') or ''

            if not nome or not cnpj or not senha:
                self._send_json(400, {'error': 'nome, cnpj e senha sao obrigatorios'})
                return
            if len(cnpj) != 14:
                self._send_json(400, {'error': 'cnpj deve ter 14 digitos'})
                return

            conn = get_db()
            existente = conn.execute('SELECT id FROM empresas WHERE cnpj = ?', (cnpj,)).fetchone()
            if existente is not None:
                conn.close()
                self._send_json(409, {'error': 'ja existe uma empresa com esse cnpj'})
                return

            salt = gerar_salt()
            cur = conn.execute(
                'INSERT INTO empresas (nome, cnpj, senha_salt, senha_hash) VALUES (?, ?, ?, ?)',
                (nome, cnpj, salt, hash_senha(senha, salt))
            )
            conn.commit()
            empresa_id = cur.lastrowid
            conn.close()
            self._send_json(201, {'id': empresa_id, 'nome': nome})
            return

        if parsed.path == '/api/empresa/login':
            try:
                data = self._read_json()
            except json.JSONDecodeError:
                self._send_json(400, {'error': 'JSON invalido'})
                return

            cnpj = re.sub(r'\D', '', data.get('cnpj') or '')
            senha = data.get('senha') or ''

            conn = get_db()
            row = conn.execute(
                'SELECT id, nome, senha_salt, senha_hash FROM empresas WHERE cnpj = ?', (cnpj,)
            ).fetchone()
            conn.close()

            if row is None or hash_senha(senha, row['senha_salt']) != row['senha_hash']:
                self._send_json(401, {'error': 'cnpj ou senha invalidos'})
                return

            self._send_json(200, {'id': row['id'], 'nome': row['nome']})
            return

        empresa_recompensas = re.match(r'^/api/empresa/(\d+)/recompensas$', parsed.path)
        if empresa_recompensas:
            empresa_id = empresa_recompensas.group(1)
            try:
                data = self._read_json()
            except json.JSONDecodeError:
                self._send_json(400, {'error': 'JSON invalido'})
                return

            pontos_necessarios = data.get('pontos_necessarios')
            valor_desconto = (data.get('valor_desconto') or '').strip()
            try:
                pontos_necessarios = int(pontos_necessarios)
            except (TypeError, ValueError):
                pontos_necessarios = None

            if not pontos_necessarios or pontos_necessarios <= 0 or not valor_desconto:
                self._send_json(400, {'error': 'pontos_necessarios (>0) e valor_desconto sao obrigatorios'})
                return

            conn = get_db()
            empresa = conn.execute('SELECT id FROM empresas WHERE id = ?', (empresa_id,)).fetchone()
            if empresa is None:
                conn.close()
                self._send_json(404, {'error': 'empresa nao encontrada'})
                return

            cur = conn.execute(
                'INSERT INTO recompensas (empresa_id, pontos_necessarios, valor_desconto) VALUES (?, ?, ?)',
                (empresa_id, pontos_necessarios, valor_desconto)
            )
            conn.commit()
            recompensa_id = cur.lastrowid
            conn.close()
            self._send_json(201, {'id': recompensa_id, 'pontos_necessarios': pontos_necessarios, 'valor_desconto': valor_desconto})
            return

        self._send_json(404, {'error': 'rota nao encontrada'})

    def do_DELETE(self):
        parsed = urllib.parse.urlparse(self.path)

        match = re.match(r'^/api/empresa/(\d+)/recompensas/(\d+)$', parsed.path)
        if match:
            empresa_id, recompensa_id = match.groups()
            conn = get_db()
            conn.execute(
                'DELETE FROM recompensas WHERE id = ? AND empresa_id = ?',
                (recompensa_id, empresa_id)
            )
            conn.commit()
            conn.close()
            self._send_json(200, {'ok': True})
            return

        self._send_json(404, {'error': 'rota nao encontrada'})


if __name__ == '__main__':
    try:
        init_db()
        with http.server.ThreadingHTTPServer(('', PORT), Handler) as httpd:
            print(f'EcoBike server rodando em http://localhost:{PORT}')
            print('Deixe esta janela aberta enquanto estiver usando o site.')
            httpd.serve_forever()
    except OSError as err:
        print(f'Nao foi possivel iniciar o servidor na porta {PORT}: {err}')
        print('(Talvez ja exista um servidor EcoBike rodando.)')
        input('Pressione Enter para sair...')
    except KeyboardInterrupt:
        pass
    except Exception:
        import traceback
        print('O servidor parou por causa de um erro inesperado:')
        traceback.print_exc()
        input('Pressione Enter para sair...')
