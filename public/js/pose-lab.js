(function(){
  'use strict';
  const game = window.__game;
  const root = document.querySelector('#pose-lab');
  if(!game || !root) return;
  const NOTES = {
    pan: "레귤러 기준 왼발을 오른발 앞꿈치의 보드 오른편에 모은 뒤, 오른발을 반시계 방향으로 보드 왼편에 옮겨요. 오른발을 축으로 왼발을 시계 방향으로 돌려 시작 위치에 놓고 상체를 오른쪽 45°로 틀어요. 마지막으로 상체를 오른쪽 90°로 돌리며 오른발도 시작 위치로 돌려놓아요. 구피는 대칭이에요.",
    step360: "레귤러 기준, 180 스텝 후 오른발은 고정하고 왼발을 그 앞꿈치의 보드 왼편에 수직으로 모아요. 상체는 역방향을 보고, 오른발을 시계 방향으로 돌려 가운데 뒤로 돌아와요. 구피는 대칭이에요.",
    step180: "레귤러 기준 왼발을 오른발 앞꿈치의 보드 오른편에 수직으로 모으며 진행 방향을 봐요. 오른발을 반시계로 돌려 노즈 쪽에 놓으며 몸도 회전해요. 구피는 대칭이에요.",
    step: '테일 → 노즈 → 테일을 연속 왕복해요. 레귤러는 왼쪽, 구피는 오른쪽으로 발이 지나가요.',
    push: '상체가 진행 방향을 봐요. 밀 때 앉았다가 발을 올리며 펴요.',
    frontpop: '팝샤빗과 같은 테일 팝과 점프예요. 몸과 발 방향은 유지하고 보드만 팝샤빗과 반대로 1스핀(180°) 돌린 뒤 다운 착지해요.',
    hardflip: '프론팝과 같은 테일 팝으로 점프해요. 보드가 발밑에서 프론팝 방향 1스핀(180°)과 힐플립 방향 1플립(360°)을 동시에 하고, 몸 회전 없이 다운 착지해요.',
    varialkickflip: '팝샤빗과 같은 테일 팝으로 점프해요. 보드가 발밑에서 1스핀(180°)과 킥플립 방향 1플립(360°)을 동시에 하고, 몸 회전 없이 다운 착지해요.',
    popshuv: '테일에서 뒷발로 팝을 차며 점프해요. 몸과 발 방향은 그대로 유지하고 보드만 1스핀(180°) 돌린 뒤 무릎을 굽혀 다운 착지해요.',
    shuv: '팝할 때 무릎을 굽혔다 펴요. 착지 후 다운: 무릎을 굽혔다 펴요.',
    kickflip: '테일에서 뒷발로 팝해 보드를 띄워요. 앞발을 몸의 등쪽으로 차서 보드를 한 바퀴 플립시키고 원래 자세로 착지해요.',
    heelflip: '테일에서 뒷발로 팝해 보드를 띄워요. 앞발을 몸 앞쪽으로 차서 킥플립과 반대 방향으로 한 바퀴 플립시키고 원래 자세로 착지해요.',
    bigspin: '팝할 때 무릎을 굽혔다 펴요. 착지 후 다운: 무릎을 굽혔다 펴요.',
    biggerspin: '팝할 때 무릎을 굽혔다 펴요. 착지 후 다운: 무릎을 굽혔다 펴요.',
    nocomply: '테일에서 뒷발로 보드를 차고 앞발로 바닥을 한 번 밟아요. 두 발이 함께 올라가 몸과 보드가 180° 돌고 가운데 뒤에 착지한 뒤 다운해요.',
    ncbig: '노즈를 축으로 약 150° 피벗한 뒤 앞발을 몸 앞쪽 바닥에 짚고 뒷무릎을 살짝 접어요. 보드가 총 360° 돌아오기 0.2초 전에 점프하고, 몸은 나머지 30°를 돌아 총 180° 방향으로 착지해요.',
    varial: '보드는 그대로 두고 점프해 상체와 골반, 두 발이 함께 한 바퀴 돌아요. 원래 발 위치로 착지한 뒤 무릎을 굽혀요.',
    ghost: '보드에 착지한 뒤 다운: 무릎을 굽혔다 펴요.',
    ghostflip: '킥플립 착지 후 다운: 무릎을 굽혔다 펴요.',
    pirouette: '시작 전에 앞발이 짧게 들려 진행 방향을 봐요. 그다음 앞발 축으로 다른 다리를 들어요. 다운 뒤 업과 함께 돌고, 마지막에 무릎을 굽혀 다운했다가 펴요.',
    pivot: '앞발은 노즈, 뒷발은 가운데. 앉았다가 업과 함께 돌고, 마지막에 다운했다가 펴요.'
  };
  let facing = 0;
  let selectedId = 'tail';
  const stanceButtons = [...document.querySelectorAll('[data-stance]')];
  stanceButtons.forEach(button => button.addEventListener('click', () => {
    facing = Number(button.dataset.stance);
    stanceButtons.forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.stance) === facing)));
    select(selectedId);
  }));
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
    selectedId = id;
    game.playPose(id, facing);
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
