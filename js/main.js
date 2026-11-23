// =========================================================
// ARRANQUE: login, pestañas y sesión
// =========================================================
(function () {
  const $ = id => document.getElementById(id);
  const { Auth, DEMO } = window.FBB;
  let started = false;

  function showApp(email) {
    $('loginScreen').classList.add('d-none');
    $('appRoot').classList.remove('d-none');
    $('userEmail').textContent = DEMO ? 'demo' : email;
    if (DEMO) $('demoBadge').classList.remove('d-none');
    if (!started) {
      started = true;
      startApp().catch(() => {});
      restoreTab();
    }
  }

  async function login() {
    $('loginError').textContent = '';
    $('loginBtn').disabled = true;
    try {
      const email = DEMO ? 'demo' : await Auth.signIn();
      showApp(email);
    } catch (e) {
      $('loginError').textContent = e.message;
    } finally { $('loginBtn').disabled = false; }
  }

  function restoreTab() {
    let t = null; try { t = localStorage.getItem('fbb_tab'); } catch (e) {}
    const btn = t && document.querySelector(`[data-bs-target="${t}"]`);
    if (btn) bootstrap.Tab.getOrCreateInstance(btn).show();
  }

  document.querySelectorAll('.app-tabs [data-bs-toggle="tab"]').forEach(btn => btn.addEventListener('shown.bs.tab', e => {
    const target = e.target.dataset.bsTarget;
    try { localStorage.setItem('fbb_tab', target); } catch (err) {}
    // Los gráficos dibujados en pestañas ocultas necesitan recalcular su tamaño.
    if (target === '#tab-dashboard' && typeof branchBarChart !== 'undefined' && branchBarChart) branchBarChart.resize();
    if (target === '#tab-daily') DailyReport.resizeChart();
  }));

  $('loginBtn').addEventListener('click', login);
  $('logoutBtn').addEventListener('click', () => { Auth.signOut(); location.reload(); });
  $('reloadBtn').addEventListener('click', () => location.reload());
  $('reconnectBtn').addEventListener('click', async () => {
    try { await Auth.signIn(); $('authBanner').classList.add('d-none'); }
    catch (e) { alert(e.message); }
  });
  window.addEventListener('fbb-auth-expired', () => $('authBanner').classList.remove('d-none'));

  if (DEMO) {
    $('demoNote').classList.remove('d-none');
    $('loginBtn').textContent = 'Entrar al modo demo';
  } else if (Auth.restore()) {
    showApp(Auth.email);   // sesión de menos de 1 hora: entra directo al recargar
  }
})();
