(() => {
  const $ = (selector) => document.querySelector(selector);
  const feed = $('#feed');
  const search = $('#search');
  const sort = $('#sort');
  let games = [];
  let visible = 24;

  const escapeHTML = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const platforms = (game) => Object.entries(game.platforms || {}).filter(([, available]) => available).map(([name]) => ({ windows: 'PC', mac: 'Mac', linux: 'Linux' })[name] || name).join(' · ') || 'Платформи уточнюються';
  const release = (game) => game.releaseDate || 'Дата виходу уточнюється';
  const card = (game, index) => {
    const image = game.poster || game.header || '';
    const style = image ? '' : `style="--card-hue:${(index * 47 + 278) % 360}"`;
    return `<article class="game-card" ${style}>
      <a class="game-art" href="game.html?id=${encodeURIComponent(game.id)}" aria-label="Деталі гри ${escapeHTML(game.title)}">
        ${image ? `<img src="${escapeHTML(image)}" alt="Обкладинка гри ${escapeHTML(game.title)}" loading="lazy">` : '<span class="art-fallback">Δ</span>'}
        <span class="art-scrim"></span><span class="status-pill"><i></i> МАЙБУТНІЙ РЕЛІЗ</span>
        <span class="art-copy"><small>${escapeHTML((game.genres || []).slice(0, 2).join(' · ') || 'ГРА')}</small><strong>${escapeHTML(game.title)}</strong></span>
      </a>
      <div class="game-copy"><div class="release-date"><span>◷</span>${escapeHTML(release(game))}</div>
        <p>${escapeHTML(game.description || 'Опис гри ще готується.')}</p>
        <div class="card-meta"><span>${escapeHTML(platforms(game))}</span><a href="game.html?id=${encodeURIComponent(game.id)}">ДОСЬЄ <b>↗</b></a></div>
      </div>
    </article>`;
  };

  function render() {
    const query = search.value.trim().toLocaleLowerCase('uk');
    const list = games.filter((game) => `${game.title} ${game.description || ''} ${(game.developers || []).join(' ')} ${(game.publishers || []).join(' ')} ${(game.genres || []).join(' ')} ${platforms(game)}`.toLocaleLowerCase('uk').includes(query));
    if (sort.value === 'name') list.sort((a, b) => a.title.localeCompare(b.title, 'uk'));
    else if (sort.value === 'new') list.sort((a, b) => (b.addedAt || '').localeCompare(a.addedAt || ''));
    else list.sort((a, b) => (a.sortDate || '9999').localeCompare(b.sortDate || '9999') || a.title.localeCompare(b.title, 'uk'));
    $('#game-count').textContent = String(list.length).padStart(2, '0');
    $('#visible-count').textContent = `Показано ${Math.min(visible, list.length)} з ${list.length}`;
    $('#empty').hidden = list.length !== 0;
    $('#error').hidden = games.length !== 0;
    $('#load-more').hidden = list.length <= visible;
    feed.innerHTML = list.slice(0, visible).map(card).join('');
  }

  search.addEventListener('input', () => { visible = 24; render(); });
  sort.addEventListener('change', render);
  $('#load-more').addEventListener('click', () => { visible += 24; render(); });
  fetch('games.json', { cache: 'no-store' }).then((response) => {
    if (!response.ok) throw new Error('Не вдалося отримати каталог');
    return response.json();
  }).then((data) => {
    games = (data.games || []).filter((game) => game.comingSoon === true);
    $('#update-note').textContent = data.updatedAt ? `ЗВІРЕНО ${new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(data.updatedAt))}` : 'ДАНІ ОНОВЛЮЮТЬСЯ АВТОМАТИЧНО';
    $('#catalog-proof').textContent = `${games.length} підтверджених сторінок Steam`;
    render();
  }).catch(() => {
    $('#update-note').textContent = 'НЕ ВДАЛОСЯ ОНОВИТИ ДАНІ';
    $('#error').hidden = false;
    $('#game-count').textContent = '—';
  });
})();
