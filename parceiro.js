(function () {
  const authSection = document.getElementById('authSection');
  const painelSection = document.getElementById('painelSection');
  const recompensasSection = document.getElementById('recompensasSection');
  const validarSection = document.getElementById('validarSection');
  const sairBtn = document.getElementById('empresaSairBtn');

  const tabLoginBtn = document.getElementById('tabLoginBtn');
  const tabCadastroBtn = document.getElementById('tabCadastroBtn');
  const loginForm = document.getElementById('empresaLoginForm');
  const cadastroForm = document.getElementById('empresaCadastroForm');
  const loginMsg = document.getElementById('empresaLoginMsg');
  const cadastroMsg = document.getElementById('empresaCadastroMsg');

  const empresaNomeTitulo = document.getElementById('empresaNomeTitulo');
  const recompensasList = document.getElementById('empresaRecompensasList');
  const novaRecompensaForm = document.getElementById('novaRecompensaForm');
  const novaRecompensaMsg = document.getElementById('novaRecompensaMsg');

  const validarForm = document.getElementById('validarForm');
  const codigoInput = document.getElementById('codigoInput');
  const resultadoBox = document.getElementById('resultadoBox');

  // ---------- mascara de CNPJ (00.000.000/0000-00) ----------
  function applyCnpjMask(input) {
    if (!input) return;
    input.addEventListener('input', () => {
      let digits = input.value.replace(/\D/g, '').slice(0, 14);
      let formatted = digits;
      if (digits.length > 12) {
        formatted = `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
      } else if (digits.length > 8) {
        formatted = `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
      } else if (digits.length > 5) {
        formatted = `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
      } else if (digits.length > 2) {
        formatted = `${digits.slice(0, 2)}.${digits.slice(2)}`;
      }
      input.value = formatted;
    });
  }
  applyCnpjMask(document.getElementById('loginCnpj'));
  applyCnpjMask(document.getElementById('cadCnpj'));

  // ---------- tabs (login / cadastro) ----------
  tabLoginBtn.addEventListener('click', () => {
    tabLoginBtn.classList.add('is-active');
    tabCadastroBtn.classList.remove('is-active');
    loginForm.style.display = '';
    cadastroForm.style.display = 'none';
  });
  tabCadastroBtn.addEventListener('click', () => {
    tabCadastroBtn.classList.add('is-active');
    tabLoginBtn.classList.remove('is-active');
    cadastroForm.style.display = '';
    loginForm.style.display = 'none';
  });

  // ---------- login ----------
  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    loginMsg.textContent = '';
    loginMsg.className = 'form-msg';

    try {
      const response = await fetch('/api/empresa/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cnpj: document.getElementById('loginCnpj').value.trim(),
          senha: document.getElementById('loginSenha').value
        })
      });
      const data = await response.json();

      if (!response.ok) {
        loginMsg.textContent = 'CNPJ ou senha inválidos.';
        loginMsg.className = 'form-msg error';
        return;
      }

      entrarComoEmpresa(data.id, data.nome);
    } catch (err) {
      loginMsg.textContent = 'Não foi possível entrar agora. Tente novamente.';
      loginMsg.className = 'form-msg error';
    }
  });

  // ---------- cadastro ----------
  cadastroForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    cadastroMsg.textContent = '';
    cadastroMsg.className = 'form-msg';

    try {
      const response = await fetch('/api/empresa/cadastro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: document.getElementById('cadNome').value.trim(),
          cnpj: document.getElementById('cadCnpj').value.trim(),
          senha: document.getElementById('cadSenha').value
        })
      });
      const data = await response.json();

      if (response.status === 409) {
        cadastroMsg.textContent = 'Já existe uma empresa cadastrada com esse CNPJ.';
        cadastroMsg.className = 'form-msg error';
        return;
      }
      if (response.status === 400 && data.error === 'cnpj deve ter 14 digitos') {
        cadastroMsg.textContent = 'CNPJ inválido — confira se digitou todos os números.';
        cadastroMsg.className = 'form-msg error';
        return;
      }
      if (!response.ok) throw new Error('falha no cadastro');

      entrarComoEmpresa(data.id, data.nome);
    } catch (err) {
      cadastroMsg.textContent = 'Não foi possível cadastrar agora. Tente novamente.';
      cadastroMsg.className = 'form-msg error';
    }
  });

  // ---------- sessão da empresa ----------
  function entrarComoEmpresa(id, nome) {
    localStorage.setItem('ecobikeEmpresaId', id);
    localStorage.setItem('ecobikeEmpresaNome', nome);
    mostrarPainel(id, nome);
  }

  sairBtn.addEventListener('click', () => {
    localStorage.removeItem('ecobikeEmpresaId');
    localStorage.removeItem('ecobikeEmpresaNome');
    location.reload();
  });

  function mostrarPainel(id, nome) {
    authSection.style.display = 'none';
    painelSection.style.display = '';
    recompensasSection.style.display = '';
    validarSection.style.display = '';
    sairBtn.style.display = '';
    empresaNomeTitulo.textContent = nome;
    carregarRecompensas(id);
  }

  async function carregarRecompensas(empresaId) {
    const response = await fetch(`/api/empresa/${empresaId}/recompensas`);
    const recompensas = response.ok ? await response.json() : [];

    if (recompensas.length === 0) {
      recompensasList.innerHTML = '<p class="card-subtitle">Nenhuma recompensa cadastrada ainda.</p>';
      return;
    }

    recompensasList.innerHTML = recompensas.map((r) => `
      <div class="reward-row">
        <div>
          <strong>${r.pontos_necessarios} pts</strong>
          <div class="reward-row-sub">${r.valor_desconto}</div>
        </div>
        <button type="button" class="reward-resgatar-btn" data-id="${r.id}">Remover</button>
      </div>
    `).join('');

    recompensasList.querySelectorAll('.reward-resgatar-btn').forEach((btn) => {
      btn.addEventListener('click', () => removerRecompensa(empresaId, btn.dataset.id));
    });
  }

  async function removerRecompensa(empresaId, recompensaId) {
    await fetch(`/api/empresa/${empresaId}/recompensas/${recompensaId}`, { method: 'DELETE' });
    carregarRecompensas(empresaId);
  }

  novaRecompensaForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const empresaId = localStorage.getItem('ecobikeEmpresaId');
    novaRecompensaMsg.textContent = '';
    novaRecompensaMsg.className = 'form-msg';

    try {
      const response = await fetch(`/api/empresa/${empresaId}/recompensas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pontos_necessarios: Number(document.getElementById('novoPontos').value),
          valor_desconto: document.getElementById('novoDesconto').value.trim()
        })
      });
      if (!response.ok) throw new Error('falha ao adicionar recompensa');

      novaRecompensaForm.reset();
      carregarRecompensas(empresaId);
    } catch (err) {
      novaRecompensaMsg.textContent = 'Não foi possível adicionar agora. Tente novamente.';
      novaRecompensaMsg.className = 'form-msg error';
    }
  });

  // ---------- validar cupom ----------
  validarForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const codigo = codigoInput.value.trim();
    if (!codigo) return;

    resultadoBox.style.display = 'none';

    try {
      const response = await fetch('/api/validar-cupom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codigo, empresaId: localStorage.getItem('ecobikeEmpresaId') })
      });
      const data = await response.json();

      if (response.status === 404) {
        resultadoBox.className = 'resultado-box erro';
        resultadoBox.innerHTML = '<strong>Cupom não encontrado.</strong><br>Confira se o código foi digitado corretamente.';
      } else if (response.status === 403) {
        resultadoBox.className = 'resultado-box erro';
        resultadoBox.innerHTML = '<strong>Esse cupom não é da sua empresa.</strong><br>Confira se o código foi digitado corretamente.';
      } else if (response.status === 409) {
        resultadoBox.className = 'resultado-box erro';
        resultadoBox.innerHTML = `<strong>Esse cupom já foi usado.</strong><br>Cliente: ${data.cliente_nome} · usado em ${data.usado_em}`;
      } else if (!response.ok) {
        resultadoBox.className = 'resultado-box erro';
        resultadoBox.innerHTML = '<strong>Não foi possível validar agora.</strong> Tente novamente.';
      } else {
        resultadoBox.className = 'resultado-box sucesso';
        resultadoBox.innerHTML = `
          <strong>Cupom válido!</strong><br>
          Cliente: ${data.cliente_nome}<br>
          Desconto: ${data.valor_desconto} (${data.empresa})
        `;
        validarForm.reset();
      }
    } catch (err) {
      resultadoBox.className = 'resultado-box erro';
      resultadoBox.innerHTML = '<strong>Não foi possível validar agora.</strong> Verifique sua conexão.';
    }

    resultadoBox.style.display = 'block';
  });

  // ---------- estado inicial ----------
  const empresaId = localStorage.getItem('ecobikeEmpresaId');
  const empresaNome = localStorage.getItem('ecobikeEmpresaNome');
  if (empresaId && empresaNome) {
    mostrarPainel(empresaId, empresaNome);
  }
})();
