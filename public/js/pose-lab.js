(function(){
  'use strict';
  const game = window.__game;
  const root = document.querySelector('#pose-lab');
  if(!game || !root) return;
  const NOTES = {
    step: '상체가 진행 방향을 봐요.',
    push: '상체가 진행 방향을 봐요. 밀 때 앉았다가 발을 올리며 펴요.',
    shuv: '팝할 때 무릎을 굽혔다 펴요. 착지 후 다운: 무릎을 굽혔다 펴요.',
    bigspin: '팝할 때 무릎을 굽혔다 펴요. 착지 후 다운: 무릎을 굽혔다 펴요.',
    biggerspin: '팝할 때 무릎을 굽혔다 펴요. 착지 후 다운: 무릎을 굽혔다 펴요.',
    nocomply: '테일에서 뒷발로 보드를 차고 앞발로 바닥을 한 번 밟아요. 두 발이 함께 올라가 몸과 보드가 180° 돌고 가운데 뒤에 착지한 뒤 다운해요.',
    ncbig: '노즈를 축으로 약 150° 피벗한 뒤 앞발을 몸 앞쪽 바닥에 짚고 뒷무릎을 살짝 접어요. 보드가 총 360° 돌며 몸 앞으로 돌아오면 몸 방향을 유지하며 점프해 착지해요.',
    varial: '팝할 때 무릎을 굽혔다 펴요. 착지 후 다운: 무릎을 굽혔다 펴요.',
    ghost: '보드에 착지한 뒤 다운: 무릎을 굽혔다 펴요.',
    ghostflip: '킥플립 착지 후 다운: 무릎을 굽혔다 펴요.',
    pirouette: '앞발 축으로 다른 다리를 들어요. 다운 뒤 업과 함께 돌고, 팔은 어깨 아래로 들어요.',
    pivot: '앞발은 노즈, 뒷발은 가운데. 돌기 전에 앉았다가 업과 함께 돌아요.'
  };
  const groups = [];
  game.poses.forEach(p => {
    let g = groups.find(x => x.name === p.group);
    if(!g){ g = {name:p.group, items:[]}; groups.push(g); }
    g.items.push(p);
  });
  const tip = document.createElement('p');
  tip.className = 'pose-tip';
  tip.hidden = true;
  document.body.appendChild(tip);
  let tipBtn = null;
  function placeTip(){
    if(!tipBtn) return;
    tip.hidden = false;
    const r = tipBtn.getBoundingClientRect();
    const left = Math.max(8, Math.min(r.left, window.innerWidth - tip.offsetWidth - 8));
    let top = r.bottom + 6;
    if(top + tip.offsetHeight > window.innerHeight - 8) top = Math.max(8, r.top - tip.offsetHeight - 6);
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
  }
  window.addEventListener('resize', placeTip);
  window.addEventListener('scroll', placeTip, true);
  const buttons = [];
  groups.forEach(g => {
    const block = document.createElement('section');
    block.className = 'pose-block';
    const h = document.createElement('h2');
    h.textContent = g.name;
    const grid = document.createElement('div');
    grid.className = 'pose-grid';
    g.items.forEach(p => {
      const b = document.createElement('button');
      b.type = 'button';
      b.append(document.createTextNode(p.label), Object.assign(document.createElement('span'), {className:'en', textContent:p.en}));
      if(NOTES[p.id]){
        const dot = document.createElement('i');
        dot.className = 'pose-dot';
        dot.setAttribute('aria-hidden', 'true');
        b.appendChild(dot);
      }
      b.addEventListener('click', () => select(p.id));
      buttons.push({id:p.id, b});
      grid.appendChild(b);
    });
    block.append(h, grid);
    root.appendChild(block);
  });
  function select(id){
    game.playPose(id);
    buttons.forEach(x => x.b.setAttribute('aria-pressed', String(x.id === id)));
    const note = NOTES[id];
    const btn = buttons.find(x => x.id === id);
    if(note && btn){
      tip.textContent = note;
      tipBtn = btn.b;
      placeTip();
    } else {
      tip.hidden = true;
      tipBtn = null;
    }
  }
  select('tail');
})();
