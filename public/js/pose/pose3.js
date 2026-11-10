// pose: 사람 자세. solve.js는 관절, tricks.js는 트릭별 발·보드, 이 파일이 한 프레임으로 합친다.
import { createSolver } from "./solve.js";
import { createTricks } from "./tricks.js";

export function createPose3(env) {
    const { solve, solveRun, mixJ } = createSolver(env);
    const ACT_POSE = createTricks(env);
    const {
        POS, Xw, TAIL, L, Y_ANK, K,
        clamp, ease, newPoses, reduce, landingDown, touchdownOf, TRICKS,
    } = env;

    function applyActPose(ctx) {
        const pose = ACT_POSE[ctx.A.type];
        if (pose) pose(ctx);
        const A = ctx.A,
            t = ctx.t;
        let hipDrop = ctx.hipDrop;
        if (
            A.type === "shuv" ||
            A.type === "bigspin" ||
            A.type === "biggerspin" ||
            A.type === "nocomply" ||
            (A.type === "ncbig" && !newPoses) ||
            A.type === "varial"
        ) {
            const load = t < 0.2 ? Math.sin((Math.PI * t) / 0.2) : 0;
            const spring =
                t < 0.2
                    ? 0
                    : Math.sin(Math.PI * clamp((t - 0.2) / 0.65, 0, 1));
            hipDrop += load * 0.16 - spring * 0.07;
        }
        if (newPoses) {
            if (TRICKS[A.type] && TRICKS[A.type].air) {
                hipDrop += landingDown(A.el, touchdownOf(A));
            } else if (
                A.type === "ghost" &&
                (A.phase === "jump" || A.phase === "flip")
            ) {
                hipDrop += landingDown(A.el, A.dur);
            }
        }
        ctx.hipDrop = hipDrop;
    }

    function solvePose(ctx) {
        const A = ctx.A,
            shake = ctx.shake,
            idleSway = ctx.idleSway,
            c0 = ctx.c0,
            B = ctx.B;
        let pa = ctx.pa,
            pb = ctx.pb,
            la = ctx.la,
            lb = ctx.lb,
            za = ctx.za,
            zb = ctx.zb,
            hop = ctx.hop,
            lean = ctx.lean,
            arms = ctx.arms,
            yaw = ctx.yaw,
            hipDrop = ctx.hipDrop,
            hipZ = ctx.hipZ,
            kneesOut = ctx.kneesOut,
            sockSign = ctx.sockSign,
            ga = ctx.ga,
            gb = ctx.gb,
            fall = ctx.fall,
            alpha = ctx.alpha,
            runMix = ctx.runMix,
            cyc = ctx.cyc;
        const fa = ga || {
            x: Xw(TAIL + pa * L),
            y: Y_ANK + hop + la + shake,
            z: za,
        };
        const fb = gb || {
            x: Xw(TAIL + pb * L),
            y: Y_ANK + hop + lb + shake,
            z: zb,
        };
        if (
            A &&
            (A.type === "pivot" ||
                (newPoses &&
                    (A.type === "bigspin" ||
                        A.type === "biggerspin" ||
                        A.type === "ncbig" ||
                        A.type === "nocomply")))
        ) {
            const yawNow = (env.G.facing ? Math.PI : 0) + yaw;
            const ax = Math.cos(yawNow),
                az = -Math.sin(yawNow);
            sockSign = (fa.x - fb.x) * ax + (fa.z - fb.z) * az >= 0 ? 1 : -1;
        }
        const hipX =
            A && A.type === "push"
                ? fb.x - 0.12
                : (fa.x + fb.x) / 2 + lean * 0.15;
        const hipY = Y_ANK + 0.78 + hop + shake - hipDrop;
        let J = solve({
            hip: { x: hipX, y: hipY, z: hipZ },
            fa,
            fb,
            yaw: (env.G.facing ? Math.PI : 0) + yaw,
            shoulderYaw: (env.G.facing ? Math.PI : 0) + (ctx.shoulderYaw ?? yaw),
            lean,
            arms,
            sway: idleSway,
            sockA: sockSign,
            kneesOut,
        });
        if (runMix > 0) J = mixJ(J, solveRun(cyc, c0), runMix);
        if (fall > 0) {
            const px = (J.aA.x + J.aB.x) / 2,
                py = Y_ANK,
                ang = fall * 1.45,
                cs = Math.cos(ang),
                sn = Math.sin(ang);
            for (const k in J) {
                const p = J[k],
                    dx = p.x - px,
                    dy = p.y - py;
                p.x = px + dx * cs - dy * sn;
                p.y = Math.max(0.03, py + dx * sn + dy * cs - fall * 0.12);
            }
        }
        return { J, B, alpha };
    }

    function pose3(time) {
        const A = env.G.act;
        const shake = env.G.shake > 0 ? Math.sin(time * 80) * 0.012 : 0;
        const t = A ? clamp(A.el / A.dur, 0, 1) : 0;
        const ctx = {
            A,
            shake,
            idleSway: reduce ? 0 : Math.sin(time * 2.6) * 0.12,
            side: env.G.facing ? -1 : 1,
            pa: POS[env.G.pos][0],
            pb: POS[env.G.pos][1],
            la: 0,
            lb: 0,
            za: 0,
            zb: 0,
            hop: 0,
            lean: 0,
            arms: 0.45,
            yaw: 0,
            hipDrop: 0,
            hipZ: 0,
            kneesOut: newPoses,
            sockSign: env.G.facing ? 1 : -1,
            faceFwd: Math.PI / 2 - (env.G.facing ? Math.PI : 0),
            ga: null,
            gb: null,
            fall: 0,
            alpha: 1,
            runMix: 0,
            cyc: 0,
            c0: env.G.worldX * K,
            t,
            e: A ? ease(t) : 0,
            B: {
                px: env.G.worldX * K,
                py: shake,
                pz: 0,
                lx: 0,
                ly: -0.09,
                lz: 0,
                yaw: 0,
                pitch: 0,
                roll: 0,
            },
        };
        if (A) applyActPose(ctx);
        // 게임에서는 착지와 동시에 트릭이 끝나므로, 남은 다운(무릎 굽혔다 펴기)을 여기서 마저 한다.
        const G = env.G;
        if (newPoses && G.landEl < 320 && !(A && ((TRICKS[A.type] && TRICKS[A.type].air) || A.type === "ghost")))
            ctx.hipDrop += landingDown(G.landEl, 0);
        return solvePose(ctx);
    }
    return pose3;
}
