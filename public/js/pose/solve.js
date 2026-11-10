import { runMotion, runPhase, sampleRunFoot } from "./run-gait.js?v=20261110-ride-motion2";

export function createSolver(env) {
    const { V, SEG, G_ANK } = env;

    function ik(socket, foot, pole, pinned = false) {
        const d = V().subVectors(foot, socket),
            len = d.length() || 0.001;
        const reach = Math.min(len, 2 * SEG - 0.002),
            dir = d.divideScalar(len);
        const mid = socket.clone().addScaledVector(dir, reach / 2);
        const h = Math.sqrt(Math.max(0, SEG * SEG - (reach / 2) * (reach / 2)));
        const p = pole.clone().addScaledVector(dir, -pole.dot(dir));
        if (p.lengthSq() < 1e-6) p.set(0, 0, 1);
        p.normalize();
        return {
            knee: mid.addScaledVector(p, h),
            ankle: pinned ? foot.clone() : socket.clone().addScaledVector(dir, reach),
        };
    }
    function solve(o) {
        const hip = V(o.hip.x, o.hip.y, o.hip.z);
        const fwd0 = V(Math.sin(o.yaw), 0, Math.cos(o.yaw));
        const u = V(Math.sin(o.lean), Math.cos(o.lean), 0);
        if (o.leanF) u.addScaledVector(fwd0, Math.sin(o.leanF));
        u.normalize();
        const axis = V().crossVectors(u, fwd0).normalize();
        const f = V().crossVectors(axis, u).normalize();
        if (o.fitFeet) {
            // Lower the body enough to reach the requested foot targets instead
            // of shortening the visible push stroke at the IK reach limit.
            const reach = 2 * SEG - 0.02;
            for (const [foot, sign] of [[o.fa, o.sockA], [o.fb, -o.sockA]]) {
                const dx = foot.x - (hip.x + axis.x * 0.09 * sign);
                const dz = foot.z - (hip.z + axis.z * 0.09 * sign);
                const rise = Math.sqrt(Math.max(0, reach * reach - dx * dx - dz * dz));
                hip.y = Math.min(hip.y, foot.y + rise - axis.y * 0.09 * sign);
            }
        }
        const shoulderFwd = o.shoulderYaw == null || o.shoulderYaw === o.yaw
            ? f
            : V(Math.sin(o.shoulderYaw), 0, Math.cos(o.shoulderYaw));
        const shoulderAxis = V().crossVectors(u, shoulderFwd).normalize();
        const shoulderF = V().crossVectors(shoulderAxis, u).normalize();
        const S = hip.clone().addScaledVector(u, 0.5);
        const head = S.clone().addScaledVector(u, 0.21);
        const sA = o.sockA,
            sB = -sA;
        const sockA = hip.clone().addScaledVector(axis, 0.09 * sA),
            sockB = hip.clone().addScaledVector(axis, 0.09 * sB);
        const kneePole = (foot, socketSign, footYaw, kneeLift = 0) => {
            if (footYaw != null)
                return V(Math.sin(footYaw), 0, Math.cos(footYaw));
            if (!o.kneesOut)
                return f.clone().addScaledVector(axis, 0.3 * socketSign)
                    .addScaledVector(u, kneeLift);
            const outward = V(foot.x - hip.x, 0, foot.z - hip.z);
            if (outward.lengthSq() < 1e-6)
                outward.copy(axis).multiplyScalar(socketSign);
            return f.clone().addScaledVector(outward.normalize(), 0.8);
        };
        const legA = ik(
            sockA,
            V(o.fa.x, o.fa.y, o.fa.z),
            kneePole(o.fa, sA, o.footYawA, o.kneeLiftA),
            o.pinFootA,
        );
        const legB = ik(
            sockB,
            V(o.fb.x, o.fb.y, o.fb.z),
            kneePole(o.fb, sB, o.footYawB, o.kneeLiftB),
            o.pinFootB,
        );
        const down = V(0, -1, 0),
            J = {
                hip,
                S,
                head,
                sockA,
                sockB,
                kA: legA.knee,
                aA: legA.ankle,
                kB: legB.knee,
                aB: legB.ankle,
            };
        for (const s of [-1, 1]) {
            const sh = S.clone().addScaledVector(shoulderAxis, 0.19 * s);
            const al = o.arms * 1.15 + s * o.sway;
            const pushSwing = (o.armDrive || 0) * s * (o.supportArmSign || 1);
            const up = V()
                .addScaledVector(shoulderAxis, s * Math.sin(al))
                .addScaledVector(down, Math.cos(al))
                .addScaledVector(shoulderF, 0.1 + (o.swingZ || 0) * s + pushSwing)
                .normalize();
            const elb = sh.clone().addScaledVector(up, 0.27);
            const fo = up
                .clone()
                .addScaledVector(down, 0.4)
                .addScaledVector(shoulderF, o.run ? 0.9 : 0.2)
                .normalize();
            const ha = elb.clone().addScaledVector(fo, 0.25);
            if (s < 0) {
                J.shL = sh;
                J.eL = elb;
                J.hL = ha;
            } else {
                J.shR = sh;
                J.eR = elb;
                J.hR = ha;
            }
        }
        return J;
    }
    function solveRun(cyc, c0, side = 1, motion = runMotion) {
        const s = Math.sin(cyc),
            c = Math.cos(cyc);
        const footA = sampleRunFoot(cyc, motion);
        const footB = sampleRunFoot(cyc + Math.PI, motion);
        const step = (runPhase(cyc) * 2) % 1;
        const hipY = motion.hipHeight + Math.sin(Math.PI * step) ** 2 * motion.bounce
            - Math.cos(Math.PI * step) ** 8 * motion.landingCompression;
        const P = (lx, ly, lz) => ({ x: c0 - 0.1 + lz, y: ly, z: (-0.55 - lx) * side });
        const joints = solve({
            hip: P(s * motion.hipSway, hipY, 0.04),
            kneeLiftA: footA.kneeLift,
            kneeLiftB: footB.kneeLift,
            fa: P(-0.1, G_ANK + footA.y, footA.x),
            fb: P(0.1, G_ANK + footB.y, footB.x),
            yaw: Math.PI / 2,
            lean: s * motion.bodySway * side,
            shoulderYaw: Math.PI / 2,
            leanF: 0.24 + Math.abs(c) * 0.025,
            arms: 0.22,
            sway: c * 0.04,
            swingZ: -Math.cos(cyc) * motion.armSwing,
            run: true,
            sockA: -side,
        });
        // Mirror the running path before solving, keeping the body facing +X.
        return joints;
    }
    function mixJ(a, b, t) {
        const o = {};
        for (const k in a) o[k] = a[k].clone().lerp(b[k], t);
        return o;
    }
    return { solve, solveRun, mixJ };
}
