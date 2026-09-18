(() => {"use strict";const canvas=document.querySelector("#demo-stars");if(!canvas)return;const ctx=canvas.getContext("2d"),reduced=matchMedia("(prefers-reduced-motion: reduce)").matches;let stars=[];function resize(){const r=Math.min(devicePixelRatio||1,1.5);canvas.width=innerWidth*r;canvas.height=innerHeight*r;canvas.style.width=`${innerWidth}px`;canvas.style.height=`${innerHeight}px`;ctx.setTransform(r,0,0,r,0,0);stars=Array.from({length:innerWidth<700?150:320},()=>({x:Math.random()*innerWidth,y:Math.random()*innerHeight,z:Math.random()*1.2+.2,p:Math.random()*6.28}));}function draw(t){ctx.clearRect(0,0,innerWidth,innerHeight);stars.forEach(s=>{const a=.15+(Math.sin(t*.001+s.p)+1)*.16;ctx.beginPath();ctx.arc(s.x,s.y,s.z,0,Math.PI*2);ctx.fillStyle=`rgba(196,222,255,${a})`;ctx.fill();});if(!reduced)requestAnimationFrame(draw);}addEventListener("resize",resize,{passive:true});resize();requestAnimationFrame(draw);})();
/* Course navigation enhancements; no tracking or stored personal data. */
(() => {
  'use strict';
  const route = document.querySelector('.route-list');
  if (route && !document.getElementById('course-search')) {
    const cards = [...route.querySelectorAll('.sector')];
    const panel = document.createElement('div');
    panel.className = 'course-search';
    const label = document.createElement('label');
    label.htmlFor = 'course-search'; label.textContent = '找到你的下一个学习主题';
    const input = document.createElement('input');
    input.id = 'course-search'; input.type = 'search'; input.placeholder = '搜索章节，例如 Transformer、RAG、提示词';
    const clear = document.createElement('button'); clear.type = 'button'; clear.textContent = '清除';
    const status = document.createElement('p'); status.id = 'course-search-status'; status.setAttribute('role', 'status');
    input.setAttribute('aria-describedby', status.id);
    const update = () => {
      const query = input.value.trim().normalize('NFKC').toLocaleLowerCase();
      let count = 0;
      cards.forEach(card => { card.hidden = !card.textContent.normalize('NFKC').toLocaleLowerCase().includes(query); if (!card.hidden) count++; });
      status.textContent = count ? `显示 ${count} / ${cards.length} 个章节` : '没有找到匹配的章节，试试其他关键词，或清除搜索。';
      clear.disabled = !input.value;
    };
    input.addEventListener('input', update);
    clear.addEventListener('click', () => { input.value = ''; update(); input.focus(); });
    panel.append(label, input, clear, status); route.before(panel); update();
  }
  const articles = [...document.querySelectorAll('.knowledge-route .knowledge[id]')];
  if (articles.length && !document.querySelector('.chapter-outline')) {
    const nav = document.createElement('nav'); nav.className = 'chapter-outline'; nav.setAttribute('aria-label', '本章知识点导航');
    const title = document.createElement('strong'); title.textContent = '本章导航'; nav.append(title);
    articles.forEach((article, index) => {
      const heading = article.querySelector('h2'); if (!heading) return;
      const link = document.createElement('a'); link.href = '#' + article.id;
      link.textContent = `${String(index + 1).padStart(2, '0')} · ${heading.textContent}`;
      link.addEventListener('click', () => { const details = article.querySelector('details'); if (details) details.open = true; });
      nav.append(link);
    });
    document.querySelector('.knowledge-route').before(nav);
  }
})();

