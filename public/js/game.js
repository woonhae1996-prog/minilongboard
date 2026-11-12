// js: 프레임 루프, 판정, 3D 화면, 조작 UI.
import {
    footPositions,
    standingPositions,
    crossStepPositions,
} from "./pose/foot-positions.js?v=20261112-no-hang-poses";
import { createPose3 } from "./pose/pose3.js?v=20261112-dancing-score-update";

(function () {
    "use strict";
    const $ = (s) => document.querySelector(s);
    const posePage = document.documentElement.dataset.page === "pose";
    const rideTestPage = document.documentElement.dataset.page === "ride-test";
    const rideTestSpeed = 0.5;
    // 자세 미리보기에서 다듬은 자세(무릎 바깥, 착지 다운, 새 노컴플라이, 스핀 때 발 회전)를 게임에서도 쓴다.
    const NEW_POSES = true;
    const newPoses = posePage || NEW_POSES;
    const cv = $("#cv");

    const reduce = !!(
        window.matchMedia &&
        matchMedia("(prefers-reduced-motion: reduce)").matches
    );

    /* ---------- 게임 상수 (2D와 같은 규칙) ---------- */
    const L = 150,
        TRUCK = 47,
        RIDER_X = 170,
        TAIL = RIDER_X - L / 2;
    const SPEED = 300,
        FRICTION = 0.055,
        SESSION = 30,
        JOINT = 120,
        JOINT_OFF = 231;
    const FEVER_PTS = 1600,
        FEVER_T = 7;
    const POS = standingPositions;
    const KEY = rideTestPage ? "darimit-ride-test.v1" : "darimit-session-3d.v1";
    const fmt = (n) => Math.round(n).toLocaleString("ko-KR");
    const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
    const lerp = (a, b, t) => a + (b - a) * t;
    const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
    const PIVOT_BACK = footPositions.pivot.rear,
        PIVOT_FRONT = footPositions.pivot.front,
        PIVOT_PREP = 0.3,
        PIVOT_AXIS = 1;
    const PIVOT_SHIFT = 2 * (PIVOT_AXIS - 0.5) * L;
    const pivotSpin = (t) =>
        ease(clamp((t - PIVOT_PREP) / (1 - PIVOT_PREP), 0, 1));
    const bump = (t, a, b) =>
        t <= a || t >= b ? 0 : Math.sin((Math.PI * (t - a)) / (b - a));
    // 다운: 착지 후 무릎을 굽혀 충격을 받고 다시 펴는 동작.
    const landingDown = (elapsed, touchdown, amount = 0.16) =>
        Math.sin(Math.PI * clamp((elapsed - touchdown) / 320, 0, 1)) * amount;
    // 트릭이 바닥에 닿는 시점(ms). 노컴플라이 타이밍은 1150ms 기준이라 트릭 길이에 맞춰 줄인다.
    const touchdownOf = (A) =>
        A.type === "nocomply"
            ? A.dur - (80 * A.dur) / 1150
            : A.type === "ghost"
              ? A.dur
              : A.type === "popshuv" || A.type === "frontpop" || A.type === "varialkickflip" || A.type === "hardflip"
                ? A.dur * 0.8
                : A.dur * (A.type === "ncbig" ? 0.81 - 200 / 1500 : 1);
    function hsh(i) {
        const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
        return x - Math.floor(x);
    }

    /* ---------- 트릭 정의 (한국어 + 영어) ---------- */
    const EN = {
        크로스스텝: "Cross-step",
        "노즈 워크": "Nose walk",
        킥플립: "Kickflip",
        힐플립: "Heelflip",
        셔빗: "Shove-it",
        팝샤빗: "Pop shove-it",
        프론팝: "Front pop",
        "베리얼 킥플립": "Varial kickflip",
        "하드 플립": "Hard flip",
        노컴플라이: "No comply",
        고스트라이드: "Ghost ride",
        "고스트라이드 킥플립": "Ghost ride kickflip",
        피터팬: "Peter Pan",
        망고: "Mango",
        피루엣: "Pirouette",
        "바디 배리얼": "Body varial",
        "180 피봇": "180 pivot",
        "180 스텝": "180 step",
        "360 스텝": "360 step",
        "돌 넘기": "Pebble hop",
        빅스핀: "Big spin",
        비거스핀: "Bigger spin",
        "노컴 빅스핀": "No comply big spin",
    };
    const en = (ko) => EN[ko] || ko;
    const GHOST_BASE_PTS = 60;
    const GHOSTFLIP_BASE_PTS = 140;
    const DEX_GROUPS = [
        { id: "trick", label: "트릭", en: "Tricks" },
        { id: "dancing", label: "댄싱", en: "Dancing" },
    ];
    const TRICK_DEX_IDS = new Set([
        "kickflip",
        "heelflip",
        "popshuv",
        "varialkickflip",
        "hardflip",
        "frontpop",
        "nocomply",
        "shuv",
        "bigspin",
        "biggerspin",
        "ncbig",
        "ghostflip",
        "pivot",
        "hop",
    ]);
    const CAT = [
        {
            id: "nose",
            label: "노즈 워크",
            zone: "이동",
            zoneEn: "Move",
            pts: "70",
            how: "크로스스텝으로 테일에서 노즈 끝까지 걸어가기",
            howEn: "Cross-step from the tail all the way to the nose.",
        },
        {
            id: "kickflip",
            label: "킥플립",
            zone: "테일",
            zoneEn: "Tail",
            pts: "350",
            how: "테일을 팝하고 보드를 발끝 쪽으로 한 바퀴 뒤집어 착지해요",
            howEn: "Pop the tail and flip the board once toward your toes before landing.",
        },
        {
            id: "heelflip",
            label: "힐플립",
            zone: "테일",
            zoneEn: "Tail",
            pts: "350",
            how: "테일을 팝하고 보드를 뒤꿈치 쪽으로 한 바퀴 뒤집어 착지해요",
            howEn: "Pop the tail and flip the board once toward your heels before landing.",
        },
        {
            id: "popshuv",
            label: "팝샤빗",
            zone: "테일",
            zoneEn: "Tail",
            pts: "250",
            how: "뒷발로 테일을 팝해 점프하고, 몸은 그대로 보드만 180° 돌린 뒤 다운 착지해요",
            howEn: "Pop the tail, jump without turning your body, and land low after a 180° board spin.",
        },
        {
            id: "varialkickflip",
            label: "베리얼 킥플립",
            zone: "테일",
            zoneEn: "Tail",
            pts: "450",
            how: "팝샤빗의 180° 스핀과 킥플립 방향의 360° 플립을 동시에 넣고 다운 착지해요",
            howEn: "Combine a 180° pop shove-it with one simultaneous kickflip, then land low without turning your body.",
        },
        {
            id: "hardflip",
            label: "하드 플립",
            zone: "테일",
            zoneEn: "Tail",
            pts: "450",
            how: "프론팝의 180° 스핀과 힐플립 방향의 360° 플립을 동시에 넣고 다운 착지해요",
            howEn: "Combine a 180° front pop with one simultaneous heelflip, then land low without turning your body.",
        },
        {
            id: "frontpop",
            label: "프론팝",
            zone: "테일",
            zoneEn: "Tail",
            pts: "250",
            how: "뒷발로 테일을 팝해 점프하고, 몸은 그대로 보드를 팝샤빗과 반대로 180° 돌린 뒤 다운 착지해요",
            howEn: "Pop the tail and spin the board 180° opposite to a pop shove-it, without turning your body.",
        },
        {
            id: "shuv",
            label: "셔빗",
            zone: "노즈",
            zoneEn: "Nose",
            pts: "250",
            how: "뛰는 사이 보드가 발밑에서 180° 돌아요",
            howEn: "Hop while the board spins 180° under your feet.",
        },
        {
            id: "bigspin",
            label: "빅스핀",
            zone: "노즈",
            zoneEn: "Nose",
            pts: "380",
            how: "보드는 360° 셔빗, 몸은 같은 방향으로 180° 돌아요",
            howEn: "The board does a 360 shove-it while your body turns 180° the same way.",
        },
        {
            id: "biggerspin",
            label: "비거스핀",
            zone: "노즈",
            zoneEn: "Nose",
            pts: "520",
            how: "보드는 540° 셔빗, 몸은 180°. 빅스핀보다 반 바퀴 더 돌아요",
            howEn: "A 540 shove-it under a 180° body turn: half a spin more than a big spin.",
        },
        {
            id: "nocomply",
            label: "노컴플라이",
            zone: "테일",
            zoneEn: "Tail",
            pts: "220",
            how: "앞발을 땅에 딛고 뒷발로 테일을 팝, 떠오른 보드에 다시 올라타요",
            howEn: "Plant your front foot, pop the tail with your back foot, and jump back on.",
        },
        {
            id: "ncbig",
            label: "노컴 빅스핀",
            zone: "노즈",
            zoneEn: "Nose",
            pts: "300",
            how: "앞발을 딛고 테일을 팝, 보드는 360° 돌고 몸은 180° 돌며 올라타요",
            howEn: "Plant your front foot and pop the tail; the board spins 360° while you turn 180° back onto it.",
        },
        {
            id: "step360",
            label: "360 스텝",
            zone: "가운데 뒤",
            zoneEn: "Rear middle",
            pts: "170",
            how: "레귤러 기준 180 스텝 뒤 오른발을 고정하고 왼발을 그 앞꿈치의 보드 왼편에 모아요. 오른발을 시계 방향으로 돌려 가운데 뒤에 착지해요",
            howEn: "Continue the 180 step by gathering the left foot to the right toes, then sweeping the right foot clockwise back to rear middle.",
        },
        {
            id: "step180",
            label: "180 스텝",
            zone: "가운데 뒤",
            zoneEn: "Rear middle",
            pts: "80",
            how: "레귤러 기준 왼발을 오른발 앞꿈치의 보드 오른편에 수직으로 모은 뒤, 오른발을 반시계로 돌리며 몸도 180° 돌아요",
            howEn: "Step with each foot in turn to rotate your body 180° while the board stays straight.",
        },
        {
            id: "ghost",
            label: "고스트라이드",
            zone: "가운데 뒤",
            zoneEn: "Rear middle",
            pts: GHOST_BASE_PTS + "+",
            how: "보드에서 내려 옆에서 달리다가 올라타기. 오래 달릴수록 점수가 커져요",
            howEn: "Step off, run beside the board, then hop back on. The longer you run, the more it scores.",
        },
        {
            id: "ghostflip",
            label: "고스트라이드 킥플립",
            zone: "가운데 뒤",
            zoneEn: "Rear middle",
            pts: GHOSTFLIP_BASE_PTS + "+",
            how: "고스트라이드 중 0.8초 넘게 달린 뒤 보드를 킥플립시켜 받아 타기",
            howEn: "During a ghost ride, run for over 0.8s, kickflip the board and land on it.",
        },
        {
            id: "pan",
            label: "피터팬",
            zone: "가운데 앞",
            zoneEn: "Front middle",
            pts: "180",
            how: "왼발을 오른발 앞꿈치의 보드 오른편에 모으고, 오른발을 왼편으로 옮긴 뒤 왼발을 가운데 위에 놓아요",
            howEn: "Gather the left foot at the right toes, sweep the right foot to the opposite side, then place the left foot at upper middle.",
        },
        {
            id: "mango",
            label: "망고",
            zone: "가운데 앞",
            zoneEn: "Front middle",
            pts: "200",
            how: "1·2번은 피터팬과 같아요. 3번은 왼무릎을 15° 굽히고 오른다리를 왼다리 오른쪽 허공에 띄워요. 4번부터 왼무릎을 40°까지 굽히며 상체를 앞으로 기울여요. 오른발은 지면을 따라 바깥쪽 곡선으로 테일 뒤와 왼쪽 바퀴 바깥까지 끌어요. 상체는 오른쪽 45°에서 30°로 돌아요. 6번은 점프하고, 7번은 점프 여파로 몸을 낮추며 오른발을 몸 쪽으로 더 끌어와 주행 방향을 바라봐요.",
            howEn: "Steps 1 and 2 match Peter Pan. Step 3 bends the left knee 15° and lifts the right foot to the left leg's right. From step 4, the left knee bends to 40° as the torso leans forward. The right foot stays grounded and follows an outward curve behind the tail and outside the left wheel. The torso turns from 45° to 30° right. Step 6 jumps; step 7 absorbs the hop with a dip, pulls the right foot closer, and faces the direction of travel.",
        },
        {
            id: "pirouette",
            label: "피루엣",
            zone: "가운데 앞",
            zoneEn: "Front middle",
            pts: "210",
            how: "앞발을 진행 방향으로 돌린 뒤, 보드 위에서 몸을 360° 돌려요",
            howEn: "Turn the front foot toward travel, then spin your body 360° on the board.",
        },
        {
            id: "varial",
            label: "바디 배리얼",
            zone: "가운데 앞",
            zoneEn: "Front middle",
            pts: "200",
            how: "점프해서 몸만 360° 한 바퀴 돌고 보드는 그대로 굴러가요",
            howEn: "Jump and spin your body a full 360° while the board keeps rolling.",
        },
        {
            id: "pivot",
            label: "180 피봇",
            zone: "노즈",
            zoneEn: "Nose",
            pts: "200",
            how: "앞발은 노즈, 뒷발은 가운데에 두고 다리를 벌린 채 노즈를 축으로 보드를 180° 돌려요. 끝나면 테일에 서 있게 돼요",
            howEn: "Front foot on the nose, back foot in the middle. With your legs apart, swing the board 180° around the nose. You end up standing on the tail.",
        },
        {
            id: "hop",
            label: "돌 넘기",
            zone: "보너스",
            zoneEn: "Bonus",
            pts: "100",
            how: "킥플립, 힐플립, 셔빗, 빅스핀, 노컴플라이로 보드가 도는 동안 돌이 지나가면",
            howEn: "Let a pebble pass while the board spins or flips during a kickflip, heelflip, shove-it, bigspin or no comply.",
        },
    ];
    const TRICKS = {
        kickflip: {
            label: "킥플립",
            minV: 0.2,
            dur: 1400,
            pts: 350,
            air: [0.26, 0.8],
            boardSpinOrFlip: true,
            cap: "350",
        },
        heelflip: {
            label: "힐플립",
            minV: 0.2,
            dur: 1400,
            pts: 350,
            air: [0.26, 0.8],
            boardSpinOrFlip: true,
            cap: "350",
        },
        popshuv: {
            label: "팝샤빗",
            minV: 0.2,
            dur: 1250,
            pts: 250,
            air: [0.18, 0.8],
            boardSpinOrFlip: true,
            cap: "250",
        },
        varialkickflip: {
            label: "베리얼 킥플립",
            minV: 0.2,
            dur: 1250,
            pts: 450,
            air: [0.18, 0.8],
            boardSpinOrFlip: true,
            cap: "450",
        },
        hardflip: {
            label: "하드 플립",
            minV: 0.2,
            dur: 1250,
            pts: 450,
            air: [0.18, 0.8],
            boardSpinOrFlip: true,
            cap: "450",
        },
        frontpop: {
            label: "프론팝",
            minV: 0.2,
            dur: 1250,
            pts: 250,
            air: [0.18, 0.8],
            boardSpinOrFlip: true,
            cap: "250",
        },
        shuv: {
            label: "셔빗",
            minV: 0.2,
            dur: 540,
            pts: 250,
            air: [0.1, 0.9],
            boardSpinOrFlip: true,
            cap: "250",
        },
        bigspin: {
            label: "빅스핀",
            minV: 0.25,
            dur: 680,
            pts: 380,
            air: [0.1, 0.9],
            boardSpinOrFlip: true,
            cap: "380",
            body180: true,
        },
        biggerspin: {
            label: "비거스핀",
            minV: 0.3,
            dur: 800,
            pts: 520,
            air: [0.1, 0.9],
            boardSpinOrFlip: true,
            cap: "520",
            body180: true,
        },
        nocomply: {
            label: "노컴플라이",
            minV: 0.2,
            dur: 660,
            pts: 220,
            air: [0.3, 0.8],
            boardSpinOrFlip: true,
            cap: "220",
        },
        ncbig: {
            label: "노컴 빅스핀",
            minV: 0.25,
            dur: 760,
            pts: 300,
            air: [0.3, 0.85],
            boardSpinOrFlip: true,
            cap: "300",
            body180: true,
        },
        step360: {
            label: "360 스텝",
            minV: 0.2,
            dur: 1200,
            pts: 170,
            cap: "170",
        },
        step180: {
            label: "180 스텝",
            minV: 0.2,
            dur: 580,
            pts: 80,
            cap: "80",
            body180: true,
        },
        ghost: { label: "고스트라이드", minV: 0.3, cap: GHOST_BASE_PTS + "+" },
        pan: { label: "피터팬", minV: 0.2, dur: 1200, pts: 180, cap: "180" },
        mango: { label: "망고", minV: 0.2, dur: 1800, pts: 200, cap: "200" },
        pirouette: {
            label: "피루엣",
            minV: 0.25,
            dur: 920,
            pts: 210,
            cap: "210",
        },
        varial: {
            label: "바디 배리얼",
            minV: 0.25,
            dur: 700,
            pts: 200,
            air: [0.15, 0.85],
            cap: "200",
        },
        pivot: { label: "180 피봇", minV: 0.2, dur: 650, pts: 200, cap: "200" },
    };
    const SLOTS = [
        ["kickflip", "heelflip", "nocomply", "popshuv", "frontpop", "varialkickflip", "hardflip"],
        [null, null, "ghost", "step180", "step360"],
        ["pan", "pirouette", "varial", "mango"],
        ["pivot", "shuv", "ncbig", "bigspin", "biggerspin"],
    ];
    // 한 칸에 트릭이 3개보다 많으면 그중 3개만 보여 주고, 트릭이 끝나면 다시 뽑는다.
    let offer = [];
    let offerPos = -1;
    function rollOffer() {
        const ids = SLOTS[G.pos].filter(Boolean);
        offerPos = G.pos;
        if (ids.length <= 3) {
            offer = ids.slice();
            return;
        }
        const bag = ids.slice();
        for (let i = bag.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const swap = bag[i];
            bag[i] = bag[j];
            bag[j] = swap;
        }
        const picked = new Set(bag.slice(0, 3));
        offer = ids.filter((id) => picked.has(id));
    }
    function syncOffer() {
        if (offerPos !== G.pos) rollOffer();
    }

    /* ---------- 기록 ---------- */
    const best = { score: 0, combo: 0, landed: {} };
    let muted = false,
        camMode = "chase",
        spot = "bridge";
    try {
        const o = JSON.parse(localStorage.getItem(KEY) || "null");
        if (o && typeof o === "object") {
            best.score = Number(o.score) || 0;
            best.combo = Number(o.combo) || 0;
            muted = o.muted === true;
            if (o.cam === "side" || o.cam === "chase") camMode = o.cam;
            if (o.spot === "bridge" || o.spot === "sea" || o.spot === "city")
                spot = o.spot;
            if (o.landed && typeof o.landed === "object")
                for (const c of CAT)
                    if (o.landed[c.id] === true) best.landed[c.id] = true;
        }
    } catch (e) {}
    function store() {
        try {
            localStorage.setItem(
                KEY,
                JSON.stringify({
                    score: best.score,
                    combo: best.combo,
                    muted,
                    cam: camMode,
                    spot,
                    landed: best.landed,
                }),
            );
        } catch (e) {}
    }
    const landedCount = () => CAT.filter((c) => best.landed[c.id]).length;
    function renderBests() {
        $("#best").textContent = fmt(best.score);
        $("#best-combo").textContent = fmt(best.combo);
        $("#dex-top").textContent = landedCount() + "/" + CAT.length;
    }
    function el(tag, cls, text) {
        const e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text != null) e.textContent = text;
        return e;
    }
    function renderDex() {
        const ul = $("#dex");
        ul.textContent = "";
        for (const group of DEX_GROUPS) {
            const heading = el("li", "dex-section");
            heading.append(
                el("b", "", group.label),
                el("span", "en", group.en),
            );
            ul.appendChild(heading);
            for (const c of CAT) {
                const category = TRICK_DEX_IDS.has(c.id) ? "trick" : "dancing";
                if (category !== group.id) continue;
                const done = !!best.landed[c.id];
                const li = el("li", done ? "done" : "");
                const top = el("div", "dex-top");
                const chk = el("span", "dex-check", done ? "✓" : "");
                chk.setAttribute(
                    "aria-label",
                    done ? "랜딩함 landed" : "아직 not yet",
                );
                top.append(
                    chk,
                    el("b", "", c.label),
                    el("span", "zone", c.zone),
                    el("span", "dex-pts", c.pts),
                );
                li.append(
                    top,
                    el("span", "dex-en", en(c.label) + " · " + c.zoneEn),
                    el("p", "", c.how),
                    el("p", "en", c.howEn),
                );
                ul.appendChild(li);
            }
        }
        $("#dex-count").textContent =
            "랜딩 Landed " + landedCount() + " / " + CAT.length;
    }

    /* ---------- 상태 ---------- */
    const startPosition = 2; // 가운데 앞: 대기·시작·결과 화면의 기본 위치
    const startSpeed = 0;
    const pushDuration = 560;
    const startFeet = [...POS[startPosition]];
    const freshCombo = () => ({ pts: 0, n: 0, names: [], counts: {} });
    function newState(mode) {
        return {
            mode,
            t: rideTestPage ? 0 : SESSION,
            v: rideTestPage
                ? rideTestSpeed
                : mode === "title"
                  ? 0.32
                  : startSpeed,
            pushStreak: 0,
            pushChainTimer: 0,
            worldX: 0,
            worldZ: 0,
            score: 0,
            pos: startPosition,
            startFeet: [...startFeet],
            panFootYawA: null,
            panFootYawB: null,
            awaitingFirstPush: mode === "play",
            act: null,
            queue: null,
            combo: freshCombo(),
            idle: 0,
            pebbles: [],
            nextPeb: 1100,
            bestRun: 0,
            tricks: 0,
            shake: 0,
            facing: 0,
            jointIdx: Math.floor(JOINT_OFF / JOINT),
            newLanded: [],
            landedSet: [],
            fever: 0,
            gauge: 0,
            fevers: 0,
            landEl: 9999,
        };
    }
    let G = newState("title");
    const fxQ = [];
    const fx = (e) => {
        if (fxQ.length < 24) fxQ.push(e);
    };

    /* ---------- 소리 ---------- */
    let actx = null,
        master = null,
        nbuf = null,
        rollGain = null;
    function ac(force) {
        if (muted && !force) return null;
        if (!actx) {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return null;
            try {
                actx = new AC();
                master = actx.createGain();
                master.gain.value = 0.7;
                master.connect(actx.destination);
                const len = actx.sampleRate;
                nbuf = actx.createBuffer(1, len, actx.sampleRate);
                const ch = nbuf.getChannelData(0);
                for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
                const src = actx.createBufferSource();
                src.buffer = nbuf;
                src.loop = true;
                const lp = actx.createBiquadFilter();
                lp.type = "lowpass";
                lp.frequency.value = 420;
                rollGain = actx.createGain();
                rollGain.gain.value = 0;
                src.connect(lp);
                lp.connect(rollGain);
                rollGain.connect(master);
                src.start();
            } catch (e) {
                actx = null;
                return null;
            }
        }
        if (actx.state === "suspended") {
            try {
                actx.resume();
            } catch (e) {}
        }
        return actx;
    }
    function burst(freq, type, q, peak, dur, delay) {
        const c = ac();
        if (!c) return;
        const t = c.currentTime + (delay || 0);
        const s = c.createBufferSource();
        s.buffer = nbuf;
        const f = c.createBiquadFilter();
        f.type = type;
        f.frequency.value = freq;
        f.Q.value = q;
        const g = c.createGain();
        g.gain.setValueAtTime(peak, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        s.connect(f);
        f.connect(g);
        g.connect(master);
        s.start(t, Math.random() * 0.5);
        s.stop(t + dur + 0.02);
    }
    function tone(f, peak, dur, delay) {
        const c = ac();
        if (!c) return;
        const t = c.currentTime + (delay || 0);
        const o = c.createOscillator();
        o.type = "sine";
        o.frequency.value = f;
        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(peak, t + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g);
        g.connect(master);
        o.start(t);
        o.stop(t + dur + 0.05);
    }
    const sfx = {
        joint: (d) => burst(1400, "bandpass", 2, 0.14, 0.035, d),
        pop: () => burst(2200, "bandpass", 1.5, 0.25, 0.04),
        push: () => burst(700, "lowpass", 0.7, 0.3, 0.18),
        step: () => burst(260, "lowpass", 0.8, 0.22, 0.06),
        land: () => {
            burst(1800, "bandpass", 1.5, 0.3, 0.05);
            tone(140, 0.25, 0.12);
        },
        bail: () => {
            tone(85, 0.45, 0.35);
            burst(900, "lowpass", 0.6, 0.3, 0.45, 0.05);
        },
        trick: () => {
            tone(880, 0.07, 0.09);
            tone(1320, 0.06, 0.12, 0.06);
        },
        bank: () => {
            tone(660, 0.07, 0.1);
            tone(990, 0.07, 0.12, 0.07);
            tone(1320, 0.06, 0.18, 0.14);
        },
        clunk: () => {
            burst(500, "bandpass", 1, 0.3, 0.08);
            tone(110, 0.2, 0.1);
        },
        fever: () => {
            [523, 659, 784, 1047, 1319, 1568].forEach((f, i) =>
                tone(f, 0.08, 0.18, i * 0.055),
            );
        },
    };
    function unlock() {
        if (!muted) ac();
    }
    document.addEventListener("pointerup", unlock, { passive: true });
    document.addEventListener("keydown", unlock);

    /* ---------- 팝업 ---------- */
    const pops = $("#pops");
    let lastHint = "",
        lastHintAt = 0;
    function popup(ko, enText, kind, detail) {
        while (pops.childElementCount > 3) pops.firstChild.remove();
        const p = el("div", "pop" + (kind ? " " + kind : ""));
        p.append(el("span", "k", ko), el("span", "e", enText || ""));
        if (detail) p.append(el("span", "detail", detail));
        const top = [...pops.children].reduce(
            (max, child) =>
                Math.max(
                    max,
                    Number.parseFloat(child.style.top || "0") + child.offsetHeight,
                ),
            0,
        );
        p.style.top = (top ? top + 6 : 0) + "px";
        pops.appendChild(p);
        const dur = kind === "gold" || kind === "bad" ? 1300 : 950;
        if (p.animate) {
            const kf = reduce
                ? [{ opacity: 1 }, { opacity: 1, offset: 0.7 }, { opacity: 0 }]
                : [
                      {
                          transform: "translate(-50%,8px) scale(.9)",
                          opacity: 0,
                      },
                      {
                          transform: "translate(-50%,0) scale(1)",
                          opacity: 1,
                          offset: 0.15,
                      },
                      { transform: "translate(-50%,-26px)", opacity: 0 },
                  ];
            const a = p.animate(kf, {
                duration: dur,
                easing: "ease-out",
                fill: "forwards",
            });
            a.onfinish = () => p.remove();
        } else setTimeout(() => p.remove(), dur);
    }
    function hint(ko, enText) {
        const now = performance.now();
        if (ko === lastHint && now - lastHintAt < 900) return;
        lastHint = ko;
        lastHintAt = now;
        popup(ko, enText, "hint");
    }

    /* ---------- 트릭 · 콤보 ---------- */
    function addTrick(label, base, o) {
        o = o || {};
        const key = o.key || label;
        const k = o.norep ? 0 : G.combo.counts[key] || 0;
        const fv = G.fever > 0 ? 2 : 1;
        const pts =
            Math.max(1, Math.round(base * Math.max(0.25, 1 - 0.25 * k))) * fv;
        G.combo.counts[key] = (G.combo.counts[key] || 0) + 1;
        G.combo.pts += pts;
        if (o.mult !== false) {
            G.combo.n++;
            G.tricks++;
        }
        G.combo.names.push(label);
        if (o.mult !== false && G.landedSet.indexOf(label) < 0)
            G.landedSet.push(label);
        if (!o.quiet) {
            const speedPts = Math.round((o.speedBoost || 0) * 100);
            const speedDetail =
                speedPts > 0
                    ? "속도 +" + speedPts + "% · Speed +" + speedPts + "%"
                    : "";
            popup(
                label + " +" + pts,
                en(label) + " +" + pts + (fv > 1 ? " · FEVER ×2" : ""),
                fv > 1 ? "fv" : "",
                speedDetail,
            );
            sfx.trick();
        }
        if (o.mult !== false) {
            fx("trick");
            feverFill(pts);
        }
        if (CAT.some((c) => c.id === key) && !best.landed[key]) {
            best.landed[key] = true;
            G.newLanded.push(CAT.find((c) => c.id === key).label);
            store();
            renderDex();
            renderBests();
        }
    }
    function feverFill(pts) {
        if (G.mode !== "play" || G.fever > 0) return;
        G.gauge = Math.min(1, G.gauge + pts / FEVER_PTS);
        if (G.gauge >= 1) {
            G.gauge = 0;
            G.fever = FEVER_T;
            G.fevers++;
            popup("피버 타임! 점수 ×2", "FEVER TIME! Points ×2", "fv");
            sfx.fever();
            fx("fever");
        }
    }
    function bank() {
        if (G.combo.pts <= 0) return;
        const gained = G.combo.pts * Math.max(1, G.combo.n);
        G.score += gained;
        G.bestRun = Math.max(G.bestRun, gained);
        popup("콤보 +" + fmt(gained), "Combo +" + fmt(gained), "gold");
        sfx.bank();
        fx("bank");
        G.combo = freshCombo();
    }
    function bail(ko, enText) {
        popup(ko, enText, "bad");
        G.pushStreak = 0;
        G.pushChainTimer = 0;
        if (G.combo.pts > 0)
            setTimeout(() => popup("콤보 날아감", "Combo lost", "bad"), 180);
        G.combo = freshCombo();
        G.queue = null;
        G.act = { type: "bail", el: 0, dur: 1500 };
        G.v = rideTestPage ? rideTestSpeed : 0;
        G.gauge *= 0.5;
        sfx.bail();
        fx("bail");
    }
    function startAct(type, extra) {
        G.panFootYawA = G.panFootYawB = null;
        if (type !== "push") {
            G.pushStreak = 0;
            G.pushChainTimer = 0;
        }
        G.act = Object.assign({ type, el: 0, prevE: 0 }, extra);
        if (type === "step") G.act.fromFeet = [...(G.startFeet || POS[G.pos])];
    }

    const PUSH_SPEED_BOOST = 0.24;
    const PUSH_CHAIN_BONUS_RATIO = 1 / 6;
    const PUSH_CHAIN_BONUS_CAP_RATIO = 0.5;
    const PUSH_CHAIN_WINDOW = 2.5;
    function applySpeedBoost(multiplier = 1) {
        const previousSpeed = G.v;
        G.v = rideTestPage
            ? rideTestSpeed
            : Math.min(1, G.v + PUSH_SPEED_BOOST * multiplier);
        return Math.max(0, G.v - previousSpeed);
    }
    const canPush = (pos) => pos === 1 || pos === 2;

    let lastKey = 0;
    function doInput(kind) {
        if (G.mode !== "play") return;
        G.idle = 0;
        const A = G.act;
        const slot = kind.indexOf("slot") === 0 ? Number(kind.slice(4)) : -1;
        if (A) {
            if (A.type === "ghost" && A.phase === "run") {
                if (slot === 0) {
                    A.phase = "jump";
                    A.el = 0;
                    A.dur = 380;
                } else if (slot === 1) {
                    if (A.run < 0.8)
                        hint("조금 더 달려서 따라잡아", "Run a bit longer");
                    else {
                        A.phase = "flip";
                        A.el = 0;
                        A.dur = 660;
                        sfx.pop();
                    }
                }
                return;
            }
            if (
                A.type === "bail" ||
                A.type === "ghost" ||
                A.type === "pivot"
            )
                return;
            G.queue = kind;
            return;
        }
        if (kind === "fwd") {
            if (G.pos < 3)
                startAct("step", { from: G.pos, to: G.pos + 1, dur: 240 });
            else hint("이미 노즈 끝이야", "Already at the nose");
        } else if (kind === "back") {
            if (G.pos > 0)
                startAct("step", { from: G.pos, to: G.pos - 1, dur: 240 });
        } else if (kind === "push") {
            if (canPush(G.pos)) {
                bank();
                startAct("push", { dur: pushDuration, boosted: false });
            }
        } else if (slot >= 0) {
            syncOffer();
            const id = offer[slot];
            if (!id) return;
            const tr = TRICKS[id];
            if (G.v < tr.minV) {
                if (canPush(G.pos))
                    hint("속도가 부족해, 푸시!", "Too slow. Push!");
                else hint("속도가 부족해", "Too slow");
                return;
            }
            if (id === "ghost") {
                startAct("ghost", {
                    phase: "off",
                    dur: 280,
                    run: 0,
                    cyc: 0,
                    stepIdx: 0,
                    fromPos: G.pos,
                });
                G.pos = 0;
                sfx.step();
            } else {
                startAct(id, { dur: tr.dur });
                if (tr.air) sfx.pop();
            }
        }
    }
    function afterAct() {
        if (G.queue && G.mode === "play" && !G.act) {
            const q = G.queue;
            G.queue = null;
            doInput(q);
        }
    }
    function endAct() {
        const A = G.act;
        if (A.type === "mango") G.pos = 2;
        const landingPose = newPoses && TRICKS[A.type]?.pts ? pose3(0) : null;
        // Pushing returns to the same stance; walking/tricks may change it.
        if (A.type !== "push") {
            G.startFeet = null;
            G.crossStepStance = false;
        }
        G.act = null;
        if (A.type === "step") {
            G.pos = A.to;
            G.startFeet = [...crossStepPositions[A.to]];
            G.crossStepStance = true;
            addTrick("크로스스텝", 10, {
                mult: false,
                quiet: true,
                norep: true,
            });
            if (A.to === 3)
                addTrick("노즈 워크", 70, { key: "nose" });
        } else if (A.type === "bail") {
            G.pos = startPosition;
            G.startFeet = [...startFeet];
            G.v = rideTestPage ? rideTestSpeed : startSpeed;
            G.awaitingFirstPush = true;
        } else if (A.type === "pivot") {
            G.pos = 0;
            G.facing ^= 1;
            addTrick("180 피봇", TRICKS.pivot.pts, { key: "pivot" });
            sfx.land();
        } else if (TRICKS[A.type] && TRICKS[A.type].pts) {
            const tr = TRICKS[A.type];
            if (landingPose) {
                // Adopt the actual landing as the next action's origin.
                G.worldX = landingPose.B.px / K;
                G.worldZ = landingPose.B.pz;
                G.startFeet = [landingPose.J.aA, landingPose.J.aB].map(
                    (foot) => 0.5 + (foot.x - landingPose.B.px) / LM,
                );
                const [rear, front] = POS[G.pos];
                G.startFeet =
                    G.startFeet[0] < G.startFeet[1]
                        ? [rear, front]
                        : [front, rear];
                if (A.type === "pan") {
                    const baseYaw = G.facing ? Math.PI : 0;
                    G.panFootYawA = landingPose.footYawA - baseYaw;
                    G.panFootYawB = landingPose.footYawB - baseYaw;
                }
            }
            if (tr.body180 || (newPoses && A.type === "nocomply"))
                G.facing ^= 1;
            const speedBoost = TRICK_DEX_IDS.has(A.type)
                ? 0
                : applySpeedBoost(0.5);
            addTrick(tr.label, tr.pts, { key: A.type, speedBoost });
            if (tr.air) {
                sfx.land();
                G.landEl = A.el - touchdownOf(A);
            }
        }
        if (
            A.type === "pivot" ||
            A.type === "pirouette" ||
            A.type === "step180" ||
            A.type === "step360"
        )
            G.landEl = 0;
        afterAct();
        if (TRICKS[A.type] && TRICKS[A.type].pts) rollOffer();
    }
    function endGhost(A) {
        G.act = null;
        G.pos = 1;
        G.startFeet = null;
        G.landEl = A.el - A.dur;
        const bonus = Math.round(A.run * 90);
        if (A.phase === "flip")
            addTrick("고스트라이드 킥플립", GHOSTFLIP_BASE_PTS + bonus, {
                key: "ghostflip",
            });
        else {
            const danceBonus = Math.round((A.run * 90 * 0.7) / 10) * 10;
            const speedBoost = applySpeedBoost(0.5);
            addTrick("고스트라이드", GHOST_BASE_PTS + danceBonus, {
                key: "ghost",
                speedBoost,
            });
        }
        sfx.land();
        afterAct();
        rollOffer();
    }
    function leavePebble(p) {
        const past = p.x + L / 2 + 16;
        if (G.worldX < past) G.worldX = past;
    }
    function resolvePebble(p) {
        const A = G.act;
        if (A && A.type === "bail") {
            leavePebble(p);
            return;
        }
        if (A) {
            const tr = TRICKS[A.type],
                t = A.el / A.dur;
            if (tr?.boardSpinOrFlip && t > tr.air[0] && t < tr.air[1]) {
                addTrick("돌 넘기", 100, { key: "hop" });
                return;
            }
            if (A.type === "ghost") {
                G.shake = 0.25;
                sfx.clunk();
                hint("보드 혼자 돌 넘음", "The board rolled over it");
                return;
            }
            if (A.type === "pivot") {
                hint("돌 피함", "Dodged");
                return;
            }
            if (A.type === "step" && A.to === 0 && t > 0.6) {
                G.shake = 0.25;
                sfx.clunk();
                hint("아슬아슬 통과", "Close call");
                return;
            }
        }
        if (G.pos === 0 && !A) {
            G.shake = 0.25;
            if (!rideTestPage) G.v *= 0.92;
            sfx.clunk();
            hint("돌 통과", "Rolled over it");
            return;
        }
        bail("돌빵!", "Pebble slam!");
        leavePebble(p);
    }

    /* ---------- 업데이트 ---------- */
    function tickRoll(dt) {
        if (rollGain && actx)
            rollGain.gain.setTargetAtTime(
                G.mode === "play" && !muted ? G.v * 0.09 : 0,
                actx.currentTime,
                0.08,
            );
    }

    function tickTitle(dt) {
        G.worldX += G.v * SPEED * dt;
    }

    function tickOver(dt) {
        G.v = Math.max(0, G.v - dt * 0.4);
        G.worldX += G.v * SPEED * dt;
    }

    function tickSession(dt) {
        if (rideTestPage) {
            G.t += dt;
            return false;
        }
        G.t -= dt;
        if (G.t <= 0) {
            G.t = 0;
            endSession();
            return true;
        }
        return false;
    }

    function tickFever(dt) {
        if (G.fever > 0) {
            G.fever = Math.max(0, G.fever - dt);
            if (G.fever === 0) hint("피버 끝", "Fever over");
        }
    }

    function tickCoast(dt) {
        const A = G.act;
        if (G.pushChainTimer > 0) {
            G.pushChainTimer = Math.max(0, G.pushChainTimer - dt);
            if (G.pushChainTimer === 0) G.pushStreak = 0;
        }
        if (rideTestPage) G.v = rideTestSpeed;
        else if (!A || A.type !== "bail")
            G.v = Math.max(0, G.v - FRICTION * dt);
        G.worldX += G.v * SPEED * dt;
        return A;
    }

    function tickJoints(A) {
        const ji = Math.floor((G.worldX + JOINT_OFF) / JOINT);
        if (ji !== G.jointIdx) {
            G.jointIdx = ji;
            if (G.v > 0.05 && !(A && TRICKS[A.type] && TRICKS[A.type].air)) {
                sfx.joint(0);
                const gap = (2 * TRUCK) / (G.v * SPEED);
                if (gap < 0.6) sfx.joint(gap);
            }
        }
    }

    function tickAct(dt, A) {
        if (G.landEl < 400) G.landEl += dt * 1000;
        if (A) {
            A.el += dt * 1000;
            if (A.type === "push" && !A.boosted && A.el >= A.dur * 0.5) {
                A.boosted = true;
                G.awaitingFirstPush = false;
                G.pushStreak = G.pushChainTimer > 0 ? G.pushStreak + 1 : 1;
                G.pushChainTimer = PUSH_CHAIN_WINDOW;
                const chainBonus = Math.min(
                    (G.pushStreak - 1) * PUSH_SPEED_BOOST * PUSH_CHAIN_BONUS_RATIO,
                    PUSH_SPEED_BOOST * PUSH_CHAIN_BONUS_CAP_RATIO,
                );
                applySpeedBoost(1 + chainBonus / PUSH_SPEED_BOOST);
                sfx.push();
            }
            if (A.type === "pivot") {
                const e = pivotSpin(clamp(A.el / A.dur, 0, 1));
                G.worldX += PIVOT_SHIFT * (e - A.prevE);
                A.prevE = e;
            }
            if (A.type === "ghost") {
                if (A.phase === "off") {
                    A.cyc += dt * 9;
                    if (A.el >= A.dur) {
                        A.phase = "run";
                        A.el = 0;
                        A.dur = 1000;
                    }
                } else if (A.phase === "run") {
                    A.cyc += dt * (8 + G.v * 9);
                    A.run += dt;
                    const si = Math.floor(A.cyc / Math.PI);
                    if (si !== A.stepIdx) {
                        A.stepIdx = si;
                        sfx.step();
                    }
                    if (A.run > 3.2) bail("보드 놓침", "Lost the board");
                } else if (A.el >= A.dur) endGhost(A);
            } else if (A.el >= A.dur) endAct();
        }
    }

    function tickStall() {
        const A = G.act;
        if (
            !G.awaitingFirstPush &&
            G.v < 0.05 &&
            (!A || (A.type !== "bail" && A.type !== "pivot"))
        )
            bail("속도가 떨어졌어", "Out of speed");
    }

    function tickIdle(dt) {
        if (!G.act && G.pos === 0 && G.combo.pts > 0) {
            G.idle += dt;
            if (G.idle > 2) {
                bank();
                G.idle = 0;
            }
        } else G.idle = 0;
    }

    function tickPebbles() {
        if (rideTestPage) return;
        if (G.worldX + 560 > G.nextPeb) {
            G.pebbles.push({ x: G.nextPeb, done: false });
            G.nextPeb += 1250 + Math.random() * 1350;
        }
        for (const p of G.pebbles) {
            const rel = p.x - G.worldX;
            if (!p.done && rel <= TRUCK && rel > -L / 2) {
                p.done = true;
                resolvePebble(p);
            }
        }
        G.pebbles = G.pebbles.filter((p) => p.x - G.worldX > -260);
    }

    function tickShake(dt) {
        if (G.shake > 0) G.shake = Math.max(0, G.shake - dt);
    }

    function update(dt) {
        tickRoll(dt);
        if (G.mode === "title") {
            tickTitle(dt);
            return;
        }
        if (G.mode === "over") {
            tickOver(dt);
            return;
        }
        if (G.mode === "pose") {
            stepPose(dt);
            return;
        }
        if (tickSession(dt)) return;
        tickFever(dt);
        const A = tickCoast(dt);
        tickJoints(A);
        tickAct(dt, A);
        tickStall();
        tickIdle(dt);
        tickPebbles();
        tickShake(dt);
    }

    /* =====================================================================
     3D
     ===================================================================== */
    const LM = 1.2,
        K = LM / L,
        Y_ANK = 0.16,
        G_ANK = 0.06,
        SEG = 0.44;
    const Xw = (px) => (G.worldX + px - RIDER_X) * K;
    let renderer = null;
    try {
        if (window.THREE)
            renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true });
    } catch (e) {
        renderer = null;
    }
    const ok3d = !!renderer;
    const R = {};
    let scene = null,
        camera = null;
    const V = (x, y, z) => new THREE.Vector3(x, y, z);

    function canvasTex(w, h, draw) {
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        draw(c.getContext("2d"), w, h);
        return new THREE.CanvasTexture(c);
    }

    function build() {
        const T = THREE;
        scene = new T.Scene();
        scene.background = new T.Color(0x070b0f);
        scene.fog = new T.Fog(0x0b141a, 14, 58);
        camera = new T.PerspectiveCamera(55, 4 / 3, 0.05, 220);

        R.hemi = new T.HemisphereLight(0x8fa6bd, 0x5a4026, 0.55);
        scene.add(R.hemi);
        R.dir = new T.DirectionalLight(0xffd29a, 0.55);
        scene.add(R.dir);
        scene.add(R.dir.target);
        R.pl = new T.PointLight(0xf2a541, 1.2, 9, 1.6);
        scene.add(R.pl);

        const radial = canvasTex(128, 128, (g, w, h) => {
            const gr = g.createRadialGradient(
                w / 2,
                h / 2,
                0,
                w / 2,
                h / 2,
                w / 2,
            );
            gr.addColorStop(0, "rgba(255,255,255,1)");
            gr.addColorStop(0.5, "rgba(255,255,255,.45)");
            gr.addColorStop(1, "rgba(255,255,255,0)");
            g.fillStyle = gr;
            g.fillRect(0, 0, w, h);
        });
        R.radial = radial;
        const concrete = canvasTex(256, 256, (g, w, h) => {
            g.fillStyle = "#6B7278";
            g.fillRect(0, 0, w, h);
            for (let i = 0; i < 3000; i++) {
                const v = 80 + Math.floor(Math.random() * 60);
                g.fillStyle =
                    "rgba(" + v + "," + (v + 4) + "," + (v + 8) + ",.35)";
                g.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5);
            }
        });
        concrete.wrapS = concrete.wrapT = T.RepeatWrapping;
        concrete.repeat.set(40, 5.3);
        R.concrete = concrete;
        const sky = canvasTex(2048, 256, (g, w, h) => {
            for (let i = 0; i < 64; i++) {
                const bw = 18 + hsh(i) * 30,
                    bh = 40 + hsh(i + 97) * 170,
                    x = i * 32;
                g.fillStyle = "#0F171E";
                g.fillRect(x, h - bh, bw, bh);
                g.fillStyle = "rgba(233,190,110,.65)";
                for (let r = 0, yy = h - bh + 6; yy < h - 6; r++, yy += 9)
                    for (let c = 0, xx = x + 3; xx < x + bw - 4; c++, xx += 7)
                        if (hsh(i * 97 + r * 13.3 + c * 7.1) > 0.74)
                            g.fillRect(xx, yy, 3, 4);
            }
        });
        sky.wrapS = T.RepeatWrapping;
        sky.repeat.set(3, 1);
        R.sky = sky;

        const lam = (c) => new T.MeshLambertMaterial({ color: c });
        const add = (geo, mat, x, y, z) => {
            const m = new T.Mesh(geo, mat);
            m.position.set(x || 0, y || 0, z || 0);
            scene.add(m);
            return m;
        };

        R.ground = add(
            new T.PlaneGeometry(80, 10.6),
            new T.MeshLambertMaterial({ color: 0xffffff, map: concrete }),
            0,
            0,
            0.7,
        );
        R.ground.rotation.x = -Math.PI / 2;
        R.wall = add(
            new T.BoxGeometry(90, 0.9, 0.25),
            lam(0x161e24),
            0,
            -0.45,
            -4.6,
        );
        R.river = add(
            new T.PlaneGeometry(260, 90),
            new T.MeshBasicMaterial({ color: 0x0a161e }),
            0,
            -0.8,
            -50,
        );
        R.river.rotation.x = -Math.PI / 2;
        R.city = add(
            new T.PlaneGeometry(320, 34),
            new T.MeshBasicMaterial({
                map: sky,
                transparent: true,
                fog: false,
            }),
            0,
            12,
            -88,
        );
        R.streakMat = new T.MeshBasicMaterial({
            color: 0xe9b460,
            transparent: true,
            opacity: 0.3,
            blending: T.AdditiveBlending,
            depthWrite: false,
        });
        const sg = new T.PlaneGeometry(1, 0.05);
        sg.rotateX(-Math.PI / 2);
        R.streaks = new T.InstancedMesh(sg, R.streakMat, 64);
        scene.add(R.streaks);

        R.deck = add(
            new T.BoxGeometry(100, 1, 12),
            lam(0x1a2026),
            0,
            4.1,
            -0.6,
        );
        R.beams = new T.InstancedMesh(
            new T.BoxGeometry(0.3, 0.35, 12),
            lam(0x12171b),
            28,
        );
        scene.add(R.beams);

        R.rail1 = add(
            new T.BoxGeometry(90, 0.05, 0.05),
            lam(0x3a444b),
            0,
            1.0,
            -4.45,
        );
        R.rail2 = add(
            new T.BoxGeometry(90, 0.05, 0.05),
            lam(0x3a444b),
            0,
            0.55,
            -4.45,
        );
        R.posts = new T.InstancedMesh(
            new T.BoxGeometry(0.05, 1, 0.05),
            lam(0x3a444b),
            60,
        );
        scene.add(R.posts);

        R.seams = new T.InstancedMesh(
            new T.BoxGeometry(0.035, 0.006, 10.6),
            new T.MeshBasicMaterial({ color: 0x0e1215 }),
            50,
        );
        scene.add(R.seams);

        R.pillars = [];
        const pGeo = new T.BoxGeometry(0.9, 3.6, 1.3),
            pMat = lam(0x2e363c);
        const lampGeo = new T.BoxGeometry(0.32, 0.12, 0.1),
            lampMat = new T.MeshBasicMaterial({ color: 0xf7cf8a });
        const glowMat = new T.SpriteMaterial({
            map: radial,
            color: 0xf2a541,
            transparent: true,
            opacity: 0.75,
            blending: T.AdditiveBlending,
            depthWrite: false,
        });
        const poolGeo = new T.PlaneGeometry(5.2, 4.2);
        poolGeo.rotateX(-Math.PI / 2);
        const poolMat = new T.MeshBasicMaterial({
            map: radial,
            color: 0xf2a541,
            transparent: true,
            opacity: 0.42,
            blending: T.AdditiveBlending,
            depthWrite: false,
        });
        for (let i = 0; i < 12; i++) {
            const g = new T.Group();
            const p = new T.Mesh(pGeo, pMat);
            p.position.set(0, 1.8, -3.3);
            g.add(p);
            const lmp = new T.Mesh(lampGeo, lampMat);
            lmp.position.set(0, 2.5, -2.6);
            g.add(lmp);
            const s = new T.Sprite(glowMat);
            s.position.set(0, 2.5, -2.5);
            s.scale.set(1.8, 1.8, 1);
            g.add(s);
            const pool = new T.Mesh(poolGeo, poolMat);
            pool.position.set(0, 0.004, -1.4);
            g.add(pool);
            scene.add(g);
            R.pillars.push(g);
        }

        R.pebbles = [];
        const pebGeo = new T.DodecahedronGeometry(0.05),
            pebMat = lam(0xa69c8c);
        const ringGeo = new T.RingGeometry(0.12, 0.16, 24);
        ringGeo.rotateX(-Math.PI / 2);
        for (let i = 0; i < 6; i++) {
            const m = new T.Mesh(pebGeo, pebMat);
            scene.add(m);
            const ring = new T.Mesh(
                ringGeo,
                new T.MeshBasicMaterial({
                    color: 0xf2a541,
                    transparent: true,
                    opacity: 0.5,
                    depthWrite: false,
                }),
            );
            scene.add(ring);
            R.pebbles.push({ m, ring });
        }

        R.shadow = add(
            new T.PlaneGeometry(1, 1),
            new T.MeshBasicMaterial({
                map: radial,
                color: 0x000000,
                transparent: true,
                opacity: 0.6,
                depthWrite: false,
            }),
            0,
            0.003,
            0,
        );
        R.shadow.rotation.x = -Math.PI / 2;

        R.boardMats = [
            lam(0xc99a5e),
            lam(0x151515),
            lam(0x8e979e),
            lam(0xf28c3a),
            new T.MeshBasicMaterial({ color: 0xffd3a6 }),
        ];
        R.boardMats.forEach((m) => {
            m.transparent = true;
        });
        const [maple, grip, metal, urethane, hub] = R.boardMats;
        R.bOuter = new T.Group();
        R.bInner = new T.Group();
        R.bOuter.add(R.bInner);
        scene.add(R.bOuter);
        R.bOuter.rotation.order = "YZX";
        const midLen = LM - 0.34;
        const deckM = new T.Mesh(new T.BoxGeometry(midLen, 0.016, 0.24), maple);
        R.bInner.add(deckM);
        const gripM = new T.Mesh(new T.BoxGeometry(midLen, 0.004, 0.226), grip);
        gripM.position.y = 0.01;
        R.bInner.add(gripM);
        for (const s of [-1, 1]) {
            const tail = new T.Group();
            tail.position.set((s * midLen) / 2, 0, 0);
            tail.rotation.z = s * 0.3;
            R.bInner.add(tail);
            const tm = new T.Mesh(new T.BoxGeometry(0.18, 0.016, 0.24), maple);
            tm.position.x = s * 0.09;
            tail.add(tm);
            const tg = new T.Mesh(new T.BoxGeometry(0.18, 0.004, 0.226), grip);
            tg.position.set(s * 0.09, 0.01, 0);
            tail.add(tg);
        }
        R.wheels = [];
        const wGeo = new T.CylinderGeometry(0.035, 0.035, 0.045, 16);
        wGeo.rotateX(Math.PI / 2);
        const hubGeo = new T.BoxGeometry(0.012, 0.012, 0.047);
        for (const tx of [-TRUCK * K, TRUCK * K]) {
            const tr = new T.Mesh(new T.BoxGeometry(0.06, 0.045, 0.2), metal);
            tr.position.set(tx, -0.035, 0);
            R.bInner.add(tr);
            for (const tz of [-0.12, 0.12]) {
                const w = new T.Mesh(wGeo, urethane);
                w.position.set(tx, -0.055, tz);
                R.bInner.add(w);
                const h = new T.Mesh(hubGeo, hub);
                h.position.set(0.022, 0, 0);
                w.add(h);
                R.wheels.push(w);
            }
        }

        R.riderMats = {
            shirt: lam(0xf6c94e),
            pants: lam(0x4f6fa8),
            skin: lam(0xf3c9a2),
            cap: lam(0xf2675a),
            shoe: lam(0xf7f5ef),
            eye: new T.MeshBasicMaterial({ color: 0x1e1b1a }),
            shine: new T.MeshBasicMaterial({ color: 0xffffff }),
            blush: lam(0xf59a9a),
        };
        Object.values(R.riderMats).forEach((m) => {
            m.transparent = true;
        });
        const M = R.riderMats,
            cyl = new T.CylinderGeometry(1, 1, 1, 10);
        const mk = (geo, mat) => {
            const m = new T.Mesh(geo, mat);
            scene.add(m);
            return m;
        };
        R.r = {
            thA: mk(cyl, M.pants),
            shA: mk(cyl, M.pants),
            thB: mk(cyl, M.pants),
            shB: mk(cyl, M.pants),
            upL: mk(cyl, M.shirt),
            upR: mk(cyl, M.shirt),
            foL: mk(cyl, M.skin),
            foR: mk(cyl, M.skin),
            kneeA: mk(new T.SphereGeometry(0.074, 12, 10), M.pants),
            kneeB: mk(new T.SphereGeometry(0.074, 12, 10), M.pants),
            elbowL: mk(new T.SphereGeometry(0.058, 12, 10), M.skin),
            elbowR: mk(new T.SphereGeometry(0.058, 12, 10), M.skin),
            shoulderL: mk(new T.SphereGeometry(0.055, 12, 10), M.shirt),
            shoulderR: mk(new T.SphereGeometry(0.055, 12, 10), M.shirt),
            torso: mk(
                new T.LatheGeometry(
                    [
                        [0, -0.26],
                        [0.12, -0.255],
                        [0.17, -0.22],
                        [0.19, -0.14],
                        [0.195, -0.02],
                        [0.19, 0.1],
                        [0.175, 0.18],
                        [0.14, 0.235],
                        [0.08, 0.258],
                        [0, 0.262],
                    ].map((p) => new T.Vector2(p[0], p[1])),
                    22,
                ),
                M.shirt,
            ),
            pelvis: mk(new T.SphereGeometry(1, 16, 12), M.pants),
            shoeA: mk(new T.SphereGeometry(1, 14, 10), M.shoe),
            shoeB: mk(new T.SphereGeometry(1, 14, 10), M.shoe),
            haL: mk(new T.SphereGeometry(0.052, 12, 10), M.skin),
            haR: mk(new T.SphereGeometry(0.052, 12, 10), M.skin),
        };
        R.r.torso.scale.set(1, 1, 0.74);
        R.r.pelvis.scale.set(0.17, 0.11, 0.13);
        R.r.shoeA.scale.set(0.066, 0.05, 0.15);
        R.r.shoeB.scale.set(0.066, 0.05, 0.15);
        // chibi head: big round face, dot eyes, blush, smile, cap
        const hg = new T.Group();
        hg.scale.setScalar(1.16);
        scene.add(hg);
        R.headG = hg;
        const hp = (geo, mat, x, y, z) => {
            const m = new T.Mesh(geo, mat);
            m.position.set(x, y, z);
            hg.add(m);
            return m;
        };
        hp(new T.SphereGeometry(0.165, 24, 18), M.skin, 0, 0, 0);
        for (const sd of [-1, 1]) {
            hp(
                new T.SphereGeometry(0.024, 12, 10),
                M.eye,
                sd * 0.062,
                0,
                0.147,
            ).scale.set(1, 1.3, 0.6);
            hp(
                new T.SphereGeometry(0.008, 8, 6),
                M.shine,
                sd * 0.062 + 0.008,
                0.015,
                0.161,
            );
            const b = hp(
                new T.SphereGeometry(0.03, 12, 8),
                M.blush,
                sd * 0.1,
                -0.05,
                0.124,
            );
            b.scale.set(1, 0.55, 0.4);
            b.rotation.y = sd * 0.6;
        }
        hp(
            new T.TorusGeometry(0.022, 0.0055, 6, 14, Math.PI),
            M.eye,
            0,
            -0.056,
            0.155,
        ).rotation.z = Math.PI;
        hp(
            new T.SphereGeometry(
                0.173,
                24,
                12,
                0,
                Math.PI * 2,
                0,
                Math.PI * 0.48,
            ),
            M.cap,
            0,
            0.014,
            -0.008,
        ).rotation.x = -0.2;
        hp(
            new T.CylinderGeometry(
                0.13,
                0.13,
                0.016,
                20,
                1,
                false,
                -Math.PI / 2,
                Math.PI,
            ),
            M.cap,
            0,
            0.06,
            0.095,
        ).rotation.x = 0.14;
        hp(new T.SphereGeometry(0.022, 10, 8), M.cap, 0, 0.176, -0.04);
        R.nightObjs = [
            R.wall,
            R.river,
            R.city,
            R.streaks,
            R.deck,
            R.beams,
            R.rail1,
            R.rail2,
            R.posts,
        ].concat(R.pillars);
        R.groundTex = R.concrete;
        buildSpots();
        buildFx();
        R.dummy = new T.Object3D();
        R.camPos = V(0, 2, 3);
        R.camLook = V(1, 0.7, 0);
        R.camInit = false;
    }

    /* ---------- 스팟: 바닷가 · 낮 시티 ---------- */
    function drawClouds(g, w, seed, count, y0, y1) {
        for (let i = 0; i < count; i++) {
            const x = hsh(i + seed) * w,
                y = y0 + hsh(i + seed + 1) * (y1 - y0),
                s = 20 + hsh(i + seed + 2) * 40;
            g.fillStyle = "rgba(255,255,255,.88)";
            for (let k = 0; k < 5; k++) {
                g.beginPath();
                g.ellipse(
                    x + k * s * 0.55,
                    y + Math.sin(k * 1.7) * s * 0.18,
                    s * 0.6,
                    s * 0.38,
                    0,
                    0,
                    Math.PI * 2,
                );
                g.fill();
            }
        }
    }
    function drawSeaBackdrop(g, w, h) {
        drawClouds(g, w, 10, 18, 24, 110);
        for (let i = 0; i < 5; i++) {
            const x = hsh(i + 30) * w,
                iw = 160 + hsh(i + 31) * 260,
                ih = 18 + hsh(i + 32) * 30;
            g.fillStyle = "#6F9AAE";
            g.beginPath();
            g.moveTo(x, h);
            g.quadraticCurveTo(x + iw * 0.45, h - ih * 2, x + iw, h);
            g.closePath();
            g.fill();
        }
    }
    function drawCityBackdrop(g, w, h) {
        drawClouds(g, w, 120, 12, 14, 70);
        for (let i = 0; i < 70; i++) {
            const bw = 16 + hsh(i + 200) * 28,
                bh = 40 + hsh(i + 201) * 150,
                x = i * 30;
            g.fillStyle = "rgba(150,175,195,.9)";
            g.fillRect(x, h - bh, bw, bh);
            g.fillStyle = "rgba(255,255,255,.35)";
            for (let r = 0, yy = h - bh + 6; yy < h - 4; r++, yy += 9)
                for (let c = 0, xx = x + 3; xx < x + bw - 4; c++, xx += 7)
                    if (hsh(i * 31 + r * 7.7 + c * 3.1) > 0.5)
                        g.fillRect(xx, yy, 3, 4);
        }
    }
    function buildSpots() {
        const T = THREE,
            lam = (c) => new T.MeshLambertMaterial({ color: c });
        const mesh = (geo, mat, x, y, z) => {
            const m = new T.Mesh(geo, mat);
            m.position.set(x, y, z);
            return m;
        };
        const flat = (w, d) => {
            const g = new T.PlaneGeometry(w, d);
            g.rotateX(-Math.PI / 2);
            return g;
        };
        R.planks = canvasTex(256, 256, (g, w, h) => {
            g.fillStyle = "#B4865A";
            g.fillRect(0, 0, w, h);
            for (let i = 0; i < 8; i++) {
                const v = 160 + Math.floor(hsh(i + 900) * 36);
                g.fillStyle =
                    "rgb(" + (v + 24) + "," + (v - 20) + "," + (v - 62) + ")";
                g.fillRect(i * 32 + 1, 0, 30, h);
            }
            g.fillStyle = "rgba(70,40,18,.6)";
            for (let i = 0; i < 8; i++) g.fillRect(i * 32, 0, 2, h);
            g.fillStyle = "rgba(90,55,25,.16)";
            for (let i = 0; i < 900; i++)
                g.fillRect(
                    Math.random() * w,
                    Math.random() * h,
                    1,
                    6 + Math.random() * 14,
                );
        });
        R.tiles = canvasTex(256, 256, (g, w, h) => {
            g.fillStyle = "#C9CDD0";
            g.fillRect(0, 0, w, h);
            for (let i = 0; i < 2000; i++) {
                const v = 180 + Math.floor(Math.random() * 40);
                g.fillStyle = "rgba(" + v + "," + v + "," + (v + 4) + ",.4)";
                g.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5);
            }
            g.fillStyle = "rgba(120,126,130,.5)";
            for (let i = 0; i < 4; i++) {
                g.fillRect(i * 64, 0, 2, h);
                g.fillRect(0, i * 64, w, 2);
            }
        });
        [R.planks, R.tiles].forEach((t) => {
            t.wrapS = t.wrapT = T.RepeatWrapping;
            t.repeat.set(40, 5.3);
        });

        // 바닷가
        const sea = (R.seaObjs = []);
        const S = (m) => {
            scene.add(m);
            sea.push(m);
            return m;
        };
        R.seaEdge = S(
            mesh(
                new T.BoxGeometry(90, 0.3, 0.25),
                lam(0x6e4a2a),
                0,
                -0.15,
                -4.6,
            ),
        );
        R.sand = S(mesh(flat(90, 5), lam(0xe6d2a2), 0, -0.28, -7.1));
        R.sea = S(
            mesh(
                flat(300, 110),
                new T.MeshLambertMaterial({
                    color: 0x1c6e9e,
                    emissive: 0x05253a,
                }),
                0,
                -0.32,
                -64,
            ),
        );
        R.foamMat = new T.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.6,
            depthWrite: false,
        });
        R.foam = S(mesh(flat(90, 0.35), R.foamMat, 0, -0.3, -9.6));
        R.waveMat = new T.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.45,
            depthWrite: false,
        });
        R.waves = S(new T.InstancedMesh(flat(1, 0.06), R.waveMat, 64));
        const seaTex = canvasTex(2048, 256, drawSeaBackdrop);
        seaTex.wrapS = T.RepeatWrapping;
        seaTex.repeat.set(2, 1);
        R.seaSky = S(
            mesh(
                new T.PlaneGeometry(320, 34),
                new T.MeshBasicMaterial({
                    map: seaTex,
                    transparent: true,
                    fog: false,
                }),
                0,
                16,
                -96,
            ),
        );
        R.sun = S(
            new T.Sprite(
                new T.SpriteMaterial({
                    map: R.radial,
                    color: 0xfff3c4,
                    transparent: true,
                    opacity: 0.95,
                    depthWrite: false,
                    fog: false,
                }),
            ),
        );
        R.sun.scale.set(26, 26, 1);
        R.sunCore = S(
            new T.Sprite(
                new T.SpriteMaterial({
                    map: R.radial,
                    color: 0xffffff,
                    transparent: true,
                    depthWrite: false,
                    fog: false,
                }),
            ),
        );
        R.sunCore.scale.set(7, 7, 1);
        const wood = lam(0x8a6038);
        R.sRail1 = S(
            mesh(new T.BoxGeometry(90, 0.07, 0.07), wood, 0, 1.0, -4.45),
        );
        R.sRail2 = S(
            mesh(new T.BoxGeometry(90, 0.05, 0.05), wood, 0, 0.55, -4.45),
        );
        R.sPosts = S(
            new T.InstancedMesh(new T.BoxGeometry(0.08, 1, 0.08), wood, 60),
        );
        R.palms = [];
        const trunkMat = lam(0x8b6b48),
            leafMat = new T.MeshLambertMaterial({
                color: 0x2f8f4e,
                side: T.DoubleSide,
            });
        const segGeo = new T.CylinderGeometry(0.12, 0.16, 1, 7);
        const leafGeo = new T.PlaneGeometry(1.9, 0.42);
        leafGeo.translate(0.95, 0, 0);
        for (let i = 0; i < 12; i++) {
            const g = new T.Group();
            let x = 0,
                y = 0;
            for (let k = 0; k < 5; k++) {
                const ln = 0.08 + k * 0.05,
                    seg = new T.Mesh(segGeo, trunkMat);
                seg.position.set(
                    x + Math.sin(ln) * 0.5,
                    y + Math.cos(ln) * 0.5,
                    0,
                );
                seg.rotation.z = -ln;
                g.add(seg);
                x += Math.sin(ln);
                y += Math.cos(ln);
            }
            const crown = new T.Group();
            crown.position.set(x, y, 0);
            g.add(crown);
            for (let f = 0; f < 7; f++) {
                const leaf = new T.Mesh(leafGeo, leafMat);
                leaf.rotation.set(0, (f / 7) * Math.PI * 2, -0.45);
                crown.add(leaf);
            }
            g.position.z = -3.6;
            g.userData.crown = crown;
            S(g);
            R.palms.push(g);
        }

        // 낮 시티
        const city = (R.cityObjs = []);
        const C = (m) => {
            scene.add(m);
            city.push(m);
            return m;
        };
        R.curb = C(
            mesh(
                new T.BoxGeometry(90, 0.14, 0.3),
                lam(0x9ea4a8),
                0,
                0.07,
                -4.6,
            ),
        );
        R.road = C(mesh(flat(90, 6), lam(0x3b4045), 0, -0.01, -7.8));
        R.lanes = C(
            new T.InstancedMesh(
                flat(1.4, 0.12),
                new T.MeshBasicMaterial({ color: 0xf1f1ea }),
                40,
            ),
        );
        R.walk2 = C(mesh(flat(90, 3.2), lam(0xbfc3c6), 0, 0, -12.3));
        const winTex = canvasTex(128, 256, (g, w, h) => {
            g.fillStyle = "#FFFFFF";
            g.fillRect(0, 0, w, h);
            g.fillStyle = "rgba(40,60,80,.55)";
            for (let y = 10; y < h - 26; y += 22)
                for (let x = 8; x < w - 8; x += 24) g.fillRect(x, y, 14, 13);
            g.fillStyle = "rgba(60,60,60,.25)";
            g.fillRect(0, h - 18, w, 18);
        });
        R.bMats = [
            0xe7d3b5, 0xd98b6a, 0x9fc2b8, 0xc9b6d9, 0xe9e2d0, 0x7fa7c9,
        ].map((c) => new T.MeshLambertMaterial({ color: c, map: winTex }));
        R.blds = [];
        const bGeo = new T.BoxGeometry(1, 1, 1);
        for (let i = 0; i < 20; i++)
            R.blds.push(C(new T.Mesh(bGeo, R.bMats[0])));
        const cityTex = canvasTex(2048, 256, drawCityBackdrop);
        cityTex.wrapS = T.RepeatWrapping;
        cityTex.repeat.set(2, 1);
        R.citySky = C(
            mesh(
                new T.PlaneGeometry(320, 34),
                new T.MeshBasicMaterial({
                    map: cityTex,
                    transparent: true,
                    fog: false,
                }),
                0,
                16,
                -96,
            ),
        );
        R.trees = [];
        const tGeo = new T.CylinderGeometry(0.09, 0.12, 1.8, 7),
            canGeo = new T.IcosahedronGeometry(1, 0);
        const tMat = lam(0x6b4f36),
            canMat = [
                new T.MeshPhongMaterial({ color: 0x4e9a5a, flatShading: true }),
                new T.MeshPhongMaterial({ color: 0x6bb36f, flatShading: true }),
            ];
        for (let i = 0; i < 12; i++) {
            const g = new T.Group();
            const tr = new T.Mesh(tGeo, tMat);
            tr.position.y = 0.9;
            g.add(tr);
            const c1 = new T.Mesh(canGeo, canMat[i % 2]);
            c1.position.set(0, 2.4, 0);
            c1.scale.set(1.1, 1, 1.1);
            g.add(c1);
            const c2 = new T.Mesh(canGeo, canMat[(i + 1) % 2]);
            c2.position.set(0.45, 2.0, 0.3);
            c2.scale.set(0.7, 0.6, 0.7);
            g.add(c2);
            g.position.z = -3.5;
            C(g);
            R.trees.push(g);
        }
        R.cLamps = [];
        const poleGeo = new T.CylinderGeometry(0.05, 0.06, 3.6, 6),
            headGeo = new T.BoxGeometry(0.5, 0.08, 0.16),
            poleMat = lam(0x5e666c);
        for (let i = 0; i < 12; i++) {
            const g = new T.Group();
            const p = new T.Mesh(poleGeo, poleMat);
            p.position.y = 1.8;
            g.add(p);
            const hd = new T.Mesh(headGeo, poleMat);
            hd.position.set(0.2, 3.6, 0);
            g.add(hd);
            g.position.z = -3.0;
            C(g);
            R.cLamps.push(g);
        }
    }
    const SPOT_ENV = {
        bridge: {
            bg: 0x070b0f,
            fog: [0x0b141a, 14, 58],
            hemi: [0x8fa6bd, 0x5a4026, 0.55],
            dir: [0xffd29a, 0.55],
            pl: 1.2,
            tex: "concrete",
            seam: 0x0e1215,
            shadow: 0.6,
            gc: 0xffffff,
        },
        sea: {
            bg: 0x9fd6f5,
            fog: [0xbfe6f7, 25, 115],
            hemi: [0xd5f0ff, 0xe3cf9f, 0.95],
            dir: [0xfff2d6, 0.95],
            pl: 0,
            tex: "planks",
            seam: 0x5a3b20,
            shadow: 0.35,
            gc: 0xe6e0d8,
        },
        city: {
            bg: 0xa8d8f4,
            fog: [0xcfe8f5, 30, 125],
            hemi: [0xddf1ff, 0xb8b0a0, 0.95],
            dir: [0xffffff, 0.85],
            pl: 0,
            tex: "tiles",
            seam: 0x8e9398,
            shadow: 0.35,
            gc: 0xa9aeb3,
        },
    };
    function applySpot() {
        if (!scene) return;
        const E = SPOT_ENV[spot];
        scene.background.setHex(E.bg);
        scene.fog.color.setHex(E.fog[0]);
        scene.fog.near = E.fog[1];
        scene.fog.far = E.fog[2];
        R.hemi.color.setHex(E.hemi[0]);
        R.hemi.groundColor.setHex(E.hemi[1]);
        R.hemi.intensity = E.hemi[2];
        R.dir.color.setHex(E.dir[0]);
        R.dir.intensity = E.dir[1];
        R.pl.intensity = E.pl;
        R.groundTex = R[E.tex];
        R.ground.material.map = R.groundTex;
        R.ground.material.color.setHex(E.gc);
        R.ground.material.needsUpdate = true;
        R.seams.material.color.setHex(E.seam);
        R.shadowBase = E.shadow;
        R.nightObjs.forEach((o) => {
            o.visible = spot === "bridge";
        });
        R.seaObjs.forEach((o) => {
            o.visible = spot === "sea";
        });
        R.cityObjs.forEach((o) => {
            o.visible = spot === "city";
        });
    }

    function applyLook3d() {
        if (!R.boardMats) return;
        R.boardMats[0].color.set(deckColor());
        R.boardMats[3].color.set(wheelColor());
    }
    function renderSnapshot() {
        if (renderer && scene && camera) renderer.render(scene, camera);
    }

    /* ---------- 자세 계산 ---------- */
    const UP = () => V(0, 1, 0);
    const pose3 = createPose3({
        V,
        SEG,
        G_ANK,
        Y_ANK,
        L,
        TAIL,
        TRUCK,
        Xw,
        K,
        LM,
        POS,
        stepPositions: crossStepPositions,
        posePage,
        newPoses,
        reduce,
        TRICKS,
        clamp,
        lerp,
        ease,
        bump,
        landingDown,
        touchdownOf,
        PIVOT_BACK,
        PIVOT_FRONT,
        PIVOT_PREP,
        PIVOT_AXIS,
        PIVOT_SHIFT,
        get G() {
            return G;
        },
    });

    /* ---------- 이펙트 · 동물 관객 ---------- */
    const AS = 3.6,
        ANIM_N = 7;
    const animOn = (n) => hsh(n * 3.7 + 1) >= 0.3;
    const animX = (n) => n * AS + hsh(n + 5) * 2;
    const animZ = (n) => -1.25 - hsh(n + 11) * 0.55;
    function buildFx() {
        const T = THREE,
            lam = (c) => new T.MeshLambertMaterial({ color: c });
        const star = canvasTex(64, 64, (g, w) => {
            const c = w / 2,
                gr = g.createRadialGradient(c, c, 0, c, c, c);
            gr.addColorStop(0, "rgba(255,255,255,1)");
            gr.addColorStop(0.3, "rgba(255,255,255,.55)");
            gr.addColorStop(1, "rgba(255,255,255,0)");
            g.fillStyle = gr;
            g.fillRect(0, 0, w, w);
            g.fillStyle = "#fff";
            g.beginPath();
            for (let i = 0; i < 8; i++) {
                const r = i % 2 ? 6 : 30,
                    a = (i * Math.PI) / 4 - Math.PI / 2;
                g.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r);
            }
            g.closePath();
            g.fill();
        });
        const heart = canvasTex(64, 64, (g) => {
            g.translate(32, 34);
            g.beginPath();
            g.moveTo(0, 20);
            g.bezierCurveTo(-34, -2, -20, -30, 0, -13);
            g.bezierCurveTo(20, -30, 34, -2, 0, 20);
            g.closePath();
            g.fillStyle = "#FF6F9C";
            g.fill();
            g.lineWidth = 4;
            g.strokeStyle = "#fff";
            g.stroke();
        });
        const wow = canvasTex(64, 64, (g) => {
            g.fillStyle = "#fff";
            g.beginPath();
            g.arc(32, 28, 22, 0, Math.PI * 2);
            g.fill();
            g.beginPath();
            g.moveTo(22, 44);
            g.lineTo(17, 60);
            g.lineTo(34, 48);
            g.fill();
            g.fillStyle = "#E8554E";
            g.font = "bold 34px sans-serif";
            g.textAlign = "center";
            g.textBaseline = "middle";
            g.fillText("!", 32, 30);
        });
        R.sparks = [];
        R.hearts = [];
        R.wows = [];
        for (let i = 0; i < 150; i++) {
            const sp = new T.Sprite(
                new T.SpriteMaterial({
                    map: star,
                    transparent: true,
                    depthWrite: false,
                    blending: T.AdditiveBlending,
                }),
            );
            sp.visible = false;
            scene.add(sp);
            R.sparks.push({
                s: sp,
                life: 0,
                max: 1,
                v: V(0, 0, 0),
                size: 0.1,
                g: 0,
            });
        }
        for (const [pool, tex, n] of [
            [R.hearts, heart, 14],
            [R.wows, wow, 8],
        ]) {
            for (let i = 0; i < n; i++) {
                const sp = new T.Sprite(
                    new T.SpriteMaterial({
                        map: tex,
                        transparent: true,
                        depthWrite: false,
                    }),
                );
                sp.visible = false;
                scene.add(sp);
                pool.push({ s: sp, life: 0, max: 1 });
            }
        }

        // animal spectators: cats under the bridge, seagulls at the sea, pigeons in the city
        const sph = new T.SphereGeometry(1, 14, 10);
        const part = (g, mat, x, y, z, sx, sy, sz) => {
            const m = new T.Mesh(sph, mat);
            m.position.set(x, y, z);
            m.scale.set(sx, sy, sz);
            g.add(m);
            return m;
        };
        const black = new T.MeshBasicMaterial({ color: 0x1e1b1a }),
            pink = lam(0xf29c9c);
        const CAT_COL = [
            0xe8a15a, 0x9aa0a6, 0x3a3a3e, 0xf1e3c8, 0xe8a15a, 0xc9c2b6,
        ];
        function cat(i) {
            const g = new T.Group(),
                fur = lam(CAT_COL[i]);
            part(g, fur, 0, 0.13, -0.02, 0.12, 0.14, 0.13);
            const head = part(g, fur, 0, 0.31, 0.03, 0.105, 0.095, 0.095);
            for (const sd of [-1, 1]) {
                const ear = new T.Mesh(
                    new T.ConeGeometry(0.035, 0.075, 8),
                    fur,
                );
                ear.position.set(sd * 0.06, 0.395, 0.03);
                ear.rotation.z = -sd * 0.25;
                g.add(ear);
                part(g, black, sd * 0.038, 0.32, 0.118, 0.014, 0.019, 0.01);
                part(g, fur, sd * 0.05, 0.03, 0.09, 0.035, 0.03, 0.045);
            }
            part(g, pink, 0, 0.296, 0.126, 0.013, 0.009, 0.008);
            const tail = new T.Group();
            tail.position.set(0, 0.06, -0.13);
            g.add(tail);
            const tm = new T.Mesh(
                new T.CylinderGeometry(0.018, 0.022, 0.24, 8),
                fur,
            );
            tm.position.y = 0.12;
            tail.add(tm);
            tail.rotation.x = -0.5;
            g.userData = { head, tail, bird: false };
            return g;
        }
        function bird(kind, i) {
            const g = new T.Group();
            g.userData = { wings: [], bird: true };
            const gull = kind === "gull";
            const body = lam(
                gull ? 0xf7f7f4 : [0x8e97a8, 0x9aa3b3, 0x7d8698][i % 3],
            );
            const wingM = lam(gull ? 0xaeb6bf : 0x6f7788),
                beakM = lam(gull ? 0xf2b33d : 0x3b3b40),
                legM = lam(gull ? 0xf2b33d : 0xe58a93);
            part(g, body, 0, 0.15, 0, 0.085, 0.085, 0.14);
            if (!gull)
                part(g, lam(0x5e8c7a), 0, 0.215, 0.07, 0.07, 0.045, 0.065);
            const head = new T.Group();
            head.position.set(0, 0.26, 0.09);
            g.add(head);
            part(head, body, 0, 0, 0, 0.062, 0.062, 0.062);
            const beak = new T.Mesh(new T.ConeGeometry(0.016, 0.06, 8), beakM);
            beak.rotation.x = Math.PI / 2;
            beak.position.set(0, -0.008, 0.085);
            head.add(beak);
            for (const sd of [-1, 1]) {
                part(
                    head,
                    black,
                    sd * 0.034,
                    0.015,
                    0.045,
                    0.011,
                    0.013,
                    0.008,
                );
                const w = new T.Group();
                w.position.set(sd * 0.08, 0.19, 0);
                w.userData.s = sd;
                g.add(w);
                g.userData.wings.push(w);
                part(w, wingM, sd * 0.01, -0.02, -0.01, 0.025, 0.06, 0.12);
                const leg = new T.Mesh(
                    new T.CylinderGeometry(0.007, 0.007, 0.08, 6),
                    legM,
                );
                leg.position.set(sd * 0.03, 0.04, 0);
                g.add(leg);
            }
            part(g, wingM, 0, 0.14, -0.15, 0.05, 0.02, 0.06);
            g.userData.head = head;
            return g;
        }
        R.animals = { bridge: [], sea: [], city: [] };
        for (let i = 0; i < ANIM_N; i++) {
            R.animals.bridge.push(cat(i));
            R.animals.sea.push(bird("gull", i));
            R.animals.city.push(bird("pigeon", i));
        }
        for (const k in R.animals)
            R.animals[k].forEach((g) => {
                g.visible = false;
                g.scale.setScalar(1.45);
                scene.add(g);
            });
        R.animFx = {};
    }
    let sparkI = 0,
        heartI = 0,
        wowI = 0;
    function sparks(p, count, colors, speed, life) {
        if (reduce) count = Math.ceil(count / 3);
        for (let i = 0; i < count; i++) {
            const Q = R.sparks[sparkI++ % R.sparks.length];
            const a = Math.random() * Math.PI * 2,
                sp = speed * (0.4 + Math.random() * 0.6);
            Q.s.position.set(
                p.x + (Math.random() - 0.5) * 0.3,
                p.y + 0.1 + Math.random() * 0.25,
                p.z + (Math.random() - 0.5) * 0.3,
            );
            Q.v.set(
                Math.cos(a) * sp * 0.55,
                (0.45 + Math.random() * 0.8) * sp,
                Math.sin(a) * sp * 0.55,
            );
            Q.life = Q.max = life * (0.6 + Math.random() * 0.4);
            Q.size = 0.07 + Math.random() * 0.1;
            Q.g = 4.2;
            Q.s.material.color.setHex(colors[i % colors.length]);
            Q.s.visible = true;
        }
    }
    function trailDot(p, col) {
        const Q = R.sparks[sparkI++ % R.sparks.length];
        Q.s.position.set(
            p.x - 0.3 + (Math.random() - 0.5) * 0.12,
            0.04 + Math.random() * 0.07,
            p.z + (Math.random() - 0.5) * 0.26,
        );
        Q.v.set(-0.15 - Math.random() * 0.25, 0.2 + Math.random() * 0.3, 0);
        Q.life = Q.max = 0.5;
        Q.size = 0.05 + Math.random() * 0.045;
        Q.g = 0;
        Q.s.material.color.copy(col);
        Q.s.visible = true;
    }
    function icon(kind, x, z) {
        const pool = kind === "wow" ? R.wows : R.hearts,
            Q = pool[(kind === "wow" ? wowI++ : heartI++) % pool.length];
        Q.s.position.set(x + (Math.random() - 0.5) * 0.12, 0.72, z);
        Q.life = Q.max = 1.1;
        Q.s.visible = true;
    }
    let trailCol = null;
    let trailAcc = 0;
    function renderFx(dt, time, c0, bp) {
        // react to what just happened
        const an0 = Math.floor((c0 - 7) / AS);
        while (fxQ.length) {
            const ev = fxQ.shift(),
                near = [];
            for (let j = 0; j < ANIM_N; j++) {
                const n = an0 + j;
                if (animOn(n) && Math.abs(animX(n) - c0) < 7.5) near.push(n);
            }
            if (ev === "trick") {
                sparks(bp, 12, [0xffe27a, 0xffffff, 0xffb3e6], 1.6, 0.7);
                near.forEach((n, i) => {
                    R.animFx[n] = { t: time, k: "hop" };
                    if (i < 2) icon("heart", animX(n), animZ(n));
                });
            } else if (ev === "bank") {
                sparks(
                    bp,
                    26,
                    [0xffd15c, 0x7fd1be, 0xff8fd8, 0x8fb8ff],
                    2.4,
                    1,
                );
                near.forEach((n) => {
                    R.animFx[n] = { t: time, k: "cheer" };
                    icon("heart", animX(n), animZ(n));
                });
            } else if (ev === "bail") {
                near.forEach((n) => {
                    R.animFx[n] = { t: time, k: "startle" };
                    icon("wow", animX(n), animZ(n));
                });
            } else if (ev === "fever") {
                sparks(
                    bp,
                    44,
                    [0xff6fb5, 0xffc24b, 0x7fd1be, 0x7fa8ff, 0xffffff],
                    3,
                    1.2,
                );
                near.forEach((n) => {
                    R.animFx[n] = { t: time, k: "cheer" };
                    icon("heart", animX(n), animZ(n));
                    icon("heart", animX(n) + 0.15, animZ(n));
                });
            }
        }
        // combo trail behind the wheels (rainbow during fever)
        if (G.mode === "play" && (G.fever > 0 || G.combo.n >= 3)) {
            trailCol = trailCol || new THREE.Color();
            if (G.fever > 0) trailCol.setHSL((time * 0.9) % 1, 0.9, 0.62);
            else trailCol.setHex(G.combo.n >= 5 ? 0xffd15c : 0x7fd1be);
            trailAcc += dt * (reduce ? 10 : 34);
            while (trailAcc >= 1) {
                trailAcc -= 1;
                trailDot(bp, trailCol);
            }
        } else trailAcc = 0;
        for (const Q of R.sparks) {
            if (Q.life <= 0) continue;
            Q.life -= dt;
            if (Q.life <= 0) {
                Q.s.visible = false;
                continue;
            }
            Q.v.y -= Q.g * dt;
            Q.s.position.addScaledVector(Q.v, dt);
            const k = Q.life / Q.max,
                sz = Q.size * (0.55 + 0.45 * k);
            Q.s.material.opacity = Math.min(1, k * 1.7);
            Q.s.scale.set(sz, sz, 1);
        }
        for (const pool of [R.hearts, R.wows])
            for (const Q of pool) {
                if (Q.life <= 0) continue;
                Q.life -= dt;
                if (Q.life <= 0) {
                    Q.s.visible = false;
                    continue;
                }
                const e = 1 - Q.life / Q.max,
                    sz =
                        0.22 *
                        Math.min(1, e * 6) *
                        (1 + 0.12 * Math.sin(e * 18));
                Q.s.position.y += dt * 0.45;
                Q.s.scale.set(sz, sz, 1);
                Q.s.material.opacity = Math.min(1, (Q.life / Q.max) * 2.5);
            }
        // spectators: face the rider, idle wiggles, hop when you land
        const list = R.animals[spot] || R.animals.bridge;
        for (const k in R.animals)
            if (R.animals[k] !== list)
                R.animals[k].forEach((g) => {
                    if (g.visible) g.visible = false;
                });
        for (let j = 0; j < ANIM_N; j++) {
            const n = an0 + j,
                g = list[((n % ANIM_N) + ANIM_N) % ANIM_N];
            // 뒤 시점에서는 라이더보다 뒤에 있는 관객이 카메라 바로 앞에 크게 걸리므로 숨긴다.
            if (!animOn(n) || (camMode === "chase" && animX(n) < c0 - 0.5)) {
                g.visible = false;
                continue;
            }
            g.visible = true;
            const x = animX(n),
                z = animZ(n),
                f = R.animFx[n];
            let hop = 0;
            if (f) {
                const e = time - f.t;
                if (f.k === "hop" && e < 0.5)
                    hop = Math.sin((Math.PI * e) / 0.5) * 0.16;
                else if (f.k === "cheer" && e < 1)
                    hop = Math.abs(Math.sin((Math.PI * e) / 0.5)) * 0.22;
                else if (f.k === "startle" && e < 0.55)
                    hop = Math.sin((Math.PI * e) / 0.55) * 0.32;
                else if (e > 1.2) delete R.animFx[n];
            }
            g.position.set(x, hop, z);
            g.rotation.y = clamp(Math.atan2(c0 + 0.3 - x, -z), -1.3, 1.3);
            const u = g.userData;
            if (u.bird) {
                u.head.rotation.x =
                    hop > 0
                        ? 0
                        : Math.max(0, Math.sin(time * 2.2 + n * 1.7) - 0.7) *
                          1.2;
                const flap =
                    hop > 0.02 ? Math.sin(time * 34) * 0.7 + 0.5 : 0.05;
                u.wings.forEach((w) => {
                    w.rotation.z = w.userData.s * flap;
                });
            } else {
                u.tail.rotation.z = Math.sin(time * 3 + n) * 0.45;
                u.head.rotation.z = Math.sin(time * 1.3 + n) * 0.12;
            }
        }
    }

    /* ---------- 3D 그리기 ---------- */
    const CAMS = {
        side: {
            pos: (c) => V(c + 1.5, 1.35, 6.2),
            look: (c) => V(c + 1.5, 0.85, 0),
            fov: 40,
        },
        chase: {
            pos: (c) => V(c - 3.6, 2.05, 2.7),
            look: (c) => V(c + 2.6, 0.7, -0.3),
            fov: 55,
        },
    };
    function limb(m, a, b, r) {
        const d = V().subVectors(b, a),
            len = d.length() || 0.001;
        m.position.copy(a).addScaledVector(d, 0.5);
        m.scale.set(r, len, r);
        m.quaternion.setFromUnitVectors(UP(), d.divideScalar(len));
    }
    function placeInst(inst, i, x, y, z, sx) {
        const d = R.dummy;
        d.position.set(x, y, z);
        d.scale.set(sx || 1, 1, 1);
        d.updateMatrix();
        inst.setMatrixAt(i, d.matrix);
    }

    function scrollGround(c0) {
        R.ground.position.x = c0;
        R.groundTex.offset.x = c0 / 2;
        const n0 = Math.ceil(((c0 - 14) / K + 184) / JOINT);
        for (let i = 0; i < 50; i++)
            placeInst(R.seams, i, ((n0 + i) * JOINT - 184) * K, 0.003, 0.7);
        R.seams.instanceMatrix.needsUpdate = true;
    }

    function renderBridge(c0, time) {
        const SPP = 5.5,
            pb0 = Math.floor(c0 / SPP);
        let base;
        R.wall.position.x = c0;
        R.river.position.x = c0;
        R.deck.position.x = c0;
        R.rail1.position.x = c0;
        R.rail2.position.x = c0;
        R.city.position.x = c0;
        R.sky.offset.x = c0 * 0.0012;
        R.pillars.forEach((g, i) => {
            g.position.x = (pb0 - 3 + i) * SPP + 1.7;
        });
        base = Math.floor((c0 - 15) / 1.2);
        for (let i = 0; i < 60; i++)
            placeInst(R.posts, i, (base + i) * 1.2, 0.5, -4.45);
        R.posts.instanceMatrix.needsUpdate = true;
        base = Math.floor((c0 - 15) / 2.75);
        for (let i = 0; i < 28; i++)
            placeInst(R.beams, i, (base + i) * 2.75, 3.45, -0.6);
        R.beams.instanceMatrix.needsUpdate = true;
        base = Math.floor((c0 - 30) / 1.6);
        for (let i = 0; i < 64; i++) {
            const n = base + i,
                on = hsh(n + 500) > 0.45;
            placeInst(
                R.streaks,
                i,
                n * 1.6,
                -0.78,
                -7 - hsh(n + 800) * 40,
                on ? 0.5 + hsh(n + 300) * 1.4 : 0.0001,
            );
        }
        R.streaks.instanceMatrix.needsUpdate = true;
        R.streakMat.opacity = 0.24 + 0.1 * Math.sin(time * 2.2);
    }

    function renderSea(c0, time) {
        const SPP = 5.5,
            pb0 = Math.floor(c0 / SPP);
        let base;
        R.seaEdge.position.x = c0;
        R.sand.position.x = c0;
        R.sea.position.x = c0;
        R.foam.position.x = c0;
        R.seaSky.position.x = c0;
        R.seaSky.material.map.offset.x = c0 * 0.001;
        R.sRail1.position.x = c0;
        R.sRail2.position.x = c0;
        R.sun.position.set(c0 + 25, 24, -90);
        R.sunCore.position.set(c0 + 25, 24, -89.8);
        R.foamMat.opacity = 0.45 + 0.2 * Math.sin(time * 1.6);
        base = Math.floor((c0 - 15) / 1.2);
        for (let i = 0; i < 60; i++)
            placeInst(R.sPosts, i, (base + i) * 1.2, 0.5, -4.45);
        R.sPosts.instanceMatrix.needsUpdate = true;
        base = Math.floor((c0 - 30) / 1.7);
        for (let i = 0; i < 64; i++) {
            const n = base + i,
                on = hsh(n + 600) > 0.35;
            placeInst(
                R.waves,
                i,
                n * 1.7 + Math.sin(time * 0.6 + n) * 0.3,
                -0.29,
                -11 - hsh(n + 700) * 36,
                on ? 0.6 + hsh(n + 300) * 1.8 : 0.0001,
            );
        }
        R.waves.instanceMatrix.needsUpdate = true;
        R.waveMat.opacity = 0.35 + 0.15 * Math.sin(time * 2.4);
        R.palms.forEach((g, i) => {
            const n = pb0 - 3 + i;
            g.position.x = n * SPP + 1.7;
            g.rotation.y = (hsh(n + 50) - 0.5) * 1.2;
            g.userData.crown.rotation.z = Math.sin(time * 1.3 + n) * 0.05;
        });
    }

    function renderCity(c0, time) {
        const SPP = 5.5,
            pb0 = Math.floor(c0 / SPP);
        let base;
        R.curb.position.x = c0;
        R.road.position.x = c0;
        R.walk2.position.x = c0;
        R.citySky.position.x = c0;
        R.citySky.material.map.offset.x = c0 * 0.001;
        base = Math.floor((c0 - 20) / 3);
        for (let i = 0; i < 40; i++)
            placeInst(R.lanes, i, (base + i) * 3, 0.004, -7.8);
        R.lanes.instanceMatrix.needsUpdate = true;
        const BS = 9,
            bb = Math.floor((c0 - 30) / BS);
        R.blds.forEach((m, i) => {
            const n = bb + i,
                w = 5 + hsh(n + 1) * 3.2,
                h = 7 + hsh(n + 2) * 16,
                d = 5 + hsh(n + 4) * 3;
            m.position.set(n * BS + hsh(n) * 1.5, h / 2, -14 - d / 2);
            m.scale.set(w, h, d);
            m.material = R.bMats[Math.floor(hsh(n + 3) * R.bMats.length)];
        });
        R.trees.forEach((g, i) => {
            g.position.x = (pb0 - 3 + i) * SPP + 1.7;
        });
        R.cLamps.forEach((g, i) => {
            g.position.x = (pb0 - 3 + i) * SPP + 4.45;
        });
    }

    function placeLights(c0) {
        R.dir.position.set(c0 + 3, 6, 5);
        R.dir.target.position.set(c0, 0, 0);
        R.pl.position.set(c0 + 0.6, 2.6, 1.6);
    }

    function renderBoard(dt, time, c0, P) {
        const B = P.B;
        R.bOuter.position.set(B.px, B.py, B.pz);
        R.bOuter.rotation.set(B.roll, B.yaw, B.pitch, B.rotationOrder || "YZX");
        R.bInner.position.set(-B.lx, -B.ly, -B.lz);
        const spin = -c0 / 0.035;
        R.wheels.forEach((w) => {
            w.rotation.z = spin;
        });
        R.boardMats.forEach((m) => {
            m.opacity = P.alpha;
        });
        Object.values(R.riderMats).forEach((m) => {
            m.opacity = P.alpha;
        });

        R.bOuter.updateMatrixWorld(true);
        const bw = V();
        R.bInner.getWorldPosition(bw);
        const lift = Math.max(0, bw.y - 0.09);
        R.shadow.position.set(bw.x, 0.003, bw.z);
        const ss = clamp(1 - lift * 1.5, 0.45, 1);
        R.shadow.scale.set(1.6 * ss, 0.62 * ss, 1);
        R.shadow.material.opacity = (R.shadowBase || 0.6) * P.alpha;
        renderFx(dt, time, c0, bw);
    }

    function tiltRunningShoe(shoe, pitch) {
        // Push-off pivots around the toe contact instead of sinking it into the ground.
        const toe = V(0, -shoe.scale.y, shoe.scale.z * 0.8);
        const contact =
            pitch > 0 ? toe.clone().applyQuaternion(shoe.quaternion) : null;
        shoe.rotateX(pitch);
        if (contact) {
            const tiltedContact = toe.applyQuaternion(shoe.quaternion);
            shoe.position.add(contact.sub(tiltedContact));
        }
    }

    function renderRider(P) {
        const J = P.J,
            r = R.r;
        // Round caps bridge the limb cylinders as the joints bend.
        r.kneeA.position.copy(J.kA);
        r.kneeB.position.copy(J.kB);
        r.elbowL.position.copy(J.eL);
        r.elbowR.position.copy(J.eR);
        r.shoulderL.position.copy(J.shL).lerp(J.S, 0.06);
        r.shoulderR.position.copy(J.shR).lerp(J.S, 0.06);
        limb(r.thA, J.sockA, J.kA, 0.078);
        limb(r.shA, J.kA, J.aA, 0.07);
        limb(r.thB, J.sockB, J.kB, 0.078);
        limb(r.shB, J.kB, J.aB, 0.07);
        const Y = V().subVectors(J.S, J.hip).normalize();
        const X0 = V().subVectors(J.shR, J.shL).normalize();
        const Z = V().crossVectors(X0, Y).normalize();
        const X = V().crossVectors(Y, Z).normalize();
        const q = new THREE.Quaternion().setFromRotationMatrix(
            new THREE.Matrix4().makeBasis(X, Y, Z),
        );
        r.torso.position.copy(J.hip).addScaledVector(Y, 0.27);
        r.torso.quaternion.copy(q);
        r.pelvis.position.copy(J.hip).addScaledVector(Y, 0.02);
        r.pelvis.quaternion.copy(q);
        R.headG.position.copy(J.S).addScaledVector(Y, 0.26);
        R.headG.quaternion.copy(q);
        limb(r.upL, J.shL, J.eL, 0.058);
        limb(r.foL, J.eL, J.hL, 0.05);
        limb(r.upR, J.shR, J.eR, 0.058);
        limb(r.foR, J.eR, J.hR, 0.05);
        r.haL.position.copy(J.hL);
        r.haR.position.copy(J.hR);
        const Zf = V(Z.x, 0, Z.z);
        if (Zf.lengthSq() < 1e-4) Zf.set(0, 0, 1);
        Zf.normalize();
        const Xf = V().crossVectors(UP(), Zf).normalize();
        const qs = new THREE.Quaternion().setFromRotationMatrix(
            new THREE.Matrix4().makeBasis(Xf, UP(), Zf),
        );
        const footA =
            P.footYawA == null
                ? Zf
                : V(Math.sin(P.footYawA), 0, Math.cos(P.footYawA));
        const footB =
            P.footYawB == null
                ? Zf
                : V(Math.sin(P.footYawB), 0, Math.cos(P.footYawB));
        r.shoeA.position
            .copy(J.aA)
            .add(V(0, -0.035, 0))
            .addScaledVector(footA, 0.05);
        r.shoeA.quaternion.copy(qs);
        if (P.footYawA != null)
            r.shoeA.quaternion.setFromAxisAngle(UP(), P.footYawA);
        tiltRunningShoe(r.shoeA, P.footPitchA || 0);
        r.shoeB.position
            .copy(J.aB)
            .add(V(0, -0.035, 0))
            .addScaledVector(footB, 0.05);
        r.shoeB.quaternion.copy(qs);
        if (P.footYawB != null)
            r.shoeB.quaternion.setFromAxisAngle(UP(), P.footYawB);
        tiltRunningShoe(r.shoeB, P.footPitchB || 0);
    }

    function renderPebbles(time) {
        let pi = 0;
        for (const p of G.pebbles) {
            if (pi >= R.pebbles.length) break;
            const rel = p.x - G.worldX;
            if (rel < -200) continue;
            const slot = R.pebbles[pi++];
            slot.m.visible = true;
            slot.m.position.set(p.x * K, 0.035, 0);
            slot.m.rotation.set(p.x, p.x * 0.7, 0);
            const warn = !p.done && rel > 0 && rel < 440 && G.mode === "play";
            slot.ring.visible = warn;
            slot.ring.position.set(p.x * K, 0.006, 0);
            slot.ring.material.opacity = 0.35 + 0.25 * Math.sin(time * 9);
        }
        for (; pi < R.pebbles.length; pi++) {
            R.pebbles[pi].m.visible = false;
            R.pebbles[pi].ring.visible = false;
        }
    }

    function renderCamera(dt, c0, P) {
        const cm = CAMS[camMode],
            tp = cm.pos(c0),
            tl = cm.look(c0),
            a = 1 - Math.exp(-dt * 5);
        if (!posePage || (G.act && G.act.type === "ncbig")) {
            // Follow the displaced landing instead of pulling the rider back to the origin.
            const dx = P.B.px - c0,
                dz = P.B.pz;
            tp.x += dx;
            tp.z += dz;
            tl.x += dx;
            tl.z += dz;
        }
        if (!R.camInit) {
            R.camPos.copy(tp);
            R.camLook.copy(tl);
            camera.fov = cm.fov;
            camera.updateProjectionMatrix();
            R.camInit = true;
        } else {
            R.camPos.lerp(tp, a);
            R.camLook.lerp(tl, a);
        }
        camera.position.copy(R.camPos);
        camera.lookAt(R.camLook);
        if (Math.abs(camera.fov - cm.fov) > 0.01) {
            camera.fov = lerp(camera.fov, cm.fov, a);
            camera.updateProjectionMatrix();
        }
    }

    function render3d(dt, time) {
        const c0 = G.worldX * K;
        scrollGround(c0);
        if (spot === "bridge") renderBridge(c0, time);
        else if (spot === "sea") renderSea(c0, time);
        else renderCity(c0, time);
        placeLights(c0);
        const P = pose3(time);
        renderBoard(dt, time, c0, P);
        renderRider(P);
        renderPebbles(time);
        renderCamera(dt, c0, P);
        renderer.render(scene, camera);
    }

    /* ---------- HUD ---------- */
    const scoreEl = $("#score"),
        timerEl = $("#timer"),
        comboK = $("#combo-k"),
        comboE = $("#combo-e"),
        warnEl = $("#warn"),
        speedEl = $("#speedbar"),
        barEl = $("#bar");
    const bBack = $("#b-back"),
        bFwd = $("#b-fwd"),
        bPush = $("#b-push");
    const pushNote = document.createElement("small");
    pushNote.textContent = "가운데서만 가능";
    pushNote.hidden = true;
    bPush.appendChild(pushNote);
    const tbs = Array.from(document.querySelectorAll(".tb"));
    const tLbl = tbs.map((b) => b.querySelector(".tl")),
        tEn = tbs.map((b) => b.querySelector(".te")),
        tCap = tbs.map((b) => b.querySelector(".tc"));
    const dots = Array.from(document.querySelectorAll("#posi i"));
    let hc = {};
    const fvEl = $("#fever"),
        fvFillEl = $("#fv-fill"),
        fvLEl = $("#fv-l"),
        fvEEl = $("#fv-e"),
        stageEl = $("#stage");
    function setText(node, key, val) {
        if (hc[key] !== val) {
            hc[key] = val;
            node.textContent = val;
        }
    }
    function tog(node, cls, on) {
        if (node.classList.contains(cls) !== on) node.classList.toggle(cls, on);
    }
    function summarize(names, tr) {
        const groups = [];
        for (const n of names) {
            const last = groups[groups.length - 1];
            if (last && last.n === n) last.c++;
            else groups.push({ n, c: 1 });
        }
        const shown = groups
            .slice(-3)
            .map((g) => (tr ? tr(g.n) : g.n) + (g.c > 1 ? "×" + g.c : ""))
            .join(" → ");
        return (groups.length > 3 ? "… " : "") + shown;
    }
    function slotInfo() {
        const A = G.act,
            play = G.mode === "play";
        if (play && A && A.type === "ghost" && A.phase === "run") {
            const b = Math.round(A.run * 90);
            const danceBonus = Math.round((A.run * 90 * 0.7) / 10) * 10;
            return [
                {
                    l: "올라타기",
                    e: "Hop on",
                    c: "+" + (GHOST_BASE_PTS + danceBonus),
                    dim: false,
                    category: "dancing",
                },
                {
                    l: "킥플립 캐치",
                    e: "Kickflip catch",
                    c:
                        A.run < 0.8
                            ? "더 달려 keep running"
                            : "+" + (GHOSTFLIP_BASE_PTS + b),
                    dim: A.run < 0.8,
                    category: "trick",
                },
                {
                    l: "달리는 중",
                    e: "Running",
                    c: (3.2 - A.run).toFixed(1) + "s",
                    dim: true,
                    category: "dancing",
                },
            ];
        }
        syncOffer();
        return offer.map((id) => {
            const tr = TRICKS[id];
            return {
                l: tr.label,
                e: en(tr.label),
                c: tr.cap,
                dim: !play || G.v < tr.minV || !!(A && A.type === "ghost"),
                category: TRICK_DEX_IDS.has(id) ? "trick" : "dancing",
            };
        });
    }
    function hud() {
        setText(scoreEl, "s", fmt(G.score));
        const t = Math.ceil(G.t);
        setText(
            timerEl,
            "t",
            Math.floor(t / 60) + ":" + String(t % 60).padStart(2, "0"),
        );
        const sp = Math.round(G.v * 100);
        if (hc.v !== sp) {
            hc.v = sp;
            speedEl.style.width = sp + "%";
            tog(barEl, "low", G.mode === "play" && G.v < 0.2);
        }
        const c = G.combo,
            tail =
                c.pts > 0 ? "   " + fmt(c.pts) + " × " + Math.max(1, c.n) : "";
        setText(comboK, "ck", c.pts > 0 ? summarize(c.names) + tail : "");
        setText(comboE, "ce", c.pts > 0 ? summarize(c.names, en) : "");
        let w = false;
        if (G.mode === "play")
            for (const p of G.pebbles) {
                const rel = p.x - G.worldX;
                if (!p.done && rel > 0 && rel < 440) {
                    w = true;
                    break;
                }
            }
        if (hc.w !== w) {
            hc.w = w;
            warnEl.hidden = !w;
        }
        const play = G.mode === "play",
            A = G.act,
            ghost = !!(A && A.type === "ghost");
        const slots = slotInfo();
        tbs.forEach((button, i) => {
            button.hidden = !slots[i];
        });
        const trickRow = $("#trickrow");
        if (trickRow) {
            tog(trickRow, "four", slots.length === 4);
            tog(trickRow, "five", slots.length === 5);
        }
        slots.forEach((s, i) => {
            setText(tLbl[i], "tl" + i, s.l);
            setText(tEn[i], "te" + i, s.e);
            setText(tCap[i], "tc" + i, s.c);
            tog(tbs[i], "now", !!s.now);
            tog(tbs[i], "dim", !!s.dim);
            tog(tbs[i], "trick", s.category === "trick");
            tog(tbs[i], "dancing", s.category === "dancing");
        });
        tog(bPush, "dim", !play || !canPush(G.pos) || ghost);
        pushNote.hidden = !play || canPush(G.pos) || ghost;
        tog(bFwd, "dim", !play || G.pos === 3 || ghost);
        tog(bBack, "dim", !play || G.pos === 0 || ghost);
        dots.forEach((d, i) => tog(d, "on", !ghost && i === G.pos));
        const fvOn = play && G.fever > 0,
            fw = fvOn
                ? Math.round((G.fever / FEVER_T) * 100)
                : Math.round((play ? G.gauge : 0) * 100);
        if (hc.fw !== fw) {
            hc.fw = fw;
            fvFillEl.style.width = fw + "%";
        }
        if (hc.fo !== fvOn) {
            hc.fo = fvOn;
            tog(fvEl, "on", fvOn);
            tog(stageEl, "fever", fvOn);
            fvLEl.textContent = fvOn ? "피버 ×2" : "피버";
            fvEEl.textContent = fvOn ? "Fever ×2" : "Fever";
        }
    }

    /* ---------- 세션 · 입력 ---------- */
    const ovTitle = $("#ov-title"),
        ovOver = $("#ov-over"),
        stage = $("#stage");
    function showSetup(msg) {
        if (G.mode === "play") return;
        closeResult();
        ovOver.hidden = true;
        ovTitle.hidden = false;
        stage.classList.add("setup");
        $("#err-title").textContent = msg || "";
        try {
            $("#name-title").focus({ preventScroll: true });
        } catch (e) {}
    }
    function start() {
        if (posePage) return;
        if (!rideTestPage && !X.name) {
            showSetup("닉네임을 적어 주세요 · Enter a name");
            return;
        }
        if (!ok3d) return;
        G = newState("play");
        rollOffer();
        hc = {};
        pops.textContent = "";
        ovTitle.hidden = true;
        ovOver.hidden = true;
        stage.classList.remove("setup");
        unlock();
        closeResult();
        musicStart();
        try {
            stage.focus({ preventScroll: true });
        } catch (e) {}
    }
    function endSession() {
        const A = G.act;
        if (!(A && A.type === "bail")) bank();
        else G.combo = freshCombo();
        G.act = null;
        G.queue = null;
        G.mode = "over";
        G.pos = startPosition;
        G.startFeet = [...startFeet];
        G.spot = spot;
        G.fever = 0;
        const isBest = G.score > best.score;
        if (isBest) best.score = G.score;
        if (G.bestRun > best.combo) best.combo = G.bestRun;
        store();
        renderBests();
        const ttl = titleFor(G.score);
        $("#ov-score").textContent = fmt(G.score);
        $("#ov-badge-k").textContent = "칭호 · " + ttl.ko;
        $("#ov-badge-e").textContent = "Title · " + ttl.en;
        $("#ov-detail").textContent =
            "최고 콤보 " + fmt(G.bestRun) + " · 트릭 " + G.tricks + "개";
        $("#ov-detail-en").textContent =
            "Best combo " + fmt(G.bestRun) + " · " + G.tricks + " tricks";
        $("#ov-new").hidden = G.newLanded.length === 0;
        $("#ov-new-k").textContent = "새로 랜딩: " + G.newLanded.join(", ");
        $("#ov-new-e").textContent =
            "First landings: " + G.newLanded.map(en).join(", ");
        $("#ov-best").hidden = !isBest || G.score === 0;
        nameIns.forEach((i) => {
            i.value = X.name;
        });
        ovOver.hidden = false;
        rankP = recordScore({
            name: X.name,
            score: G.score,
            best_combo: G.bestRun,
            title: ttl.ko,
            spot,
            mode: MODE,
        });
        if (rlinkOn() && G.score > 0) {
            const sess = G;
            Promise.race([rankP, new Promise((r) => setTimeout(r, 3000))])
                .catch(() => {})
                .then(() => (G === sess ? createShare() : null))
                .then(() => {
                    if (G === sess && !$("#result").hidden) showRlink();
                })
                .catch(() => {});
        }
        openResult();
    }

    function bindPad(node, kind) {
        node.addEventListener("pointerdown", (e) => {
            if (e.pointerType === "mouse" && e.button !== 0) return;
            e.preventDefault();
            doInput(kind);
        });
        node.addEventListener("click", (e) => {
            if (e.detail === 0 && performance.now() - lastKey > 300)
                doInput(kind);
        });
        node.addEventListener("contextmenu", (e) => e.preventDefault());
    }
    bindPad(bBack, "back");
    bindPad(bFwd, "fwd");
    bindPad(bPush, "push");
    tbs.forEach((b, i) => bindPad(b, "slot" + i));

    const camBtns = Array.from(document.querySelectorAll("[data-cam]"));
    function renderCam() {
        camBtns.forEach((b) =>
            b.setAttribute("aria-pressed", String(b.dataset.cam === camMode)),
        );
    }
    function setCam(m) {
        camMode = m;
        if (!posePage) store();
        renderCam();
    }
    camBtns.forEach((b) =>
        b.addEventListener("click", () => setCam(b.dataset.cam)),
    );

    const KEYMAP = {
        ArrowLeft: "back",
        ArrowRight: "fwd",
        ArrowUp: "push",
        KeyZ: "push",
        Digit1: "slot0",
        KeyJ: "slot0",
        Space: "slot0",
        Digit2: "slot1",
        KeyK: "slot1",
        Digit4: "slot3",
        Digit5: "slot4",
        Digit3: "slot2",
        KeyL: "slot2",
    };
    document.addEventListener("keydown", (e) => {
        if (posePage) return;
        const tag = e.target && e.target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        if (e.code === "KeyR" && !e.repeat) {
            e.preventDefault();
            start();
            return;
        }
        if (e.code === "KeyV" && !e.repeat) {
            setCam(camMode === "side" ? "chase" : "side");
            return;
        }
        if (G.mode !== "play") {
            if (
                (e.code === "Enter" || e.code === "Space") &&
                tag !== "BUTTON"
            ) {
                e.preventDefault();
                start();
            }
            return;
        }
        const k = KEYMAP[e.code];
        if (!k) return;
        e.preventDefault();
        lastKey = performance.now();
        if (e.repeat) return;
        doInput(k);
    });

    const sndBtn = $("#b-sound");
    function renderSound() {
        sndBtn.setAttribute("aria-pressed", String(!muted));
        $("#snd-k").textContent = muted ? "소리 꺼짐" : "소리 켜짐";
        $("#snd-e").textContent = muted ? "Sound off" : "Sound on";
    }
    sndBtn.addEventListener("click", () => {
        muted = !muted;
        store();
        renderSound();
        if (!muted) unlock();
    });

    const spotBtns = Array.from(document.querySelectorAll("[data-spot]"));
    function renderSpot() {
        spotBtns.forEach((b) =>
            b.setAttribute("aria-pressed", String(b.dataset.spot === spot)),
        );
    }
    function setSpot(s) {
        if (G.mode === "play") return;
        spot = s;
        if (!posePage) store();
        renderSpot();
        if (typeof applySpot === "function") applySpot();
    }
    spotBtns.forEach((b) =>
        b.addEventListener("click", () => setSpot(b.dataset.spot)),
    );
    $("#b-restart").addEventListener("click", () => start());

    const MODE = "3d";
    const APP_NAME = MODE === "3d" ? "보드를 타보자!" : "다리밑 세션";
    const FILE_NAME = MODE === "3d" ? "lets-ride.png" : "darimit-session.png";
    /* ---------- 이름 · 보드 꾸미기 · 칭호 ---------- */
    const XKEY = rideTestPage
        ? "darimit-ride-test-extra.v1"
        : "darimit-extra.v1";
    const DECKS = [
        { id: "maple", ko: "메이플", en: "Maple", c: "#C99A5E" },
        { id: "black", ko: "블랙", en: "Black", c: "#2E2E30" },
        { id: "mint", ko: "민트", en: "Mint", c: "#7FD1BE" },
        { id: "pink", ko: "핑크", en: "Pink", c: "#E98BA8" },
        { id: "sky", ko: "하늘", en: "Sky", c: "#6FA8DC" },
        { id: "red", ko: "빨강", en: "Red", c: "#D9472F" },
    ];
    const WHEELS = [
        { id: "orange", ko: "주황", en: "Orange", c: "#F28C3A" },
        { id: "white", ko: "흰색", en: "White", c: "#F2F0EA" },
        { id: "mint", ko: "민트", en: "Mint", c: "#7FD1BE" },
        { id: "purple", ko: "보라", en: "Purple", c: "#9B7FD1" },
        { id: "yellow", ko: "노랑", en: "Yellow", c: "#E8C547" },
        { id: "black", ko: "검정", en: "Black", c: "#2B2B2B" },
    ];
    const X = {
        name: "",
        deck: "maple",
        wheel: "orange",
        music: true,
        local: [],
    };
    try {
        const o = JSON.parse(localStorage.getItem(XKEY) || "null");
        if (o && typeof o === "object") {
            if (typeof o.name === "string") X.name = o.name.trim().slice(0, 12);
            if (DECKS.some((d) => d.id === o.deck)) X.deck = o.deck;
            if (WHEELS.some((w) => w.id === o.wheel)) X.wheel = o.wheel;
            if (o.music === false) X.music = false;
            if (Array.isArray(o.local))
                X.local = o.local
                    .filter(
                        (r) =>
                            r &&
                            typeof r.name === "string" &&
                            Number.isFinite(r.score),
                    )
                    .slice(0, 30);
        }
    } catch (e) {}
    function saveX() {
        try {
            localStorage.setItem(XKEY, JSON.stringify(X));
        } catch (e) {}
    }
    function deckColor() {
        return (DECKS.find((d) => d.id === X.deck) || DECKS[0]).c;
    }
    function wheelColor() {
        return (WHEELS.find((w) => w.id === X.wheel) || WHEELS[0]).c;
    }
    const TITLES = [
        [0, "뉴비", "Newbie"],
        [3000, "동네 라이더", "Local rider"],
        [8000, "크루 에이스", "Crew ace"],
        [15000, "댄싱 머신", "Dancing machine"],
        [25000, "전설의 라이더", "Legendary rider"],
    ];
    function titleFor(sc) {
        let t = TITLES[0];
        for (const r of TITLES) if (sc >= r[0]) t = r;
        return { ko: t[1], en: t[2] };
    }

    function renderSwatches() {
        for (const [sel, list, key] of [
            ["#sw-deck", DECKS, "deck"],
            ["#sw-wheel", WHEELS, "wheel"],
        ]) {
            const box = $(sel);
            box.textContent = "";
            for (const it of list) {
                const b = el("button", "sw");
                b.type = "button";
                b.style.setProperty("--c", it.c);
                b.title = it.ko + " " + it.en;
                b.setAttribute("aria-label", it.ko + " " + it.en);
                b.setAttribute("aria-pressed", String(X[key] === it.id));
                b.addEventListener("click", () => {
                    if (G.mode === "play") return;
                    X[key] = it.id;
                    saveX();
                    renderSwatches();
                    if (typeof applyLook3d === "function") applyLook3d();
                });
                box.appendChild(b);
            }
        }
    }

    const nameIns = [$("#name-title")];
    nameIns.forEach((i) => {
        i.value = X.name;
    });
    function bindNameForm(formSel, input, errSel) {
        $(formSel).addEventListener("submit", (e) => {
            e.preventDefault();
            if (rideTestPage) {
                start();
                return;
            }
            const v = input.value.trim().slice(0, 12);
            if (!v) {
                $(errSel).textContent = "닉네임을 적어 주세요 · Enter a name";
                input.focus();
                return;
            }
            $(errSel).textContent = "";
            X.name = v;
            saveX();
            nameIns.forEach((i) => {
                i.value = v;
            });
            start();
        });
    }
    bindNameForm("#f-title", nameIns[0], "#err-title");
    $("#again").addEventListener("click", () => start());
    $("#b-setup").addEventListener("click", () => showSetup());

    /* ---------- 랭킹 ---------- */
    const LB = {
        url: "https://eocgviuowuumqigwzztj.supabase.co",
        key: "sb_publishable_sDaNqJtHafIOlGAMjr-WdA_Gj-x1-5o",
    };
    const lbOn = () => !rideTestPage && !!(LB.url && LB.key);
    const lbBase = () => LB.url.replace(/\/+$/, "") + "/rest/v1/scores";
    async function lbFetch() {
        const r = await fetch(
            lbBase() +
                "?select=name,score,best_combo,spot,mode&order=score.desc&limit=200",
            { headers: { apikey: LB.key } },
        );
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
    }
    async function lbSubmit(row) {
        const r = await fetch(lbBase(), {
            method: "POST",
            headers: {
                apikey: LB.key,
                "Content-Type": "application/json",
                Prefer: "return=minimal",
            },
            body: JSON.stringify(row),
        });
        if (!r.ok) throw new Error("HTTP " + r.status);
    }
    const SPOT_NAME = {
        bridge: ["다리 밑", "Under the bridge"],
        sea: ["바닷가", "Seaside"],
        city: ["낮 시티", "City by day"],
    };
    function rankRows(rows) {
        const byName = new Map();
        for (const r of rows) {
            const k = String(r.name || "").trim();
            if (!k || !Number.isFinite(Number(r.score))) continue;
            const cur = byName.get(k);
            if (!cur || Number(r.score) > Number(cur.score)) byName.set(k, r);
        }
        return Array.from(byName.values()).sort(
            (a, b) => Number(b.score) - Number(a.score),
        );
    }
    let rankCache = [];
    function renderRank() {
        const ol = $("#rk-list");
        ol.textContent = "";
        const rows = rankRows(rankCache).slice(0, 20);
        if (!rows.length) {
            const li = el(
                "li",
                "rank-empty",
                "아직 기록이 없어요. 첫 기록을 남겨 보세요.",
            );
            li.appendChild(el("span", "en", "No scores yet. Be the first."));
            ol.appendChild(li);
            return;
        }
        rows.forEach((r, i) => {
            const li = el("li", String(r.name).trim() === X.name ? "me" : "");
            const t = titleFor(Number(r.score)),
                sp = SPOT_NAME[r.spot];
            const who = el("span", "rk-who");
            who.append(
                el("b", "", String(r.name)),
                el(
                    "span",
                    "rk-t",
                    t.ko +
                        " · " +
                        t.en +
                        (sp ? " · " + sp[0] : "") +
                        (r.mode ? " · " + String(r.mode).toUpperCase() : ""),
                ),
            );
            li.append(
                el("span", "rk-n", String(i + 1)),
                who,
                el("span", "rk-s", fmt(Number(r.score))),
            );
            ol.appendChild(li);
        });
    }
    function setNote(ko, enText) {
        const n = $("#rk-note");
        n.textContent = ko;
        n.appendChild(el("span", "en", enText));
    }
    async function refreshRank() {
        if (!lbOn()) {
            rankCache = X.local.slice();
            setNote(
                "이 기기에서 플레이한 기록이에요. 친구 랭킹은 웹사이트 버전에서 켜져요.",
                "Scores from this device. Friend ranking turns on in the website version.",
            );
            renderRank();
            return;
        }
        setNote("불러오는 중…", "Loading…");
        try {
            rankCache = await lbFetch();
            setNote(
                "이 사이트에서 플레이한 모두의 기록이에요. 이름마다 최고 점수만 보여요.",
                "Everyone who played on this site, best score per name.",
            );
        } catch (e) {
            rankCache = X.local.slice();
            setNote(
                "랭킹 서버에 연결하지 못해서 이 기기 기록만 보여요.",
                "Couldn't reach the ranking server, so this shows this device only.",
            );
        }
        renderRank();
    }
    async function recordScore(row) {
        const sess = G;
        X.local.push(row);
        X.local.sort((a, b) => b.score - a.score);
        X.local = X.local.slice(0, 30);
        saveX();
        let pool = X.local,
            online = false;
        if (lbOn()) {
            try {
                if (row.score > 0) await lbSubmit(row);
                rankCache = await lbFetch();
                pool = rankCache;
                online = true;
            } catch (e) {
                rankCache = X.local.slice();
            }
        } else rankCache = X.local.slice();
        renderRank();
        const ranked = rankRows(pool),
            idx = ranked.findIndex((r) => String(r.name).trim() === row.name);
        const others = ranked.filter((r) => String(r.name).trim() !== row.name);
        const myBest = idx >= 0 ? Number(ranked[idx].score) : -1;
        const isBest = row.score >= myBest;
        // rank of THIS run's score among everyone else's best; matches the board when this run is the player's best
        const runN =
            isBest && idx >= 0
                ? idx + 1
                : others.filter((r) => Number(r.score) > row.score).length + 1;
        sess.rank = {
            n: runN,
            of: others.length + 1,
            online,
            isBest,
            bestN: idx + 1,
            best: myBest,
        };
        const pre = online ? "" : "이 기기 ",
            preE = online ? "" : "Device ";
        $("#ov-rank-k").textContent = isBest
            ? pre + "랭킹 " + runN + "위"
            : "이번 판 " +
              runN +
              "위 · 내 최고 기록 " +
              fmt(myBest) +
              "점 " +
              (idx + 1) +
              "위";
        $("#ov-rank-e").textContent = isBest
            ? preE + "Rank #" + runN
            : "This run #" +
              runN +
              " · Your best " +
              fmt(myBest) +
              " is #" +
              (idx + 1);
    }
    $("#rk-refresh").addEventListener("click", refreshRank);

    /* ---------- 결과 카드 ---------- */
    function rrect(g, x, y, w, h, r) {
        g.beginPath();
        g.moveTo(x + r, y);
        g.arcTo(x + w, y, x + w, y + h, r);
        g.arcTo(x + w, y + h, x, y + h, r);
        g.arcTo(x, y + h, x, y, r);
        g.arcTo(x, y, x + w, y, r);
        g.closePath();
    }
    async function makeCard() {
        try {
            await Promise.all([
                document.fonts.load('80px "Black Han Sans"'),
                document.fonts.load('600 40px "IBM Plex Mono"'),
                document.fonts.load('400 30px "IBM Plex Sans KR"'),
                document.fonts.load('600 30px "IBM Plex Sans KR"'),
            ]);
        } catch (e) {}
        const CW = 1080,
            CH = 1350,
            c = document.createElement("canvas");
        c.width = CW;
        c.height = CH;
        const g = c.getContext("2d");
        const F = {
            d: '"Black Han Sans","Apple SD Gothic Neo","Malgun Gothic",sans-serif',
            b: '"IBM Plex Sans KR","Apple SD Gothic Neo","Malgun Gothic",sans-serif',
            m: '"IBM Plex Mono",Menlo,Consolas,monospace',
        };
        g.fillStyle = "#0C1013";
        g.fillRect(0, 0, CW, CH);
        try {
            if (typeof renderSnapshot === "function") renderSnapshot();
            g.drawImage(cv, 0, -65, CW, 810);
        } catch (e) {}
        const gr = g.createLinearGradient(0, 500, 0, 700);
        gr.addColorStop(0, "rgba(12,16,19,0)");
        gr.addColorStop(1, "rgba(12,16,19,1)");
        g.fillStyle = gr;
        g.fillRect(0, 500, CW, 200);
        g.fillStyle = "#0C1013";
        g.fillRect(0, 700, CW, CH - 700);
        g.font = "54px " + F.d;
        const nw = g.measureText(APP_NAME).width;
        g.fillStyle = "rgba(12,16,19,.62)";
        rrect(g, 40, 40, nw + 52, 96, 18);
        g.fill();
        g.fillStyle = "#ECE9E2";
        g.fillText(APP_NAME, 66, 108);
        const ttl = titleFor(G.score),
            sp = SPOT_NAME[spot] || SPOT_NAME.bridge;
        g.fillStyle = "#F2A541";
        g.font = "600 28px " + F.m;
        g.fillText(("Longboard dancing · " + sp[1]).toUpperCase(), 60, 740);
        g.font = "84px " + F.d;
        g.fillText(ttl.ko, 60, 830);
        g.fillStyle = "#8D979D";
        g.font = "400 32px " + F.b;
        g.fillText(ttl.en + " · " + sp[0], 60, 878);
        g.fillStyle = "#ECE9E2";
        g.font = "600 140px " + F.m;
        g.fillText(fmt(G.score), 52, 1012);
        const rk = G.rank;
        if (rk) {
            g.textAlign = "right";
            g.fillStyle = "#F2A541";
            g.font = "600 28px " + F.b;
            g.fillText(
                rk.isBest
                    ? rk.online
                        ? "현재 순위 · RANK"
                        : "이 기기 순위 · DEVICE RANK"
                    : "이번 판 순위 · THIS RUN",
                CW - 60,
                900,
            );
            g.font = "128px " + F.d;
            g.fillText(rk.n + "위", CW - 60, 1012);
            g.fillStyle = "#ECE9E2";
            g.font = "400 34px " + F.b;
            g.fillText(rk.of + "명 중", CW - 60, 1064);
            g.fillStyle = "#8D979D";
            g.font = "400 26px " + F.b;
            g.fillText(
                rk.isBest
                    ? "#" + rk.n + " of " + rk.of
                    : "내 최고 " + rk.bestN + "위 · My best #" + rk.bestN,
                CW - 60,
                1102,
            );
            g.textAlign = "left";
        }
        g.font = "400 34px " + F.b;
        g.fillText(
            "최고 콤보 " + fmt(G.bestRun) + " · 트릭 " + G.tricks + "개",
            60,
            1064,
        );
        g.fillStyle = "#8D979D";
        g.font = "400 26px " + F.b;
        g.fillText(
            "Best combo " + fmt(G.bestRun) + " · " + G.tricks + " tricks",
            60,
            1102,
        );
        let x = 60,
            y = 1126;
        g.font = "600 26px " + F.b;
        for (const lb of G.landedSet) {
            const w = g.measureText(lb).width + 34;
            if (x + w > CW - 60) {
                x = 60;
                y += 56;
            }
            if (y > 1190) break;
            g.fillStyle = "rgba(242,165,65,.16)";
            rrect(g, x, y, w, 44, 22);
            g.fill();
            g.fillStyle = "#F2C27A";
            g.fillText(lb, x + 17, y + 31);
            x += w + 10;
        }
        g.fillStyle = "#252D34";
        g.fillRect(60, CH - 92, CW - 120, 2);
        g.fillStyle = "#ECE9E2";
        g.font = "600 32px " + F.b;
        g.fillText(X.name || "", 60, CH - 40);
        g.textAlign = "right";
        g.fillStyle = "#8D979D";
        g.font = "500 26px " + F.m;
        g.fillText("made by @cloud._.sea", CW - 60, CH - 42);
        g.textAlign = "left";
        return c;
    }
    let cardBlob = null,
        rankP = null;
    async function openResult() {
        $("#result").hidden = false;
        const img = $("#card-img");
        img.removeAttribute("src");
        cardBlob = null;
        $("#b-share").hidden = true;
        $("#copy-status").textContent = "";
        showRlink();
        try {
            $("#b-close").focus({ preventScroll: true });
        } catch (e) {}
        const sess = G;
        if (rankP && sess.rank === undefined) {
            try {
                await Promise.race([
                    rankP,
                    new Promise((r) => setTimeout(r, 3000)),
                ]);
            } catch (e) {}
        }
        if (G !== sess || $("#result").hidden) return;
        try {
            const c = await makeCard();
            img.src = c.toDataURL("image/png");
            cardBlob = await new Promise((res) => c.toBlob(res, "image/png"));
            const file = cardBlob
                ? new File([cardBlob], FILE_NAME, { type: "image/png" })
                : null;
            $("#b-share").hidden = !(
                file &&
                navigator.canShare &&
                navigator.canShare({ files: [file] })
            );
        } catch (e) {}
    }
    function closeResult() {
        $("#result").hidden = true;
    }
    $("#b-card").addEventListener("click", openResult);
    $("#b-close").addEventListener("click", () => {
        closeResult();
        try {
            $("#again").focus({ preventScroll: true });
        } catch (e) {}
    });
    $("#result").addEventListener("click", (e) => {
        if (e.target === $("#result")) closeResult();
    });
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && !$("#result").hidden) closeResult();
    });
    $("#b-share").addEventListener("click", async () => {
        if (!cardBlob) return;
        const link = inArtifact
            ? ""
            : (rlink && rlink.sess === G && rlink.url) || shareUrl();
        const data = {
            files: [new File([cardBlob], FILE_NAME, { type: "image/png" })],
        };
        if (link) data.text = link;
        try {
            await navigator.share(data);
        } catch (e) {}
    });
    $("#b-save").addEventListener("click", async () => {
        if (!cardBlob) return;
        try {
            const dl =
                window.claude && typeof window.claude.use === "function"
                    ? await window.claude.use("downloads")
                    : null;
            if (dl) {
                await dl.save({ filename: FILE_NAME, data: cardBlob });
                return;
            }
        } catch (e) {
            if (e && (e.code === "declined" || e.code === "rate_limited"))
                return;
        }
        try {
            const a = document.createElement("a");
            a.href = URL.createObjectURL(cardBlob);
            a.download = FILE_NAME;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        } catch (e) {}
    });

    /* ---------- 링크 공유 ---------- */
    // 지금 열린 사이트 주소를 그대로 쓴다 (Vercel 주소가 바뀌어도, 미리보기 배포에서도 맞게 동작).
    const SITE_URL = location.origin + "/";
    const inArtifact = !!(
        window.claude && typeof window.claude.use === "function"
    );
    const shareUrl = () =>
        SITE_URL ||
        location.origin + location.pathname.replace(/(index|3d)\.html$/, "");
    function scoreText() {
        const t = titleFor(G.score),
            who = X.name ? X.name + " " : "";
        return (
            APP_NAME +
            " " +
            who +
            "점수 " +
            fmt(G.score) +
            "점 (" +
            t.ko +
            "). 너도 타 봐!\n" +
            "Let's Ride the Board! " +
            who +
            "scored " +
            fmt(G.score) +
            " (" +
            t.en +
            "). Your turn!"
        );
    }
    const inviteText = () =>
        APP_NAME +
        " 30초 롱보드 댄싱 게임\nLet's Ride the Board! A 30-second longboard dancing game";
    async function copyLink(statusSel) {
        const url = shareUrl(),
            st = $(statusSel);
        try {
            await navigator.clipboard.writeText(url);
            st.textContent = "링크를 복사했어요 · Link copied";
        } catch (e) {
            st.textContent = url;
        }
    }
    async function shareLink(text, statusSel) {
        if (navigator.share) {
            try {
                await navigator.share({
                    title: APP_NAME,
                    text,
                    url: shareUrl(),
                });
                return;
            } catch (e) {
                if (e && e.name === "AbortError") return;
            }
        }
        copyLink(statusSel);
    }
    if (!inArtifact) $("#b-invite").hidden = false;
    $("#b-invite").addEventListener("click", () =>
        shareLink(inviteText(), "#invite-status"),
    );

    /* ---------- 결과 링크 (/s/<id>: 카톡 미리보기에 결과 사진) ---------- */
    const rlinkOn = () => !inArtifact && lbOn() && !!SITE_URL;
    let rlink = null;
    function rid() {
        const A = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789",
            b = new Uint8Array(10);
        crypto.getRandomValues(b);
        return Array.from(b, (x) => A[x % A.length]).join("");
    }
    function rankLine(rk) {
        if (!rk) return null;
        return rk.isBest === false
            ? {
                  ko: "이번 판 " + rk.n + "위 · " + rk.of + "명 중",
                  en: "This run #" + rk.n + " of " + rk.of,
              }
            : {
                  ko: "랭킹 " + rk.n + "위 · " + rk.of + "명 중",
                  en: "Rank #" + rk.n + " of " + rk.of,
              };
    }
    // 1200x630 link-preview image
    async function makeOg(sess) {
        try {
            await Promise.all([
                document.fonts.load('80px "Black Han Sans"'),
                document.fonts.load('600 40px "IBM Plex Mono"'),
                document.fonts.load('600 30px "IBM Plex Sans KR"'),
            ]);
        } catch (e) {}
        const W = 1200,
            H = 630,
            c = document.createElement("canvas");
        c.width = W;
        c.height = H;
        const g = c.getContext("2d");
        const F = {
            d: '"Black Han Sans","Apple SD Gothic Neo","Malgun Gothic",sans-serif',
            b: '"IBM Plex Sans KR","Apple SD Gothic Neo","Malgun Gothic",sans-serif',
            m: '"IBM Plex Mono",Menlo,Consolas,monospace',
        };
        g.fillStyle = "#0C1013";
        g.fillRect(0, 0, W, H);
        try {
            if (typeof renderSnapshot === "function") renderSnapshot();
            const sw = cv.width,
                sh = cv.height,
                tw = 720,
                k = Math.max(tw / sw, H / sh),
                w = tw / k,
                h = H / k;
            g.drawImage(cv, (sw - w) / 2, (sh - h) / 2, w, h, 0, 0, tw, H);
        } catch (e) {}
        const gr = g.createLinearGradient(440, 0, 720, 0);
        gr.addColorStop(0, "rgba(12,16,19,0)");
        gr.addColorStop(1, "rgba(12,16,19,1)");
        g.fillStyle = gr;
        g.fillRect(440, 0, 280, H);
        g.fillStyle = "#0C1013";
        g.fillRect(720, 0, W - 720, H);
        const x = 650,
            ttl = titleFor(sess.score),
            sp = SPOT_NAME[sess.spot || spot] || SPOT_NAME.bridge;
        g.fillStyle = "#F2A541";
        g.font = "30px " + F.d;
        g.fillText(APP_NAME, x, 96);
        g.fillStyle = "#ECE9E2";
        g.font = "600 40px " + F.b;
        g.fillText(X.name || "", x, 160);
        let fs = 120;
        g.font = "600 " + fs + "px " + F.m;
        while (g.measureText(fmt(sess.score)).width > 500 && fs > 70) {
            fs -= 6;
            g.font = "600 " + fs + "px " + F.m;
        }
        g.fillText(fmt(sess.score), x - 6, 286);
        g.fillStyle = "#F2A541";
        g.font = "58px " + F.d;
        g.fillText(ttl.ko, x, 366);
        g.fillStyle = "#8D979D";
        g.font = "400 26px " + F.b;
        g.fillText(ttl.en + " · " + sp[0], x, 408);
        const rl = rankLine(sess.rank);
        if (rl) {
            g.font = "600 28px " + F.b;
            const t = rl.ko,
                tw2 = g.measureText(t).width;
            g.fillStyle = "#F2A541";
            rrect(g, x, 440, tw2 + 36, 50, 25);
            g.fill();
            g.fillStyle = "#1A1206";
            g.fillText(t, x + 18, 475);
            g.fillStyle = "#8D979D";
            g.font = "400 22px " + F.b;
            g.fillText(rl.en, x, 520);
        }
        g.fillStyle = "#252D34";
        g.fillRect(x, 552, W - x - 60, 2);
        g.fillStyle = "#8D979D";
        g.font = "500 22px " + F.m;
        g.fillText(
            (SITE_URL || "").replace(/^https?:\/\//, "").replace(/\/$/, ""),
            x,
            594,
        );
        g.textAlign = "right";
        g.fillText("@cloud._.sea", W - 60, 594);
        g.textAlign = "left";
        return c;
    }
    function createShare() {
        const sess = G;
        if (rlink && rlink.sess === sess) return rlink.p;
        const id = rid(),
            rec = { sess, url: null, p: null };
        rlink = rec;
        rec.p = (async () => {
            const c = await makeOg(sess);
            const blob = await new Promise((res) =>
                c.toBlob(res, "image/jpeg", 0.88),
            );
            if (!blob) throw new Error("image");
            const base = LB.url.replace(/\/+$/, "");
            let r = await fetch(
                base + "/storage/v1/object/cards/" + id + ".jpg",
                {
                    method: "POST",
                    headers: { apikey: LB.key, "Content-Type": "image/jpeg" },
                    body: blob,
                },
            );
            if (!r.ok) throw new Error("upload " + r.status);
            const ttl = titleFor(sess.score),
                rk = sess.rank;
            r = await fetch(base + "/rest/v1/shares", {
                method: "POST",
                headers: {
                    apikey: LB.key,
                    "Content-Type": "application/json",
                    Prefer: "return=minimal",
                },
                body: JSON.stringify({
                    id,
                    name: X.name,
                    score: sess.score,
                    best_combo: sess.bestRun,
                    tricks: sess.tricks,
                    title: ttl.ko,
                    title_en: ttl.en,
                    spot: sess.spot || spot,
                    rank_n: rk ? rk.n : null,
                    rank_of: rk ? rk.of : null,
                }),
            });
            if (!r.ok) throw new Error("row " + r.status);
            rec.url = SITE_URL + "s/" + id;
            return rec.url;
        })();
        rec.p.catch(() => {
            if (rlink === rec) rlink = null;
        });
        return rec.p;
    }
    function showRlink() {
        $("#b-rlink").hidden = !rlinkOn();
        const has = !!(rlink && rlink.sess === G && rlink.url);
        $("#res-link").hidden = !has;
        if (has) $("#rlink-url").value = rlink.url;
    }
    async function copyText(t) {
        try {
            await navigator.clipboard.writeText(t);
            return true;
        } catch (e) {}
        try {
            const i = $("#rlink-url");
            i.focus();
            i.select();
            return document.execCommand("copy");
        } catch (e) {
            return false;
        }
    }
    const COPIED =
        "링크를 복사했어요. 오픈채팅방에 붙여넣어 보세요 · Link copied. Paste it in any chat";
    $("#b-rlink").addEventListener("click", async () => {
        const st = $("#copy-status"),
            btn = $("#b-rlink");
        const ready = rlink && rlink.sess === G && rlink.url;
        if (ready) {
            // link already made: open the share sheet right away (still inside the tap)
            if (navigator.share) {
                try {
                    await navigator.share({ url: ready });
                    return;
                } catch (e) {
                    if (e && e.name === "AbortError") return;
                }
            }
            st.textContent = (await copyText(ready))
                ? COPIED
                : "아래 링크를 복사해서 붙여넣어 주세요 · Copy the link below";
            return;
        }
        btn.disabled = true;
        st.textContent = "링크 준비 중… · Getting your link ready…";
        try {
            const url = await createShare();
            showRlink();
            st.textContent = (await copyText(url))
                ? COPIED
                : "아래 링크를 복사해서 붙여넣어 주세요 · Copy the link below and paste it in any chat";
        } catch (e) {
            st.textContent =
                "링크를 만들지 못했어요. 다시 눌러 주세요 · Couldn't make the link. Try again";
        }
        btn.disabled = false;
    });
    $("#b-rlink-copy").addEventListener("click", async () => {
        const u = $("#rlink-url").value;
        if (!u) return;
        $("#copy-status").textContent = (await copyText(u))
            ? "링크를 복사했어요 · Link copied"
            : u;
    });

    // opened from someone's result link: show their record on the start screen and use their spot
    (function () {
        try {
            const d = document.getElementById("challenge-data");
            if (!d) return;
            const c = JSON.parse(d.textContent);
            if (!c || typeof c.name !== "string" || !Number.isFinite(c.score))
                return;
            const p = $("#challenge");
            p.textContent =
                c.name +
                "의 기록 " +
                fmt(c.score) +
                "점" +
                (c.title ? " · " + c.title : "") +
                ". 이겨 봐!";
            p.appendChild(
                el(
                    "span",
                    "en",
                    "Beat " +
                        c.name +
                        "'s " +
                        fmt(c.score) +
                        (c.title_en ? " (" + c.title_en + ")" : ""),
                ),
            );
            p.hidden = false;
            if (c.spot === "bridge" || c.spot === "sea" || c.spot === "city")
                setSpot(c.spot);
        } catch (e) {}
    })();

    /* ---------- 배경음악 (스팟별) ---------- */
    const MUSIC = {
        bridge: {
            bpm: 78,
            swing: 0.16,
            chords: [
                [50, 53, 57, 60],
                [50, 53, 55, 59],
                [48, 52, 55, 59],
                [48, 52, 55, 57],
            ],
            bass: [38, 43, 36, 45],
        },
        sea: {
            bpm: 100,
            swing: 0,
            chords: [
                [48, 52, 55, 59],
                [48, 52, 55, 57],
                [50, 53, 57, 60],
                [50, 53, 55, 59],
            ],
            bass: [36, 45, 38, 43],
        },
        city: {
            bpm: 112,
            swing: 0,
            chords: [
                [53, 57, 60, 64],
                [52, 56, 59, 62],
                [52, 55, 57, 60],
                [53, 55, 58, 62],
            ],
            bass: [41, 40, 45, 43],
        },
    };
    const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
    const mus = { on: false, next: 0, step: 0, timer: 0, out: null };
    function mOsc(type, f, t, a, d, v, dest, detune) {
        const o = actx.createOscillator(),
            g = actx.createGain();
        o.type = type;
        o.frequency.setValueAtTime(f, t);
        if (detune) o.detune.value = detune;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(v, t + a);
        g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
        o.connect(g);
        g.connect(dest || mus.out);
        o.start(t);
        o.stop(t + a + d + 0.05);
    }
    function mNoise(t, type, f, q, v, d) {
        const s = actx.createBufferSource();
        s.buffer = nbuf;
        const fl = actx.createBiquadFilter();
        fl.type = type;
        fl.frequency.value = f;
        fl.Q.value = q;
        const g = actx.createGain();
        g.gain.setValueAtTime(v, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + d);
        s.connect(fl);
        fl.connect(g);
        g.connect(mus.out);
        s.start(t, Math.random() * 0.5);
        s.stop(t + d + 0.02);
    }
    function mKick(t, v) {
        const o = actx.createOscillator(),
            g = actx.createGain();
        o.frequency.setValueAtTime(130, t);
        o.frequency.exponentialRampToValueAtTime(48, t + 0.12);
        g.gain.setValueAtTime(v, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
        o.connect(g);
        g.connect(mus.out);
        o.start(t);
        o.stop(t + 0.35);
    }
    function mKeys(t, notes, dur, v, cutoff) {
        const lp = actx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = cutoff;
        lp.connect(mus.out);
        notes.forEach((n) => {
            mOsc("sine", mtof(n), t, 0.02, dur, v, lp);
            mOsc("triangle", mtof(n), t, 0.02, dur * 0.7, v * 0.35, lp, 6);
        });
    }
    function mBass(t, n, dur, v) {
        const lp = actx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = 900;
        lp.connect(mus.out);
        mOsc("triangle", mtof(n), t, 0.01, dur, v, lp);
        mOsc("sine", mtof(n + 12), t, 0.01, dur * 0.8, v * 0.4, lp);
    }
    function mPluck(t, n, v) {
        mOsc("sine", mtof(n), t, 0.005, 0.35, v);
        mOsc("sine", mtof(n) * 4, t, 0.003, 0.08, v * 0.25);
    }
    function playStep(S, step, t) {
        const s = step % 16,
            bar = Math.floor(step / 16) % 4,
            ch = S.chords[bar],
            root = S.bass[bar],
            beat = 60 / S.bpm;
        if (spot === "bridge") {
            if (s === 0 || s === 7 || s === 10) mKick(t, 0.8);
            if (s === 4 || s === 12)
                mNoise(t, "bandpass", 1800, 0.8, 0.35, 0.18);
            if (s % 2 === 0)
                mNoise(
                    t,
                    "highpass",
                    7000,
                    0.7,
                    s % 4 === 0 ? 0.1 : 0.07,
                    0.04,
                );
            if (s === 0) mKeys(t, ch, beat * 1.8, 0.05, 1300);
            if (s === 10) mKeys(t, ch, beat * 1.2, 0.035, 1100);
            if (s === 0) mBass(t, root, beat * 1.4, 0.28);
            if (s === 7) mBass(t, root + 7, beat * 0.5, 0.2);
            if (s === 10) mBass(t, root, beat * 0.9, 0.24);
            if (Math.random() < 0.25)
                mNoise(
                    t + Math.random() * 0.1,
                    "highpass",
                    3000,
                    0.5,
                    0.03,
                    0.01,
                );
        } else if (spot === "sea") {
            if (s === 0 || s === 8) mKick(t, 0.5);
            if (s === 4 || s === 12) {
                mNoise(t, "bandpass", 2600, 2, 0.18, 0.03);
                mOsc("sine", 820, t, 0.002, 0.04, 0.05);
            }
            mNoise(t, "bandpass", 5200, 1.2, s % 2 ? 0.05 : 0.09, 0.05);
            if (s % 2 === 0) {
                const seq = [0, 1, 2, 3, 2, 1, 2, 3];
                mPluck(t, ch[seq[(s / 2) % 8]] + 12, 0.09);
            }
            if (s === 0) mKeys(t, ch, beat * 3.6, 0.03, 1600);
            if (s === 0) mBass(t, root, beat * 1.3, 0.26);
            if (s === 6) mBass(t, root, beat * 0.5, 0.2);
            if (s === 8) mBass(t, root + 7, beat * 1.2, 0.22);
            if (s === 12) mBass(t, root + 12, beat * 0.5, 0.18);
        } else {
            if (s % 4 === 0) mKick(t, 0.75);
            if (s === 4 || s === 12) {
                mNoise(t, "bandpass", 1600, 0.7, 0.32, 0.14);
                mNoise(t + 0.012, "bandpass", 1200, 0.9, 0.18, 0.08);
            }
            if (s % 2 === 0)
                mNoise(
                    t,
                    "highpass",
                    8000,
                    0.7,
                    s % 4 === 2 ? 0.09 : 0.06,
                    s % 4 === 2 ? 0.14 : 0.035,
                );
            const bp = { 0: 0, 3: 12, 6: 0, 8: 7, 10: 12, 13: 0 };
            if (bp[s] !== undefined) mBass(t, root + bp[s], beat * 0.4, 0.27);
            if (s === 2 || s === 6 || s === 10 || s === 14)
                mKeys(
                    t,
                    ch.map((n) => n + 12),
                    beat * 0.25,
                    0.03,
                    2600,
                );
            if ((bar === 1 || bar === 3) && s % 3 === 0 && s < 12)
                mPluck(t, ch[(s / 3) % 4] + 24, 0.07);
        }
        if (G.fever > 0 && G.mode === "play") {
            if (s % 2 === 1) mPluck(t, ch[(s >> 1) % 4] + 24, 0.06);
            if (s % 4 === 2) mNoise(t, "highpass", 9000, 0.6, 0.07, 0.03);
        }
    }
    function musSched() {
        if (!mus.on || !actx) return;
        const S = MUSIC[spot] || MUSIC.bridge,
            spb = 60 / S.bpm / 4,
            now = actx.currentTime;
        if (mus.next < now - 0.05) mus.next = now + 0.05;
        while (mus.next < now + 0.15) {
            const t = mus.next + (mus.step % 2 === 1 ? S.swing * spb : 0);
            try {
                playStep(S, mus.step, t);
            } catch (e) {}
            mus.step = (mus.step + 1) % 64;
            mus.next += spb;
        }
    }
    function musicStart() {
        if (mus.on || !X.music) return;
        const c = ac(true);
        if (!c) return;
        if (!mus.out) {
            mus.out = c.createGain();
            mus.out.connect(c.destination);
        }
        mus.out.gain.cancelScheduledValues(c.currentTime);
        mus.out.gain.setValueAtTime(0.0001, c.currentTime);
        mus.out.gain.exponentialRampToValueAtTime(0.5, c.currentTime + 0.6);
        mus.on = true;
        mus.next = c.currentTime + 0.1;
        mus.step = 0;
        mus.timer = setInterval(musSched, 25);
        musSched();
    }
    function musicStop() {
        if (!mus.on) return;
        mus.on = false;
        clearInterval(mus.timer);
        if (mus.out && actx) {
            mus.out.gain.cancelScheduledValues(actx.currentTime);
            mus.out.gain.setTargetAtTime(0.0001, actx.currentTime, 0.15);
        }
    }
    const musBtn = $("#b-music");
    function renderMusic() {
        musBtn.setAttribute("aria-pressed", String(X.music));
        $("#mus-k").textContent = X.music ? "음악 켜짐" : "음악 꺼짐";
        $("#mus-e").textContent = X.music ? "Music on" : "Music off";
    }
    musBtn.addEventListener("click", () => {
        X.music = !X.music;
        saveX();
        renderMusic();
        if (X.music) musicStart();
        else musicStop();
    });
    document.addEventListener("visibilitychange", () => {
        if (!actx) return;
        try {
            if (document.hidden) actx.suspend();
            else actx.resume();
        } catch (e) {}
    });

    /* ---------- 자세 미리보기 (pose.html) ---------- */
    const POSE_DEMOS = [
        { id: "tail", group: "서기", label: "테일", en: "Tail", pos: 0 },
        {
            id: "midb",
            group: "서기",
            label: "가운데 뒤",
            en: "Rear middle",
            pos: 1,
        },
        {
            id: "midf",
            group: "서기",
            label: "가운데 앞",
            en: "Front middle",
            pos: 2,
        },
        { id: "nose", group: "서기", label: "노즈", en: "Nose", pos: 3 },
        {
            id: "step",
            group: "댄싱",
            label: "크로스스텝",
            en: "Cross-step",
            pos: 0,
            act: { type: "step", from: 0, to: 1, dur: 480 },
        },
        {
            id: "push",
            group: "댄싱",
            label: "푸시",
            en: "Push",
            pos: 1,
            act: { type: "push", dur: pushDuration, boosted: false },
        },
        {
            id: "popshuv",
            group: "트릭",
            label: "팝샤빗",
            en: "Pop shove-it",
            pos: 0,
            trick: "popshuv",
        },
        {
            id: "varialkickflip",
            group: "트릭",
            label: "베리얼 킥플립",
            en: "Varial kickflip",
            pos: 0,
            trick: "varialkickflip",
        },
        {
            id: "hardflip",
            group: "트릭",
            label: "하드 플립",
            en: "Hard flip",
            pos: 0,
            trick: "hardflip",
        },
        {
            id: "frontpop",
            group: "트릭",
            label: "프론팝",
            en: "Front pop",
            pos: 0,
            trick: "frontpop",
        },
        {
            id: "shuv",
            group: "트릭",
            label: "셔빗",
            en: "Shove-it",
            pos: 3,
            trick: "shuv",
        },
        {
            id: "kickflip",
            group: "트릭",
            label: "킥플립",
            en: "Kickflip",
            pos: 0,
            act: { type: "kickflip", dur: 1400 },
        },
        {
            id: "heelflip",
            group: "트릭",
            label: "힐플립",
            en: "Heelflip",
            pos: 0,
            act: { type: "heelflip", dur: 1400 },
        },
        {
            id: "bigspin",
            group: "트릭",
            label: "빅스핀",
            en: "Big spin",
            pos: 3,
            trick: "bigspin",
        },
        {
            id: "biggerspin",
            group: "트릭",
            label: "비거스핀",
            en: "Bigger spin",
            pos: 3,
            trick: "biggerspin",
        },
        {
            id: "step360",
            group: "댄싱",
            label: "360 스텝",
            en: "360 step",
            pos: 1,
            trick: "step360",
        },
        {
            id: "step180",
            group: "댄싱",
            label: "180 스텝",
            en: "180 step",
            pos: 1,
            trick: "step180",
        },
        {
            id: "nocomply",
            group: "트릭",
            label: "노컴플라이",
            en: "No comply",
            pos: 0,
            trick: "nocomply",
            dur: 1150,
        },
        {
            id: "ncbig",
            group: "트릭",
            label: "노컴 빅스핀",
            en: "No comply big spin",
            pos: 3,
            trick: "ncbig",
            dur: 1500,
        },
        {
            id: "ghost",
            group: "댄싱",
            label: "고스트라이드",
            en: "Ghost ride",
            pos: 1,
            ghost: "jump",
        },
        {
            id: "ghostflip",
            group: "트릭",
            label: "고스트라이드 킥플립",
            en: "Ghost ride kickflip",
            pos: 1,
            ghost: "flip",
        },
        {
            id: "pan",
            group: "댄싱",
            label: "피터팬",
            en: "Peter Pan",
            pos: 2,
            trick: "pan",
        },
        {
            id: "mango",
            group: "댄싱",
            label: "망고",
            en: "Mango",
            pos: 2,
            trick: "mango",
        },
        {
            id: "pirouette",
            group: "댄싱",
            label: "피루엣",
            en: "Pirouette",
            pos: 2,
            trick: "pirouette",
        },
        {
            id: "varial",
            group: "댄싱",
            label: "바디 배리얼",
            en: "Body varial",
            pos: 2,
            trick: "varial",
        },
        {
            id: "pivot",
            group: "트릭",
            label: "180 피봇",
            en: "180 pivot",
            pos: 3,
            trick: "pivot",
        },
    ];
    let poseSpec = null;
    let poseFacing = 0;
    function makePose(spec) {
        if (spec.ghost)
            return {
                type: "ghost",
                phase: "off",
                dur: 280,
                el: 0,
                prevE: 0,
                run: 0,
                cyc: 0,
                stepIdx: 0,
                fromPos: spec.pos,
                finish: spec.ghost,
                need: spec.ghost === "flip" ? 0.9 : 0.65,
            };
        if (spec.trick)
            return {
                type: spec.trick,
                el: 0,
                prevE: 0,
                dur: spec.dur || TRICKS[spec.trick].dur,
            };
        if (spec.act) return Object.assign({ el: 0, prevE: 0 }, spec.act);
        return null;
    }
    function replayPose() {
        if (!poseSpec) return;
        G.pos = poseSpec.pos;
        G.facing = poseFacing;
        G.crossStepStance = false;
        G.startFeet =
            poseSpec.act?.type === "step"
                ? [...crossStepPositions[poseSpec.act.from]]
                : null;
        G.act = makePose(poseSpec);
    }
    function playPose(id, facing = poseFacing) {
        const spec = POSE_DEMOS.find((p) => p.id === id);
        if (!spec) return;
        poseSpec = spec;
        poseFacing = facing === 1 ? 1 : 0;
        G.mode = "pose";
        G.crossStepStance = false;
        G.startFeet =
            spec.act?.type === "step"
                ? [...crossStepPositions[spec.act.from]]
                : null;
        G.queue = null;
        G.shake = 0;
        G.facing = poseFacing;
        G.pos = spec.pos;
        G.act = makePose(spec);
    }
    function advanceGhost(A, dt) {
        if (A.phase === "off") {
            A.cyc += dt * 9;
            if (A.el >= A.dur) {
                A.phase = "run";
                A.el = 0;
                A.dur = 1600;
                A.run = 0;
            }
            return;
        }
        if (A.phase === "run") {
            A.cyc += dt * (8 + G.v * 9);
            A.run += dt;
            if (A.run >= A.need) {
                A.phase = A.finish;
                A.el = 0;
                A.dur = A.finish === "flip" ? 660 : 380;
            }
            return;
        }
        if (A.el >= A.dur + 480) replayPose();
    }
    function stepPose(dt) {
        G.v = 0.32;
        G.worldX += G.v * SPEED * dt;
        const A = G.act;
        if (!A) return;
        A.el += dt * 1000;
        if (A.type === "pivot") {
            const e = pivotSpin(clamp(A.el / A.dur, 0, 1));
            G.worldX += PIVOT_SHIFT * (e - (A.prevE || 0));
            A.prevE = e;
        }
        if (A.type === "step" && A.el >= A.dur) {
            const path = [0, 1, 2, 3, 2, 1, 0];
            const index = (A.pathIndex || 0) + 1;
            const next = index % (path.length - 1);
            G.pos = A.to;
            G.startFeet = [...crossStepPositions[A.to]];
            G.crossStepStance = true;
            G.act = {
                type: "step",
                from: G.pos,
                to: path[next + 1],
                dur: A.dur,
                el: A.el - A.dur,
                prevE: 0,
                pathIndex: next,
            };
        } else if (A.type === "ghost") advanceGhost(A, dt);
        else if (A.type === "ncbig") {
            // Keep the landing direction and position; clicking the demo replays it.
            A.el = Math.min(A.el, A.dur + 480);
        } else if (A.el >= A.dur + 480) replayPose();
    }

    /* ---------- 시작 ---------- */
    renderBests();
    renderDex();
    renderSound();
    renderSpot();
    renderSwatches();
    renderMusic();
    if (!posePage && !rideTestPage) refreshRank();
    renderCam();
    hud();
    if (!ok3d) {
        ovTitle.hidden = true;
        $("#ov-err").hidden = false;
        return;
    }
    if (posePage) {
        G.mode = "pose";
        G.v = 0.32;
        ovTitle.hidden = true;
        ovOver.hidden = true;
        stage.classList.remove("setup");
    }
    build();
    applySpot();
    applyLook3d();
    function resize() {
        const w = Math.max(1, stage.clientWidth),
            h = Math.max(1, stage.clientHeight);
        renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
    }
    resize();
    if (window.ResizeObserver) new ResizeObserver(resize).observe(stage);
    else window.addEventListener("resize", resize);

    let last = performance.now();
    function loop(now) {
        const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
        last = now;
        update(dt);
        render3d(dt, now / 1000);
        hud();
        requestAnimationFrame(loop);
    }
    render3d(0, 0);
    requestAnimationFrame(loop);
    window.__game = {
        get G() {
            return G;
        },
        start,
        doInput,
        setCam,
        playPose,
        poses: POSE_DEMOS.map((p) => ({
            id: p.id,
            group: p.group,
            label: p.label,
            en: p.en,
        })),
    };
    if (rideTestPage) {
        start();
        hud();
    }
})();
