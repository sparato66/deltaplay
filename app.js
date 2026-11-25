(() => {
  const $ = (selector) => document.querySelector(selector);
  const YEARS = ['2026', '2027', '2028', '2029', '2030'];
  const feed = $('#feed');
  const search = $('#search');
  const sort = $('#sort');
  let games = [];
  let activeYear = '2026';
  let shown = 12;

  const escapeHTML = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const platformText = (game) => Object.entries(game.platforms || {}).filter(([, available]) => available).map(([name]) => ({ windows: 'PC', mac: 'Mac', linux: 'Linux' })[name] || name).join(' · ') || 'Платформи уточнюються';
  const gameYear = (game) => String(game.releaseYear || game.sortDate?.slice(0, 4) || '');

  const card = (game, index) => {
    const image = game.poster || game.header || '';
    const style = image ? '' : `style="--card-hue:${(index * 47 + 278) % 360}"`;
    const details = game.description || 'Сторінку гри вже відкрито у Steam. Деталі будуть доповнюватися, щойно їх оголосить студія.';
    const date = game.releaseDate || `${gameYear(game)} · дата уточнюється`;
    return `<article class="game-card" ${style}>
      <a class="game-art" href="game.html?id=${encodeURIComponent(game.id)}" aria-label="Деталі гри ${escapeHTML(game.title)}">
        ${image ? `<img src="${escapeHTML(image)}" alt="Обкладинка гри ${escapeHTML(game.title)}" loading="lazy">` : '<span class="art-fallback">Δ</span>'}
        <span class="art-scrim"></span><span class="status-pill"><i></i> ${escapeHTML(game.priorityLabel || 'МАЙБУТНІЙ РЕЛІЗ')}</span>
        <span class="art-copy"><small>${escapeHTML((game.genres || []).slice(0, 2).join(' · ') || 'ГРА')}</small><strong>${escapeHTML(game.title)}</strong></span>
      </a>
      <div class="game-copy"><div class="release-date"><span>◷</span>${escapeHTML(date)}</div>
        <p>${escapeHTML(details)}</p>
        <div class="card-meta"><span>${escapeHTML(platformText(game))}</span><a href="game.html?id=${encodeURIComponent(game.id)}">ДОСЬЄ <b>↗</b></a></div>
      </div>
    </article>`;
  };

  function groupFor(year) { return games.filter((game) => gameYear(game) === year); }

  function renderTabs() {
    $('#year-tabs').innerHTML = YEARS.map((year) => {
      const count = groupFor(year).length;
      const active = year === activeYear;
      return `<button class="year-tab${active ? ' active' : ''}" type="button" role="tab" aria-selected="${active}" aria-controls="feed" data-year="${year}"><span>${year}</span><small>${count} / 50</small><i></i></button>`;
    }).join('');
    $('#year-tabs').querySelectorAll('[data-year]').forEach((button) => button.addEventListener('click', () => {
      activeYear = button.dataset.year;
      shown = 12;
      render();
      $('#games').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
  }

  function render() {
    const query = search.value.trim().toLocaleLowerCase('uk');
    const yearGames = groupFor(activeYear);
    const list = yearGames.filter((game) => `${game.title} ${game.description || ''} ${(game.developers || []).join(' ')} ${(game.publishers || []).join(' ')} ${(game.genres || []).join(' ')} ${platformText(game)}`.toLocaleLowerCase('uk').includes(query));
    if (sort.value === 'name') list.sort((a, b) => a.title.localeCompare(b.title, 'uk'));
    else if (sort.value === 'date') list.sort((a, b) => a.sortDate.localeCompare(b.sortDate) || a.title.localeCompare(b.title, 'uk'));
    else list.sort((a, b) => (b.priority || 0) - (a.priority || 0) || a.title.localeCompare(b.title, 'uk'));
    $('#year-title').textContent = activeYear;
    $('#year-count').textContent = `${yearGames.length} / 50`;
    $('#year-summary').textContent = yearGames.length === 50 ? '50 ігор — від великих серій до нових відкриттів' : `${yearGames.length} із 50 ігор завантажено`;
    $('#visible-count').textContent = `Показано ${Math.min(shown, list.length)} з ${list.length}`;
    $('#empty').hidden = list.length !== 0;
    $('#error').hidden = games.length !== 0;
    $('#load-more').hidden = list.length <= shown;
    feed.innerHTML = list.slice(0, shown).map(card).join('');
    renderTabs();
  }

  function renderHero() {
    const featured = games.filter((game) => gameYear(game) === '2026').sort((a, b) => (b.priority || 0) - (a.priority || 0))[0] || games[0];
    if (!featured) return;
    const art = $('#hero-art');
    const image = featured.hero || featured.header || featured.poster || '';
    art.src = image;
    if (image) art.parentElement.style.setProperty('--featured-art', `url("${image.replace(/["\\]/g, '')}")`);
    art.alt = `Обкладинка гри ${featured.title}`;
    $('#hero-release').textContent = `${featured.title} · ${featured.releaseDate || 'ДАТУ УТОЧНЮЮТЬ'}`;
    $('#hero-game-link').href = `game.html?id=${encodeURIComponent(featured.id)}`;
    $('#hero-game-link').textContent = `Досьє гри ↗`;
  }

  search.addEventListener('input', () => { shown = 12; render(); });
  sort.addEventListener('change', render);
  $('#load-more').addEventListener('click', () => { shown += 12; render(); });
  fetch('games.json', { cache: 'no-store' }).then((response) => {
    if (!response.ok) throw new Error('Не вдалося отримати каталог');
    return response.json();
  }).then((data) => {
    games = (data.games || []).filter((game) => game.comingSoon === true && YEARS.includes(gameYear(game)));
    $('#update-note').textContent = data.updatedAt ? `ЗВІРЕНО ${new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(data.updatedAt))}` : 'ДАНІ ОНОВЛЮЮТЬСЯ АВТОМАТИЧНО';
    renderHero();
    render();
  }).catch(() => {
    $('#update-note').textContent = 'НЕ ВДАЛОСЯ ОНОВИТИ ДАНІ';
    $('#error').hidden = false;
    feed.innerHTML = '';
    renderTabs();
  });
})();
