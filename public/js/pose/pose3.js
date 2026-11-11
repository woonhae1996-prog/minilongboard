import { sampleRunFoot } from "./run-gait.js?v=20261111-peter-pan-duration-1200";
// pose: 사람 자세. solve.js는 관절, tricks.js는 트릭별 발·보드, 이 파일이 한 프레임으로 합친다.
import { createSolver } from "./solve.js?v=20261111-peter-pan-duration-1200";
import { createTricks } from "./tricks.js?v=20261111-shuv-fixed-shoulders";

// Supply opposite signs for regular/goofy; all mirroring happens once here.
export function stanceParameters(facing) {
    const side = facing ? -1 : 1;
    return { side, baseYaw: facing ? Math.PI : 0, rotationSign: side };
}

export function runningFootPitch(cycle, mix) {
    return {
        a: sampleRunFoot(cycle).pitch * mix,
        b: sampleRunFoot(cycle + Math.PI).pitch * mix,
    };
}

export function createPose3(env, getStance = stanceParameters) {
    const { solve, solveRun, mixJ } = createSolver(env);
    const ACT_POSE = createTricks(env);
    const {
        POS, Xw, TAIL, L, Y_ANK, K,
        clamp, ease, lerp, newPoses, reduce, landingDown, touchdownOf, TRICKS,
    } = env;

    function applyActPose(ctx) {
        const pose = ACT_POSE[ctx.A.type];
        if (pose) {
            // Tricks use a regular local frame; mirror their output as a unit.
            const side = ctx.side;
            ctx.side = 1;
            pose(ctx);
            ctx.side = side;
            const sign = ctx.stance.rotationSign;
            ctx.yaw *= sign;
            if (ctx.footYawA != null) ctx.footYawA *= sign;
            if (ctx.footYawB != null) ctx.footYawB *= sign;
            if (ctx.shoulderYaw != null) ctx.shoulderYaw *= sign;
            ctx.za *= side;
            ctx.zb *= side;
            ctx.hipZ *= side;
            if (ctx.ga) ctx.ga.z *= side;
            if (ctx.gb) ctx.gb.z *= side;
            ctx.B.yaw *= sign;
            ctx.B.roll *= side;
            ctx.B.pz *= side;
            ctx.B.lz *= side;
        }
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
                A.type === "pivot" || A.type === "pirouette" || A.type === "step180" || A.type === "step360" ||
                (A.type === "ghost" &&
                    (A.phase === "jump" || A.phase === "flip"))
            ) {
                hipDrop += landingDown(
                    A.el,
                    A.dur,
                    A.type === "step180" || A.type === "step360" ? 0.08 : 0.16,
                );
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
        const crossFeet = A && A.type === "step";
        const footYaw = crossFeet ? Math.atan2(1, ctx.side) : null;
        const bodyYaw = crossFeet ? footYaw : ctx.stance.baseYaw + yaw;
        const pushing = A && A.type === "push";
        // The support toes face board travel (+X) in either stance.
        const footYawA = ctx.footYawA != null ? ctx.stance.baseYaw + ctx.footYawA
            : pushing && ctx.pushSupportA ? Math.PI / 2
            : !A && env.G.panFootYawA != null ? ctx.stance.baseYaw + env.G.panFootYawA
            : footYaw;
        const footYawB = ctx.footYawB != null ? ctx.stance.baseYaw + ctx.footYawB
            : pushing && !ctx.pushSupportA ? Math.PI / 2
            : !A && env.G.panFootYawB != null ? ctx.stance.baseYaw + env.G.panFootYawB
            : footYaw;
        // Match sockets to the actual body frame, including forward-facing pushes.
        // Steps retain their starting connection while the legs cross.
        const fromFeet = env.G.startFeet || (crossFeet ? POS[A.from] : null);
        const dx = crossFeet ? fromFeet[0] - fromFeet[1] : fa.x - fb.x;
        const dz = crossFeet ? 0 : fa.z - fb.z;
        const projection = dx * Math.cos(bodyYaw) - dz * Math.sin(bodyYaw);
        // Preserve each action's leg identity through crossing and rotation.
        const keepNoComplyLegs = newPoses && A && A.type === "nocomply";
        const turnStep = A && (A.type === "step180" || A.type === "step360");
        const footStep = turnStep || (A && A.type === "pan");
        if (A && A.type === "pan" && ctx.panSocketSign != null) {
            sockSign = ctx.panSocketSign * ctx.side;
        } else if (crossFeet || (!A && env.G.crossStepStance)) {
            sockSign = -ctx.side;
        } else if (!keepNoComplyLegs && Math.abs(projection) > 1e-6) {
            sockSign = Math.sign(projection);
        }
        const hipX = ctx.supportHipX ?? (
            A && A.type === "push"
                ? (ctx.pushSupportA ? fa.x : fb.x) - Math.abs(Xw(TAIL + L) - Xw(TAIL)) * 0.08
                : (fa.x + fb.x) / 2 + lean * 0.15);
        const hipY = Y_ANK + 0.78 + hop + shake - hipDrop;
        // Standing feet stay perpendicular to the board; 45° is step-only.
        let J = solve({
            hip: { x: hipX, y: hipY, z: hipZ },
            fa,
            fb,
            yaw: bodyYaw,
            shoulderYaw: crossFeet ? bodyYaw : ctx.stance.baseYaw + (ctx.shoulderYaw ?? yaw),
            lean,
            leanF: ctx.leanF || 0,
            arms,
            sway: idleSway,
            armDrive: pushing ? ctx.pushArmSwing : 0,
            supportArmSign: ctx.pushSupportA ? sockSign : -sockSign,
            sockA: sockSign,
            kneesOut,
            kneeOutward: footStep ? 0.18 : undefined,
            kneeBendA: ctx.kneeBendA,
            kneeBendB: ctx.kneeBendB,
            // Shoe heading stays fixed independently of the knee bend direction.
            footYawA: turnStep ? null : footYawA,
            footYawB: turnStep ? null : footYawB,
            fitFeet: pushing || footStep,
            pinFootA: pushing || footStep,
            pinFootB: pushing || footStep,
        });
        if (runMix > 0) J = mixJ(J, solveRun(cyc, c0, ctx.stance.side), runMix);
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
        const footPitch = runningFootPitch(cyc || 0, runMix);
        if (pushing) {
            if (ctx.pushSupportA) footPitch.b = ctx.pushFootPitch;
            else footPitch.a = ctx.pushFootPitch;
        }
        return { J, B, alpha, footYawA, footYawB,
            footPitchA: footPitch.a, footPitchB: footPitch.b };
    }

    function pose3(time) {
        const A = env.G.act;
        const shake = env.G.shake > 0 ? Math.sin(time * 80) * 0.012 : 0;
        const t = A ? clamp(A.el / A.dur, 0, 1) : 0;
        const feet = env.G.startFeet || POS[env.G.pos];
        const stance = getStance(env.G.facing);
        const ctx = {
            A,
            shake,
            idleSway: reduce ? 0 : Math.sin(time * 2.6) * 0.12,
            side: stance.side,
            stance,
            pa: feet[0],
            pb: feet[1],
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
            sockSign: Math.sign((feet[0] - feet[1]) * stance.side) || 1,
            faceFwd: Math.PI / 2,
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
        if (A) {
            applyActPose(ctx);
            if (TRICKS[A.type] && TRICKS[A.type].pts && t > 0.9) {
                const settle = ease(clamp((t - 0.9) / 0.1, 0, 1));
                const currentA = ctx.ga || {
                    x: Xw(TAIL + ctx.pa * L),
                    y: Y_ANK + ctx.hop + ctx.la + shake,
                    z: ctx.za,
                };
                const currentB = ctx.gb || {
                    x: Xw(TAIL + ctx.pb * L),
                    y: Y_ANK + ctx.hop + ctx.lb + shake,
                    z: ctx.zb,
                };
                const [rear, front] = POS[env.G.pos];
                const aTarget = currentA.x < currentB.x ? rear : front;
                const bTarget = currentA.x < currentB.x ? front : rear;
                ctx.ga = {
                    x: lerp(currentA.x, ctx.B.px + (aTarget - 0.5) * env.LM, settle),
                    y: lerp(currentA.y, Y_ANK + shake, settle),
                    z: lerp(currentA.z, ctx.B.pz, settle),
                };
                ctx.gb = {
                    x: lerp(currentB.x, ctx.B.px + (bTarget - 0.5) * env.LM, settle),
                    y: lerp(currentB.y, Y_ANK + shake, settle),
                    z: lerp(currentB.z, ctx.B.pz, settle),
                };
                ctx.hipZ = (ctx.ga.z + ctx.gb.z) / 2;
            }
        }
        // 게임에서는 착지와 동시에 트릭이 끝나므로, 남은 다운(무릎 굽혔다 펴기)을 여기서 마저 한다.
        const G = env.G;
        if (newPoses && G.landEl < 320 && !(A && ((TRICKS[A.type] && TRICKS[A.type].air) || A.type === "ghost")))
            ctx.hipDrop += landingDown(
                G.landEl,
                0,
                A && (A.type === "step180" || A.type === "step360") ? 0.08 : 0.16,
            );
        const result = solvePose(ctx);
        // Persistent lateral travel belongs to the world frame, after stance mirroring.
        const worldZ = G.worldZ || 0;
        if (worldZ) {
            result.B.pz += worldZ;
            for (const joint of Object.values(result.J)) joint.z += worldZ;
        }
        return result;
    }
    return pose3;
}
