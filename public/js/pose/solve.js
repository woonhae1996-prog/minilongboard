export function createSolver(env) {
    const { V, SEG, G_ANK } = env;

    function ik(socket, foot, pole) {
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
            ankle: socket.clone().addScaledVector(dir, reach),
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
        const S = hip.clone().addScaledVector(u, 0.5);
        const head = S.clone().addScaledVector(u, 0.21);
        const sA = o.sockA,
            sB = -sA;
        const sockA = hip.clone().addScaledVector(axis, 0.09 * sA),
            sockB = hip.clone().addScaledVector(axis, 0.09 * sB);
        const kneePole = (foot, socketSign) => {
            if (!o.kneesOut)
                return f.clone().addScaledVector(axis, 0.3 * socketSign);
            const outward = V(foot.x - hip.x, 0, foot.z - hip.z);
            if (outward.lengthSq() < 1e-6)
                outward.copy(axis).multiplyScalar(socketSign);
            return f.clone().addScaledVector(outward.normalize(), 0.8);
        };
        const legA = ik(
            sockA,
            V(o.fa.x, o.fa.y, o.fa.z),
            kneePole(o.fa, sA),
        );
        const legB = ik(
            sockB,
            V(o.fb.x, o.fb.y, o.fb.z),
            kneePole(o.fb, sB),
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
            const sh = S.clone().addScaledVector(axis, 0.19 * s);
            const al = o.arms * 1.15 + s * o.sway;
            const up = V()
                .addScaledVector(axis, s * Math.sin(al))
                .addScaledVector(down, Math.cos(al))
                .addScaledVector(f, 0.1 + (o.swingZ || 0) * s)
                .normalize();
            const elb = sh.clone().addScaledVector(up, 0.27);
            const fo = up
                .clone()
                .addScaledVector(down, 0.4)
                .addScaledVector(f, o.run ? 0.9 : 0.2)
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
    function solveRun(cyc, c0) {
        const s = Math.sin(cyc),
            c = Math.cos(cyc);
        const P = (lx, ly, lz) => ({ x: c0 - 0.1 + lz, y: ly, z: -0.55 - lx });
        return solve({
            hip: P(0, 0.9 - Math.abs(s) * 0.03, 0.04),
            fa: P(-0.1, G_ANK + Math.max(0, c) * 0.14, s * 0.3),
            fb: P(0.1, G_ANK + Math.max(0, -c) * 0.14, -s * 0.3),
            yaw: Math.PI / 2,
            lean: 0,
            leanF: 0.22,
            arms: 0.18,
            sway: 0,
            swingZ: s * 0.8,
            run: true,
            sockA: -1,
        });
    }
    function mixJ(a, b, t) {
        const o = {};
        for (const k in a) o[k] = a[k].clone().lerp(b[k], t);
        return o;
    }
    return { solve, solveRun, mixJ };
}
