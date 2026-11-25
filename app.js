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
  const platformText = (game) => Object.entries(game.platforms || {}).filter(([, available]) => available).map(([name]) => ({ windows: 'ПК', mac: 'Mac', linux: 'Linux', playstation5: 'PlayStation 5', xboxSeries: 'Xbox Series X|S', nintendoSwitch2: 'Nintendo Switch 2' })[name] || name).join(' · ') || 'Платформи уточнюються';
  const gameYear = (game) => String(game.releaseYear || game.sortDate?.slice(0, 4) || '');
  const topStudios = /CD PROJEKT|ROCKSTAR|NAUGHTY DOG|VALVE|BETHESDA|CAPCOM|SQUARE ENIX|UBISOFT|ELECTRONIC ARTS|NINTENDO|PLAYSTATION STUDIOS|XBOX GAME STUDIOS|FROM SOFTWARE|BANDAI NAMCO|PEARL ABYSS|BLIZZARD|REMEDY|LARIAN|KOEI TECMO|WARNER BROS|2K GAMES/i;
  const marqueeGames = /witcher|grand theft auto|\bgta\b|fable|final fantasy|elder scrolls|resident evil|forza horizon|god of war|ghost of|monster hunter|assassin'?s creed|star wars|marvel|call of duty|tomb raider|halo|gears of war|dragon quest|kingdom hearts|metro [0-9]|crimson desert|cyberpunk|mass effect|doom: the dark ages|warhammer 40,000|attack on titan/i;
  const importance = (game) => Number(game.editorialRank || 0) + (marqueeGames.test(game.title || '') ? 2000000 : 0) + (topStudios.test([...(game.developers || []), ...(game.publishers || [])].join(' ')) ? 1000000 : 0) + Number(game.priority || 0);

  const card = (game, index) => {
    const image = game.poster || game.header || '';
    const style = image ? '' : `style="--card-hue:${(index * 47 + 278) % 360}"`;
    const details = game.description || 'Редакційне досьє про підтверджений великий реліз.';
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
      return `<button class="year-tab${active ? ' active' : ''}" type="button" role="tab" aria-selected="${active}" aria-controls="feed" data-year="${year}"><span>${year}</span><small>${count} ${count === 1 ? 'гра' : 'ігор'}</small><i></i></button>`;
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
    else list.sort((a, b) => importance(b) - importance(a) || a.title.localeCompare(b.title, 'uk'));
    $('#year-title').textContent = activeYear;
    $('#year-count').textContent = `${yearGames.length} ${yearGames.length === 1 ? 'ПРОЄКТ' : 'ПРОЄКТІВ'}`;
    $('#year-summary').textContent = yearGames.length ? 'Великі підтверджені релізи, відсортовані за значущістю' : 'Поки немає підтверджених великих релізів для цього року';
    $('#visible-count').textContent = `Показано ${Math.min(shown, list.length)} з ${list.length}`;
    $('#empty').hidden = list.length !== 0;
    $('#empty').textContent = query ? 'За цим запитом нічого не знайшлося. Спробуйте іншу назву.' : 'Для цього року поки немає підтверджених масштабних релізів. Нові ігри з’являться тут після офіційного анонсу.';
    $('#error').hidden = games.length !== 0;
    $('#load-more').hidden = list.length <= shown;
    feed.innerHTML = list.slice(0, shown).map(card).join('');
    renderTabs();
  }

  function renderSpotlight() {
    const feed = $('#spotlight-feed');
    const projects = games.filter((game) => !YEARS.includes(gameYear(game)) && game.status === 'announced').sort((a, b) => importance(b) - importance(a));
    feed.innerHTML = projects.map((game) => `<article class="spotlight-card"><img src="${escapeHTML(game.poster || game.header || '')}" alt="Офіційне зображення ${escapeHTML(game.title)}" loading="lazy"><div><span class="spotlight-status">АНОНСОВАНО · РІК НЕ ОГОЛОШЕНО</span><h3>${escapeHTML(game.title)}</h3><p>${escapeHTML(game.description || '')}</p><span class="spotlight-studio">${escapeHTML((game.developers || []).join(', '))} · ${escapeHTML(platformText(game))}</span><a href="game.html?id=${encodeURIComponent(game.id)}">Відкрити досьє ↗</a></div></article>`).join('');
    $('#without-date').hidden = projects.length === 0;
  }

  search.addEventListener('input', () => { shown = 12; render(); });
  sort.addEventListener('change', render);
  $('#load-more').addEventListener('click', () => { shown += 12; render(); });
  fetch('games.json', { cache: 'no-store' }).then((response) => {
    if (!response.ok) throw new Error('Не вдалося отримати каталог');
    return response.json();
  }).then((data) => {
    games = (data.games || []).filter((game) => game.comingSoon === true);
    const sourceList = $('#source-list');
    if (sourceList) sourceList.innerHTML = (data.sources || []).map((source) => `<a href="${escapeHTML(source.url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(source.name)} ↗</a>`).join('');
    $('#update-note').textContent = data.updatedAt ? `ЗВІРЕНО ${new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(data.updatedAt))}` : 'РЕДАКЦІЙНА ДОБІРКА';
    renderSpotlight();
    render();
  }).catch(() => {
    $('#update-note').textContent = 'НЕ ВДАЛОСЯ ОНОВИТИ ДАНІ';
    $('#error').hidden = false;
    feed.innerHTML = '';
    renderTabs();
  });
})();
