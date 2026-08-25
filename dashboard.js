(function () {
  const card = document.getElementById('dashboardCard');
  const pedaladaWrap = document.getElementById('pedaladaWrap');
  const recompensasWrap = document.getElementById('recompensasWrap');
  const recompensasList = document.getElementById('recompensasList');
  const resgateMsg = document.getElementById('resgateMsg');
  const pedaladaMsg = document.getElementById('pedaladaMsg');
  const cuponsWrap = document.getElementById('cuponsWrap');
  const cuponsList = document.getElementById('cuponsList');

  const voucherModal = document.getElementById('voucherModal');
  const voucherMsg = document.getElementById('voucherMsg');
  const voucherCode = document.getElementById('voucherCode');
  const voucherCloseBtn = document.getElementById('voucherCloseBtn');

  const userId = localStorage.getItem('ecobikeUserId');
  let usuarioAtual = null;
  let cuponsAtuais = [];

  voucherCloseBtn.addEventListener('click', () => voucherModal.classList.remove('open'));
  voucherModal.addEventListener('click', (event) => {
    if (event.target === voucherModal) voucherModal.classList.remove('open');
  });

  function renderStats(usuario) {
    const km = Number(usuario.km_percorridos || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
    const pontos = Number(usuario.pontos || 0);

    card.innerHTML = `
      <h1 class="card-title">Olá, ${usuario.nome}!</h1>
      <p class="card-subtitle">Confira seu progresso na EcoBike.</p>
      <div class="stat-grid">
        <div class="stat-tile">
          <span class="stat-value">${km} km</span>
          <span class="stat-label">Distância percorrida</span>
        </div>
        <div class="stat-tile">
          <span class="stat-value">${pontos} pts</span>
          <span class="stat-label">Saldo de pontos</span>
        </div>
      </div>
    `;
  }

  async function carregarUsuario() {
    const response = await fetch(`/api/usuario/${userId}`);
    if (!response.ok) throw new Error('usuario nao encontrado');
    usuarioAtual = await response.json();
    renderStats(usuarioAtual);
  }

  async function carregarCupons() {
    const response = await fetch(`/api/usuario/${userId}/cupons`);
    cuponsAtuais = response.ok ? await response.json() : [];

    if (cuponsAtuais.length === 0) {
      cuponsWrap.style.display = 'none';
      return;
    }

    cuponsWrap.style.display = '';
    cuponsList.innerHTML = cuponsAtuais.map((c) => `
      <div class="reward-row">
        <div>
          <strong class="voucher-code" style="font-size:1.1rem;">${c.codigo}</strong>
          <div class="reward-row-sub">${c.valor_desconto} no(a) ${c.empresa}</div>
        </div>
        <span class="cupom-status ${c.usado ? 'usado' : 'disponivel'}">
          ${c.usado ? 'Usado' : 'Disponível'}
        </span>
      </div>
    `).join('');
  }

  async function carregarRecompensas() {
    const response = await fetch('/api/recompensas');
    if (!response.ok) throw new Error('falha ao carregar recompensas');
    const recompensas = await response.json();

    const resgatadosIds = new Set(cuponsAtuais.map((c) => c.recompensa_id));
    const disponiveis = recompensas.filter((r) => !resgatadosIds.has(r.id));

    if (disponiveis.length === 0) {
      recompensasList.innerHTML = '<p class="card-subtitle">Você já resgatou todas as recompensas disponíveis.</p>';
      return;
    }

    recompensasList.innerHTML = disponiveis.map((r) => {
      const podeResgatar = usuarioAtual.pontos >= r.pontos_necessarios;
      return `
        <div class="reward-row">
          <div>
            <strong>${r.empresa}</strong>
            <div class="reward-row-sub">${r.valor_desconto} · ${r.pontos_necessarios} pts</div>
          </div>
          <button type="button" class="reward-resgatar-btn" data-id="${r.id}" ${podeResgatar ? '' : 'disabled'}>
            Resgatar
          </button>
        </div>
      `;
    }).join('');

    recompensasList.querySelectorAll('.reward-resgatar-btn').forEach((btn) => {
      btn.addEventListener('click', () => resgatar(btn.dataset.id));
    });
  }

  async function resgatar(recompensaId) {
    resgateMsg.textContent = '';
    resgateMsg.className = 'form-msg';

    try {
      const response = await fetch('/api/resgatar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuarioId: userId, recompensaId })
      });
      const data = await response.json();

      if (!response.ok) {
        const mensagens = {
          'pontos insuficientes': 'Você ainda não tem pontos suficientes para essa recompensa.',
          'ja resgatado': 'Você já resgatou essa recompensa antes.'
        };
        resgateMsg.textContent = mensagens[data.error] || 'Não foi possível resgatar agora. Tente novamente.';
        resgateMsg.className = 'form-msg error';
        await carregarCupons();
        await carregarRecompensas();
        return;
      }

      voucherMsg.textContent = `Cupom de ${data.valor_desconto} no(a) ${data.empresa} resgatado!`;
      voucherCode.textContent = data.codigo;
      voucherModal.classList.add('open');

      usuarioAtual.pontos = data.pontos_restantes;
      renderStats(usuarioAtual);
      await carregarCupons();
      await carregarRecompensas();
    } catch (err) {
      resgateMsg.textContent = 'Não foi possível resgatar agora. Tente novamente.';
      resgateMsg.className = 'form-msg error';
    }
  }

  function setupPedalada() {
    const btn = document.getElementById('registrarPedaladaBtn');
    const distanciaInput = document.getElementById('distanciaInput');
    const unidadeSelect = document.getElementById('unidadeSelect');

    btn.addEventListener('click', async () => {
      pedaladaMsg.textContent = '';
      pedaladaMsg.className = 'form-msg';

      const valor = Number(distanciaInput.value);
      if (!valor || valor <= 0) {
        pedaladaMsg.textContent = 'Informe uma distância válida.';
        pedaladaMsg.className = 'form-msg error';
        return;
      }
      const km = unidadeSelect.value === 'm' ? valor / 1000 : valor;

      try {
        const response = await fetch('/api/pedalada', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ usuarioId: userId, km })
        });
        const data = await response.json();

        if (!response.ok) throw new Error('falha ao registrar pedalada');

        usuarioAtual.km_percorridos = data.km_percorridos;
        usuarioAtual.pontos = data.pontos;
        renderStats(usuarioAtual);
        await carregarRecompensas();

        pedaladaMsg.textContent = `Pedalada registrada! Você ganhou ${data.pontosGanhos} pontos.`;
        pedaladaMsg.className = 'form-msg success';
        distanciaInput.value = '';
      } catch (err) {
        pedaladaMsg.textContent = 'Não foi possível registrar a pedalada agora.';
        pedaladaMsg.className = 'form-msg error';
      }
    });
  }

  if (!userId) {
    card.innerHTML = `
      <h1 class="card-title">Nenhum cadastro encontrado</h1>
      <p class="card-subtitle">Faça seu cadastro para acompanhar sua distância e seus pontos.</p>
      <a class="submit-btn" style="display:block;text-align:center;line-height:48px;text-decoration:none;" href="cadastro.html">Fazer cadastro</a>
    `;
    return;
  }

  carregarUsuario()
    .then(() => {
      pedaladaWrap.style.display = '';
      recompensasWrap.style.display = '';
      setupPedalada();
      return carregarCupons();
    })
    .then(() => carregarRecompensas())
    .catch(() => {
      card.innerHTML = `
        <h1 class="card-title">Não foi possível carregar seu painel</h1>
        <p class="card-subtitle">Verifique sua conexão e tente novamente mais tarde.</p>
      `;
    });
})();
