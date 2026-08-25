// Header points widget - only shown for a logged-in user (localStorage id),
// loads the real balance and progress toward the next reward
(function loadHeaderPoints() {
  const wrap = document.getElementById('pointsPillWrap');
  const fill = document.getElementById('progressFill');
  if (!wrap || !fill) return;

  const userId = localStorage.getItem('ecobikeUserId');
  if (!userId) return;

  Promise.all([
    fetch(`/api/usuario/${userId}`).then((r) => (r.ok ? r.json() : null)),
    fetch('/api/recompensas').then((r) => (r.ok ? r.json() : []))
  ]).then(([usuario, recompensas]) => {
    if (!usuario) return;

    const pontos = Number(usuario.pontos || 0);
    const proxima = recompensas.find((r) => r.pontos_necessarios > pontos);
    const pct = proxima ? Math.min(100, Math.round((pontos / proxima.pontos_necessarios) * 100)) : 100;

    document.getElementById('pointsValue').textContent = pontos;
    document.getElementById('pointsFrac').textContent = proxima ? `${pontos}/${proxima.pontos_necessarios}` : 'Máx.';
    fill.style.width = `${pct}%`;
    if (pct <= 20) fill.classList.add('low');
    else if (pct <= 50) fill.classList.add('mid');

    const list = document.getElementById('rewardsList');
    list.innerHTML = recompensas.map((r) => `
      <li><span class="reward-badge">${r.pontos_necessarios} pts</span> ${r.valor_desconto} no(a) ${r.empresa}</li>
    `).join('');

    wrap.style.display = '';
  }).catch(() => {});
})();

// Points widget toggles the rewards panel
(function setupRewardsToggle() {
  const widget = document.getElementById('pointsWidget');
  const panel = document.getElementById('rewardsPanel');
  if (!widget || !panel) return;

  widget.addEventListener('click', () => {
    const isOpen = panel.classList.toggle('open');
    widget.setAttribute('aria-expanded', String(isOpen));
  });
})();

// CPF input mask (000.000.000-00) - formatting only, no real validation needed
function applyCpfMask(input) {
  if (!input) return;
  input.addEventListener('input', () => {
    let digits = input.value.replace(/\D/g, '').slice(0, 11);
    let formatted = digits;
    if (digits.length > 9) {
      formatted = `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
    } else if (digits.length > 6) {
      formatted = `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
    } else if (digits.length > 3) {
      formatted = `${digits.slice(0, 3)}.${digits.slice(3)}`;
    }
    input.value = formatted;
  });
}
applyCpfMask(document.getElementById('cpf'));
applyCpfMask(document.getElementById('loginCpf'));

// "Já tem cadastro? Logar" - opens a CPF-only login modal
(function setupLogin() {
  const openBtn = document.getElementById('openLoginBtn');
  const modal = document.getElementById('loginModal');
  const cancelBtn = document.getElementById('loginCancelBtn');
  const form = document.getElementById('loginForm');
  const cpfInput = document.getElementById('loginCpf');
  const msg = document.getElementById('loginMsg');
  if (!openBtn || !modal || !form) return;

  const openModal = () => {
    msg.textContent = '';
    msg.className = 'form-msg';
    form.reset();
    modal.classList.add('open');
    cpfInput.focus();
  };
  const closeModal = () => modal.classList.remove('open');

  openBtn.addEventListener('click', openModal);
  cancelBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', (event) => {
    if (event.target === modal) closeModal();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const cpf = cpfInput.value.trim();
    if (!cpf) {
      msg.textContent = 'Informe seu CPF.';
      msg.className = 'form-msg error';
      return;
    }

    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cpf })
      });

      if (response.status === 404) {
        msg.textContent = 'CPF não encontrado. Faça seu cadastro primeiro.';
        msg.className = 'form-msg error';
        return;
      }
      if (!response.ok) throw new Error('Falha ao entrar');

      const data = await response.json();
      localStorage.setItem('ecobikeUserId', data.id);
      window.location.href = 'dashboard.html';
    } catch (err) {
      msg.textContent = 'Não foi possível entrar agora. Tente novamente.';
      msg.className = 'form-msg error';
    }
  });
})();

// Form submit - sends the data to the Python backend (server.py) which saves it in SQLite
(function setupFormSubmit() {
  const form = document.getElementById('cadastroForm');
  const msg = document.getElementById('formMsg');
  const modal = document.getElementById('successModal');
  const modalMsg = document.getElementById('modalMsg');
  const modalCloseBtn = document.getElementById('modalCloseBtn');
  if (!form || !msg || !modal) return;

  modal.addEventListener('click', (event) => {
    if (event.target === modal) modal.classList.remove('open');
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const required = form.querySelectorAll('[required]');
    let allFilled = true;
    required.forEach((field) => {
      if (!field.value.trim()) allFilled = false;
    });

    if (!allFilled) {
      msg.textContent = 'Preencha todos os campos obrigatórios.';
      msg.className = 'form-msg error';
      return;
    }

    msg.textContent = '';
    msg.className = 'form-msg';

    const nome = document.getElementById('nome').value.trim();
    const cpf = document.getElementById('cpf').value.trim();
    const dia = document.getElementById('dia').value.padStart(2, '0');
    const mes = document.getElementById('mes').value.padStart(2, '0');
    const ano = document.getElementById('ano').value;
    const tempoValor = Number(document.getElementById('tempoValorInput').value);
    const tempoUnidade = document.getElementById('tempoUnidadeSelect').value;
    const unidades = {
      minuto: ['minuto', 'minutos'],
      hora: ['hora', 'horas'],
      dia: ['dia', 'dias'],
      semana: ['semana', 'semanas'],
      mes: ['mês', 'meses']
    };
    const [singular, plural] = unidades[tempoUnidade];
    const tempoUso = `${tempoValor} ${tempoValor === 1 ? singular : plural}`;

    try {
      const response = await fetch('/api/cadastro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome, cpf, nascimento: `${ano}-${mes}-${dia}`, tempoUso })
      });

      if (!response.ok) throw new Error('Falha ao salvar cadastro');
      const data = await response.json();

      localStorage.setItem('ecobikeUserId', data.id);
      form.reset();

      if (data.existente) {
        modalMsg.textContent = `Esse CPF já tem cadastro! Bem-vindo(a) de volta, ${data.nome}. Redirecionando para o seu painel...`;
        modal.classList.add('open');
        setTimeout(() => { window.location.href = 'dashboard.html'; }, 1800);
      } else {
        modalMsg.textContent = `Cadastro realizado com sucesso! Bem-vindo(a), ${data.nome}.`;
        modal.classList.add('open');
      }
    } catch (err) {
      msg.textContent = 'Não foi possível salvar seu cadastro agora. Tente novamente.';
      msg.className = 'form-msg error';
    }
  });
})();
