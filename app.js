(() => {
 const data=window.DELTAPLAY; const $=(s,r=document)=>r.querySelector(s); const $$=(s,r=document)=>[...r.querySelectorAll(s)];
 const gamesGrid=$('#games-grid'),search=$('#game-search'),genre=$('#genre-filter'),sort=$('#sort-filter'),rail=$('#year-rail'),favFilter=$('#favorites-filter');
 const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const getFavorites=()=>{try{return JSON.parse(localStorage.getItem('deltaplay-favorites')||'[]')}catch{return[]}};
 let favorites=getFavorites(),selectedYear='all',onlyFavorites=false;
 function cover(game){return `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${game.appid}/header.jpg`}
 function gameUrl(game){return `game.html?id=${encodeURIComponent(game.id)}`}
 function renderNews(){ $('#news-grid').innerHTML=data.news.map((n,i)=>`<article class="news-card" data-game="${esc(n.game)}" tabindex="0" role="link" aria-label="${esc(n.title)}"><div class="news-image"><img src="${esc(n.image)}" alt="" loading="lazy" onerror="this.style.display='none'"><span class="news-index">0${i+1} / 03</span></div><div class="news-content"><div class="news-category">${esc(n.category)} <span style="color:#77827e">· ${esc(n.date)}</span></div><h3>${esc(n.title)}</h3><p>${esc(n.text)}</p><div class="news-meta"><span>${esc(n.read)}</span><span>ЧИТАТИ ↗</span></div></div></article>`).join('');
  $$('.news-card').forEach(card=>{const go=()=>{const g=data.games.find(g=>g.id===card.dataset.game);if(g)location.href=gameUrl(g)};card.addEventListener('click',go);card.addEventListener('keydown',e=>{if(e.key==='Enter')go()})})
 }
 function renderGenres(){const values=[...new Set(data.games.map(g=>g.genre))].sort((a,b)=>a.localeCompare(b,'uk'));genre.innerHTML='<option value="all">Усі жанри</option>'+values.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('')}
 function renderYears(){const years=[...new Set(data.games.map(g=>g.year))].sort((a,b)=>a-b);rail.innerHTML='<button class="active" data-year="all">УСІ РОКИ</button>'+years.map(y=>`<button data-year="${y}">${y}</button>`).join('');$$('button',rail).forEach(b=>b.addEventListener('click',()=>{selectedYear=b.dataset.year;$$('button',rail).forEach(x=>x.classList.toggle('active',x===b));renderGames()}))}
 function renderGames(){const q=search.value.trim().toLocaleLowerCase('uk'),g=genre.value;let list=data.games.filter(x=>(selectedYear==='all'||String(x.year)===selectedYear)&&(g==='all'||x.genre===g)&&(!onlyFavorites||favorites.includes(x.id))&&(!q||`${x.title} ${x.studio} ${x.genre} ${x.year} ${x.desc}`.toLocaleLowerCase('uk').includes(q)));const [by,dir]=sort.value.split('-');list.sort((a,b)=>by==='year'?(dir==='asc'?a.year-b.year:b.year-a.year):a.title.localeCompare(b.title,'uk'));
  $('#catalog-count').textContent=list.length;$('#empty-state').hidden=!!list.length;gamesGrid.innerHTML=list.map(x=>`<article class="game-card" data-id="${esc(x.id)}" tabindex="0" role="link" aria-label="Відкрити ${esc(x.title)}"><div class="game-cover" style="--glow:${x.color}"><img src="${cover(x)}" alt="Обкладинка ${esc(x.title)}" loading="lazy" onerror="this.style.display='none'"><span class="game-tag">${esc(x.tag)}</span><button class="favorite-btn ${favorites.includes(x.id)?'active':''}" data-fav="${esc(x.id)}" aria-label="${favorites.includes(x.id)?'Прибрати з':'Додати до'} обраного" title="Мої ігри">${favorites.includes(x.id)?'♥':'♡'}</button></div><div class="game-info"><span class="game-year">${x.year} <span style="color:#4d5c5d">/</span> ${esc(x.studio)}</span><h3>${esc(x.title)}</h3><p>${esc(x.genre)}</p><div class="game-bottom"><span>${esc(x.tag)}</span><b>↗</b></div></div></article>`).join('');
  $$('.game-card').forEach(card=>{card.addEventListener('click',e=>{if(e.target.closest('.favorite-btn'))return;location.href=gameUrl(data.games.find(g=>g.id===card.dataset.id))});card.addEventListener('keydown',e=>{if(e.key==='Enter')location.href=gameUrl(data.games.find(g=>g.id===card.dataset.id))})});$$('[data-fav]',gamesGrid).forEach(btn=>btn.addEventListener('click',e=>{e.stopPropagation();const id=btn.dataset.fav;favorites=favorites.includes(id)?favorites.filter(v=>v!==id):[...favorites,id];localStorage.setItem('deltaplay-favorites',JSON.stringify(favorites));renderGames();toast(favorites.includes(id)?'Додано до «Мої ігри»':'Видалено з «Моїх ігор»')}))
 }
 let toastTimer;function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),2200)}
 renderNews();renderGenres();renderYears();renderGames();search.addEventListener('input',renderGames);genre.addEventListener('change',renderGames);sort.addEventListener('change',renderGames);favFilter.addEventListener('click',()=>{onlyFavorites=!onlyFavorites;favFilter.classList.toggle('active',onlyFavorites);renderGames()});$('#reset-filters').addEventListener('click',()=>{search.value='';genre.value='all';sort.value='year-desc';selectedYear='all';onlyFavorites=false;favFilter.classList.remove('active');$$('button',rail).forEach(b=>b.classList.toggle('active',b.dataset.year==='all'));renderGames()});
 const dialog=$('#search-dialog');$('#search-open').addEventListener('click',()=>{dialog.showModal();$('#dialog-search').value=search.value;$('#dialog-search').focus()});$('#dialog-search').addEventListener('input',e=>{search.value=e.target.value;renderGames()});$('#dialog-search').addEventListener('keydown',e=>{if(e.key==='Enter'){dialog.close();location.hash='catalog'}});$('#menu-toggle').addEventListener('click',()=>$('.main-nav').classList.toggle('open'));$$('.main-nav a').forEach(a=>a.addEventListener('click',()=>$('.main-nav').classList.remove('open')));
 const promptInput=$('#prompt-input'),log=$('#chat-log');$$('.prompt-examples button').forEach(b=>b.addEventListener('click',()=>{promptInput.value=b.dataset.prompt;promptInput.focus()}));
 function makePlan(idea){const s=idea.toLocaleLowerCase('uk');let genreHint=s.includes('жах')||s.includes('горор')?'Горор':s.includes('космос')?'Пригода / наукова фантастика':s.includes('платформ')?'Платформер':'Ігрова пригода';const core=s.includes('музик')?'Рівень змінюється в такт музиці: гравець досліджує, слухає ритм і вчасно взаємодіє зі світом.':s.includes('космос')?'Досліджуй відсік за відсіком, стеж за ресурсами й вирішуй, коли ризикнути заради відповіді.':s.includes('каф')||s.includes('затиш')?'Приймай гостей, готуй напої та покращуй простір, щоб кожен день приносив нову історію.':'Одна зрозуміла дія створює цікаве рішення: спробуй її, побач наслідок і виріши, що робити далі.';return `ПЕРШИЙ ЕСКІЗ
${idea}

ЖАНР
${genreHint}

ЯДРО ГЕЙМПЛЕЮ
${core}

ПРОТОТИП ЗА 3 КРОКИ
1. Зроби одну кімнату або короткий рівень.
2. Додай одну дію гравця і помітний відгук на неї.
3. Дай прототип другові: чи зрозуміло, що робити, без пояснення?

ЩО ПОТРІБНО ВИРІШИТИ
• Що гравець робить найчастіше?
• Що може піти не так — і чому це цікаво?
• Який один момент має запам’ятатись?

ПЕРША ЗАДАЧА
Сформулюй гру одним реченням і намалюй один екран на папері.`}
 $('#prompt-form').addEventListener('submit',e=>{e.preventDefault();const value=promptInput.value.trim();if(!value)return;const row=document.createElement('div');row.className='chat-item';const u=document.createElement('div');u.className='chat-user';u.textContent='ТВОЯ ІДЕЯ';const up=document.createElement('p');up.textContent=value;const a=document.createElement('div');a.className='chat-item';const label=document.createElement('div');label.className='chat-user';label.textContent='DELTA COPILOT · ЛОКАЛЬНИЙ ЕСКІЗ';const reply=document.createElement('p');reply.textContent=makePlan(value);row.append(u,up);a.append(label,reply);log.append(row,a);promptInput.value='';log.scrollTop=log.scrollHeight});
})();
