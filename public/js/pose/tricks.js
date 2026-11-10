export function createTricks(env) {
    const {
        V, POS, HANG, Xw, TAIL, L, TRUCK, Y_ANK, G_ANK, LM, K,
        ease, lerp, clamp, bump, panFeet, newPoses,
        PIVOT_BACK, PIVOT_FRONT, PIVOT_PREP, PIVOT_AXIS, PIVOT_SHIFT,
    } = env;

    function poseStep(ctx) {
        const { A, t, e, B, side, faceFwd, c0, shake } = ctx;
        let {
            pa, pb, la, lb, za, zb, hop, lean, arms, yaw, hipDrop, hipZ,
            ga, gb, fall, alpha, runMix, cyc,
        } = ctx;
        const f = POS[A.from],
            to = POS[A.to];
        pa = lerp(f[0], to[0], e);
        pb = lerp(f[1], to[1], e);
        const lift = Math.sin(Math.PI * t) * 0.13;
        if (f[0] !== to[0]) la = lift;
        else lb = lift;
        arms = 0.7;
        lean = (A.to > A.from ? 0.1 : -0.1) * Math.sin(Math.PI * t);
        yaw = faceFwd;
        Object.assign(ctx, {
            pa, pb, la, lb, za, zb, hop, lean, arms, yaw, hipDrop, hipZ,
            ga, gb, fall, alpha, runMix, cyc,
        });
    }

    function posePush(ctx) {
        const { A, t, e, B, side, faceFwd, c0, shake } = ctx;
        let {
            pa, pb, la, lb, za, zb, hop, lean, arms, yaw, hipDrop, hipZ,
            ga, gb, fall, alpha, runMix, cyc,
        } = ctx;
        const fx = Xw(TAIL + pa * L),
            zz = 0.2 * side;
        if (t < 0.3) {
            const q = ease(t / 0.3);
            ga = {
                x: fx - 0.06 * q,
                y: lerp(Y_ANK, G_ANK, q),
                z: zz * q,
            };
        } else if (t < 0.65) {
            const q = (t - 0.3) / 0.35;
            ga = {
                x: lerp(fx - 0.06, fx - 0.42, q),
                y: G_ANK,
                z: zz,
            };
        } else {
            const q = ease((t - 0.65) / 0.35);
            ga = {
                x: lerp(fx - 0.42, fx, q),
                y:
                    lerp(G_ANK, Y_ANK, q) +
                    Math.sin(Math.PI * q) * 0.1,
                z: zz * (1 - q),
            };
        }
        const qBack = clamp((t - 0.65) / 0.35, 0, 1);
        hipDrop =
            t < 0.65
                ? 0.06 + Math.sin((Math.PI * t) / 0.65) * 0.12
                : lerp(0.06, 0, ease(qBack)) -
                  Math.sin(Math.PI * qBack) * 0.08;
        lean = 0.2;
        arms = 0.35;
        yaw = faceFwd;
        Object.assign(ctx, {
            pa, pb, la, lb, za, zb, hop, lean, arms, yaw, hipDrop, hipZ,
            ga, gb, fall, alpha, runMix, cyc,
        });
    }

    function poseShuv(ctx) {
        const { A, t, e, B, side, faceFwd, c0, shake } = ctx;
        let {
            pa, pb, la, lb, za, zb, hop, lean, arms, yaw, hipDrop, hipZ,
            ga, gb, fall, alpha, runMix, cyc,
        } = ctx;
        hop = Math.sin(Math.PI * t) * 0.38;
        B.py += Math.sin(Math.PI * t) * 0.18;
        B.yaw = Math.PI * t;
        if (newPoses) {
            // Match board angular speed, hold at 45°, then return.
            yaw = Math.PI * Math.min(t, 0.25, 1 - t);
        }
        arms = 0.95;
        Object.assign(ctx, {
            pa, pb, la, lb, za, zb, hop, lean, arms, yaw, hipDrop, hipZ,
            ga, gb, fall, alpha, runMix, cyc,
        });
    }

    function poseNocomply(ctx) {
        const { A, t, e, B, side, faceFwd, c0, shake } = ctx;
        let {
            pa, pb, la, lb, za, zb, hop, lean, arms, yaw, hipDrop, hipZ,
            ga, gb, fall, alpha, runMix, cyc,
        } = ctx;
        if (newPoses) {
            // Rear foot kicks the tail; front foot plants, then both rise.
            // Timings are tuned for 1150ms; scale them to this trick's length.
            const ts = A.dur / 1150;
            const takeoffAt = 420 * ts; // Keep a brief, visible front-foot plant.
            const touchdownAt = A.dur - 80 * ts;
            const plant = ease(clamp(A.el / (155 * ts), 0, 1));
            // Lead with the shoulders while planting; the deck and hips follow.
            const shoulderSpin = ease(clamp(A.el / touchdownAt, 0, 1));
            const boardSpin = ease(clamp((A.el - 155 * ts) / (touchdownAt - 155 * ts), 0, 1));
            const flight = clamp((A.el - takeoffAt) / (touchdownAt - takeoffAt), 0, 1);
            const spin = ease(flight);
            const air = Math.sin(Math.PI * flight);
            const groundAnkle = 0.085; // Shoe sole sits on the ground.
            yaw = Math.PI * spin;
            ctx.shoulderYaw = Math.PI * shoulderSpin;
            B.yaw = Math.PI * boardSpin;
            B.py += air * 0.2;
            B.pitch = 0.25 * bump(t, 0.08, 0.55);
            hop = air * 0.32;
            const startCenter = (pa + pb) / 2;
            const landingCenter = (POS[1][0] + POS[1][1]) / 2;
            const centerX = Xw(
                TAIL + lerp(startCenter, landingCenter, spin) * L,
            );
            const frontX = Xw(TAIL + pb * L);
            const ground = {
                x: frontX + 0.15 * plant,
                y: lerp(Y_ANK, groundAnkle, plant) + shake,
                z: -0.38 * side * plant,
            };
            const plantedOffset = (pb - startCenter) * LM + 0.15;
            const plantedZ = -0.38 * side;
            const angle = lerp(Math.atan2(-plantedZ, plantedOffset), Math.PI, spin);
            const radius = lerp(
                Math.hypot(plantedOffset, plantedZ),
                (pb - startCenter) * LM,
                spin,
            );
            gb = A.el <= takeoffAt ? ground : {
                x: centerX + radius * Math.cos(angle),
                y: lerp(groundAnkle, Y_ANK, spin) + hop + shake,
                z: -radius * Math.sin(angle),
            };
            // Keep the rear foot on the deck through its full transform.
            const rearPosition = lerp(pa, 1 - Math.max(...POS[1]), spin);
            ga = V(
                (rearPosition - 0.5) * LM - B.lx,
                Y_ANK - 0.09 - B.ly,
                -B.lz,
            ).applyEuler(new THREE.Euler(B.roll, B.yaw, B.pitch));
            ga.add(V(B.px, B.py, B.pz));
            hipZ = (ga.z + gb.z) / 2;
            hipDrop = 0.2 * plant * (1 - spin);
            arms = 0.9;
            Object.assign(ctx, {
                pa, pb, la, lb, za, zb, hop, lean, arms, yaw, hipDrop, hipZ,
                ga, gb, fall, alpha, runMix, cyc,
            });
            return;
        }
        const fbx = Xw(TAIL + pb * L);
        B.lx = -TRUCK * K;
        B.px = c0 - TRUCK * K;
        B.pitch = 0.45 * bump(t, 0.22, 0.62);
        B.py += 0.26 * bump(t, 0.3, 0.82);
        hop = 0.29 * bump(t, 0.42, 0.9);
        if (t < 0.55) {
            const q = ease(clamp(t / 0.22, 0, 1)),
                back = ease(clamp((t - 0.4) / 0.15, 0, 1));
            gb = {
                x: fbx + 0.15 * q * (1 - back),
                y: lerp(lerp(Y_ANK, G_ANK, q), Y_ANK + hop, back),
                z: 0.18 * side * q * (1 - back),
            };
        }
        hipDrop = 0.12 * bump(t, 0, 0.55);
        arms = 0.9;
        lean = 0.12 * bump(t, 0, 0.5);
        Object.assign(ctx, {
            pa, pb, la, lb, za, zb, hop, lean, arms, yaw, hipDrop, hipZ,
            ga, gb, fall, alpha, runMix, cyc,
        });
    }

    function posePan(ctx) {
        const { A, t, e, B, side, faceFwd, c0, shake } = ctx;
        let {
            pa, pb, la, lb, za, zb, hop, lean, arms, yaw, hipDrop, hipZ,
            ga, gb, fall, alpha, runMix, cyc,
        } = ctx;
        const r = panFeet(pa, pb, t);
        pa = r.pa;
        pb = r.pb;
        la = r.la * 0.14;
        lb = r.lb * 0.14;
        if (r.movA) za = r.cross * 0.1 * side;
        else zb = r.cross * 0.1 * side;
        hop = r.hop * 0.05;
        arms = 1.0;
        lean = r.lean;
        Object.assign(ctx, {
            pa, pb, la, lb, za, zb, hop, lean, arms, yaw, hipDrop, hipZ,
            ga, gb, fall, alpha, runMix, cyc,
        });
    }

    function poseBigspin(ctx) {
        const { A, t, e, B, side, faceFwd, c0, shake } = ctx;
        let {
            pa, pb, la, lb, za, zb, hop, lean, arms, yaw, hipDrop, hipZ,
            ga, gb, fall, alpha, runMix, cyc,
        } = ctx;
        const turns = A.type === "bigspin" ? 2 : 3;
        hop = Math.sin(Math.PI * t) * 0.4;
        B.py += Math.sin(Math.PI * t) * 0.2;
        B.yaw = turns * Math.PI * t;
        yaw = Math.PI * e;
        if (newPoses) {
            const center = Xw(TAIL + ((pa + pb) / 2) * L);
            const c = Math.cos(yaw),
                s = Math.sin(yaw);
            const rotateFoot = (position) => {
                const offset = Xw(TAIL + position * L) - center;
                return {
                    x: center + offset * c,
                    y: Y_ANK + hop + shake,
                    z: -offset * s,
                };
            };
            ga = rotateFoot(pa);
            gb = rotateFoot(pb);
            hipZ = (ga.z + gb.z) / 2;
        }
        arms = 0.95;
        Object.assign(ctx, {
            pa, pb, la, lb, za, zb, hop, lean, arms, yaw, hipDrop, hipZ,
            ga, gb, fall, alpha, runMix, cyc,
        });
    }

    function poseNcBig(ctx) {
        const { A, t, e, B, side, faceFwd, c0, shake } = ctx;
        let {
            pa, pb, la, lb, za, zb, hop, lean, arms, yaw, hipDrop, hipZ,
            ga, gb, fall, alpha, runMix, cyc,
        } = ctx;
        if (newPoses) {
            // Let the deck carry its pivot momentum through the step-off.
            // The rider holds 150 degrees while planted, then completes 180 degrees in the jump.
            const prepEnd = 0.14, pivotStart = 0.07, pivotEnd = 0.32;
            const plantStart = 0.29, plantEnd = 0.42;
            const spinEnd = 0.64;
            const takeoff = spinEnd - 200 / 1500, touchdown = takeoff + 0.17;
            const smooth = (q) => q * q * q * (q * (q * 6 - 15) + 10);
            const phase = (start, end) => clamp((t - start) / (end - start), 0, 1);
            // Zero speed and acceleration at the ends prevent snaps at contact changes.
            const pulse = (q) => 64 * q * q * q * (1 - q) * (1 - q) * (1 - q);
            const prepTime = phase(0, prepEnd);
            const pivotTime = phase(pivotStart, pivotEnd);
            const plantTime = phase(plantStart, plantEnd);
            const prep = smooth(prepTime);
            const plant = smooth(plantTime);
            const flight = clamp((t - takeoff) / (touchdown - takeoff), 0, 1);
            const recover = smooth(flight);
            const spin = smooth(phase(plantStart, spinEnd));
            const boardLift = Math.sin(Math.PI * spin) * 0.12;
            const pivotAngle = Math.PI * 150 / 180;
            // Quintic Hermite segments share nonzero angular speed at 150 degrees,
            // with matching zero angular acceleration instead of stopping and restarting.
            const joinSpeed = 2 * Math.PI / (spinEnd - pivotStart);
            const endTangent = (q) => q * q * q * (-4 + q * (7 - 3 * q));
            const startTangent = (q) => q + q * q * q * (-6 + q * (8 - 3 * q));
            const pivotRotation = pivotAngle * smooth(pivotTime)
                + (pivotEnd - pivotStart) * joinSpeed * endTangent(pivotTime);
            const finishTime = phase(pivotEnd, spinEnd);
            const boardRotation = t <= pivotEnd ? pivotRotation
                : pivotAngle + (2 * Math.PI - pivotAngle) * smooth(finishTime)
                    + (spinEnd - pivotEnd) * joinSpeed * startTangent(finishTime);
            const th = lerp(pivotRotation, pivotAngle, smooth(phase(plantStart, pivotEnd)));
            const noseX = c0 + (PIVOT_AXIS - 0.5) * LM;
            const pivotLocal = (PIVOT_AXIS - 0.5) * LM;
            B.yaw = boardRotation;
            B.pitch = -0.12 * pulse(phase(pivotStart, plantEnd));
            const noseOffset = V(pivotLocal, -B.ly, 0)
                .applyEuler(new THREE.Euler(B.roll, th, B.pitch));
            B.px = noseX - noseOffset.x;
            B.pz = -noseOffset.z;
            B.py += -B.ly - noseOffset.y + boardLift;
            const riderBaseX = B.px, riderBaseZ = B.pz;
            yaw = lerp(th, Math.PI, recover);
            ctx.shoulderYaw = yaw + 0.14 * pulse(pivotTime);
            pa = lerp(pa, PIVOT_FRONT, prep);
            pb = lerp(pb, PIVOT_BACK, prep);
            hop = pulse(flight) * 0.30;
            const forwardX = side * Math.sin(th), forwardZ = side * Math.cos(th);
            // Bring the deck around in front of the planted rider, without dragging either foot.
            const stanceCenter = (PIVOT_FRONT + PIVOT_BACK - 1) * LM / 2;
            const forwardTravel = 0.65 * spin + 0.10 * Math.sin(Math.PI * spin);
            const alongTravel = stanceCenter * spin + 0.10 * Math.sin(Math.PI * spin);
            const travelAhead = 0.12 * spin + 0.06 * Math.sin(Math.PI * spin);
            B.px += forwardX * forwardTravel + Math.cos(th) * alongTravel + travelAhead;
            B.pz += forwardZ * forwardTravel - Math.sin(th) * alongTravel;
            const onBoard = (position) => {
                const foot = V((position - 0.5) * LM, Y_ANK - 0.09 - B.ly, 0)
                    .applyEuler(new THREE.Euler(B.roll, th, B.pitch));
                return foot.add(V(riderBaseX, B.py - boardLift, riderBaseZ));
            };
            const noseFoot = onBoard(pa);
            const middleFoot = onBoard(pb);
            noseFoot.y += 0.06 * pulse(prepTime);
            middleFoot.y += 0.04 * pulse(prepTime);
            // Step straight in front of the torso, perpendicular to the deck.
            const ground = {
                x: middleFoot.x + 0.38 * forwardX,
                y: 0.085 + shake,
                z: middleFoot.z + 0.38 * forwardZ,
            };
            // Tuck the other leg as the stepping foot plants; hold it clear of the spinning deck.
            const tucked = {
                x: noseFoot.x + 0.04 * plant * forwardX,
                y: noseFoot.y + 0.14 * plant,
                z: noseFoot.z + 0.04 * plant * forwardZ,
            };
            // Reverse deck coordinates to match the rider's completed 180-degree turn.
            const landingA = (1 - PIVOT_FRONT - 0.5) * LM;
            const landingB = (1 - PIVOT_BACK - 0.5) * LM;
            const landingAngle = 2 * Math.PI;
            const landingFoot = (offset) => ({
                x: B.px + offset * Math.cos(landingAngle),
                y: Y_ANK + shake,
                z: B.pz - offset * Math.sin(landingAngle),
            });
            if (t <= takeoff) {
                ga = tucked;
                gb = {
                    x: lerp(middleFoot.x, ground.x, plant),
                    y: lerp(middleFoot.y, ground.y, plant),
                    z: lerp(middleFoot.z, ground.z, plant),
                };
            } else {
                const a = landingFoot(landingA), b = landingFoot(landingB);
                ga = {
                    x: lerp(tucked.x, a.x, recover),
                    y: lerp(tucked.y, a.y, recover) + hop,
                    z: lerp(tucked.z, a.z, recover),
                };
                gb = {
                    x: lerp(ground.x, b.x, recover),
                    y: lerp(ground.y, b.y, recover) + hop,
                    z: lerp(ground.z, b.z, recover),
                };
            }
            hipZ = (ga.z + gb.z) / 2;
            const jumpLoad = smooth(phase(takeoff - 0.12, takeoff));
            hipDrop = 0.06 * pulse(prepTime) + (0.12 * plant + 0.05 * jumpLoad) * (1 - recover);
            arms = lerp(0.45, 0.95, smooth(phase(0.04, plantEnd))) - 0.25 * recover;
            lean = 0.035 * pulse(plantTime) - 0.025 * pulse(flight);
            Object.assign(ctx, { pa, pb, hop, yaw, hipDrop, hipZ, arms, lean, ga, gb });
            return;
        }
        const fbx = Xw(TAIL + pb * L),
            k = clamp((t - 0.25) / 0.55, 0, 1);
        B.lx = 0;
        B.ly = 0;
        B.py = 0.09 + 0.3 * bump(t, 0.28, 0.85);
        B.pitch = 0.3 * bump(t, 0.22, 0.6);
        B.yaw = 2 * Math.PI * k;
        hop = 0.3 * bump(t, 0.4, 0.92);
        if (t < 0.55) {
            const q = ease(clamp(t / 0.22, 0, 1)),
                back = ease(clamp((t - 0.4) / 0.15, 0, 1));
            gb = {
                x: fbx + 0.15 * q * (1 - back),
                y: lerp(lerp(Y_ANK, G_ANK, q), Y_ANK + hop, back),
                z: 0.18 * side * q * (1 - back),
            };
        }
        yaw = t < 0.4 ? 0 : Math.PI * ease((t - 0.4) / 0.6);
        hipDrop = 0.12 * bump(t, 0, 0.55);
        arms = 0.95;
        Object.assign(ctx, {
            pa, pb, la, lb, za, zb, hop, lean, arms, yaw, hipDrop, hipZ,
            ga, gb, fall, alpha, runMix, cyc,
        });
    }

    function posePirouette(ctx) {
        const { A, t, e, B, side, faceFwd, c0, shake } = ctx;
        let {
            pa, pb, la, lb, za, zb, hop, lean, arms, yaw, hipDrop, hipZ,
            ga, gb, fall, alpha, runMix, cyc,
        } = ctx;
        const prep = 0.24;
        const spinT = clamp((t - prep) / (1 - prep), 0, 1);
        const down = t < prep ? Math.sin((Math.PI * t) / prep) : 0;
        const up = Math.sin(Math.PI * spinT);
        hipDrop += down * 0.18 - up * 0.06;
        hop = up * 0.08;
        yaw = 2 * Math.PI * ease(spinT);
        const lift = up * 0.34,
            swing = Math.sin(Math.PI * spinT) * 0.18 * side;
        if (pa >= pb) {
            pb = lerp(pb, pa - 0.05, up);
            lb = lift;
            zb = swing;
        } else {
            pa = lerp(pa, pb - 0.05, up);
            la = lift;
            za = -swing;
        }
        arms = 0.38 + up * 0.78;
        Object.assign(ctx, {
            pa, pb, la, lb, za, zb, hop, lean, arms, yaw, hipDrop, hipZ,
            ga, gb, fall, alpha, runMix, cyc,
        });
    }

    function poseVarial(ctx) {
        const { A, t, e, B, side, faceFwd, c0, shake } = ctx;
        let {
            pa, pb, la, lb, za, zb, hop, lean, arms, yaw, hipDrop, hipZ,
            ga, gb, fall, alpha, runMix, cyc,
        } = ctx;
        hop = Math.sin(Math.PI * t) * 0.36;
        yaw = 2 * Math.PI * e;
        arms = 0.9;
        Object.assign(ctx, {
            pa, pb, la, lb, za, zb, hop, lean, arms, yaw, hipDrop, hipZ,
            ga, gb, fall, alpha, runMix, cyc,
        });
    }

    function poseHang5(ctx) {
        const { A, t, e, B, side, faceFwd, c0, shake } = ctx;
        let {
            pa, pb, la, lb, za, zb, hop, lean, arms, yaw, hipDrop, hipZ,
            ga, gb, fall, alpha, runMix, cyc,
        } = ctx;
        const q =
            t < 0.25
                ? ease(t / 0.25)
                : t > 0.75
                  ? 1 - ease((t - 0.75) / 0.25)
                  : 1;
        pa = lerp(POS[3][0], 0.99, q);
        lean = -0.2 * q;
        arms = 0.45 + 0.5 * q;
        Object.assign(ctx, {
            pa, pb, la, lb, za, zb, hop, lean, arms, yaw, hipDrop, hipZ,
            ga, gb, fall, alpha, runMix, cyc,
        });
    }

    function poseHang10(ctx) {
        const { A, t, e, B, side, faceFwd, c0, shake } = ctx;
        let {
            pa, pb, la, lb, za, zb, hop, lean, arms, yaw, hipDrop, hipZ,
            ga, gb, fall, alpha, runMix, cyc,
        } = ctx;
        let q = 1;
        if (A.phase === "in") q = ease(t);
        else if (A.phase === "out") q = 1 - ease(t);
        pa = lerp(POS[3][0], HANG[0], q);
        pb = lerp(POS[3][1], HANG[1], q);
        lean = -0.32 * q;
        arms = 0.45 + 0.8 * q;
        Object.assign(ctx, {
            pa, pb, la, lb, za, zb, hop, lean, arms, yaw, hipDrop, hipZ,
            ga, gb, fall, alpha, runMix, cyc,
        });
    }

    function posePivot(ctx) {
        const { A, t, e, B, side, faceFwd, c0, shake } = ctx;
        let {
            pa, pb, la, lb, za, zb, hop, lean, arms, yaw, hipDrop, hipZ,
            ga, gb, fall, alpha, runMix, cyc,
        } = ctx;
        const spinT = clamp(
            (t - PIVOT_PREP) / (1 - PIVOT_PREP),
            0,
            1,
        );
        const th = Math.PI * ease(spinT);
        const plant = t < PIVOT_PREP ? ease(t / PIVOT_PREP) : 1;
        const step =
            t < PIVOT_PREP
                ? Math.sin((Math.PI * t) / PIVOT_PREP)
                : 0;
        pa = lerp(POS[env.G.pos][0], PIVOT_FRONT, plant);
        pb = lerp(POS[env.G.pos][1], PIVOT_BACK, plant);
        la = step * 0.07;
        lb = step * 0.12;
        const pivotLocal = (PIVOT_AXIS - 0.5) * LM;
        const pivotX =
            c0 - PIVOT_SHIFT * K * ease(spinT) + pivotLocal;
        B.px = pivotX;
        B.lx = pivotLocal;
        B.yaw = th;
        const c = Math.cos(th),
            s = Math.sin(th);
        const onBoard = (frac, lat) => {
            const rel = (frac - 0.5) * LM - pivotLocal;
            return {
                x: pivotX + rel * c + lat * s,
                z: -rel * s + lat * c,
            };
        };
        const settle =
            spinT < 0.84 ? 0 : ease((spinT - 0.84) / 0.16);
        let a = onBoard(pa, 0),
            b = onBoard(pb, 0);
        if (settle > 0) {
            a = {
                x: lerp(a.x, Xw(TAIL + POS[0][0] * L), settle),
                z: lerp(a.z, 0, settle),
            };
            b = {
                x: lerp(b.x, Xw(TAIL + POS[0][1] * L), settle),
                z: lerp(b.z, 0, settle),
            };
        }
        ga = { x: a.x, y: Y_ANK + la, z: a.z };
        gb = { x: b.x, y: Y_ANK + lb, z: b.z };
        hipZ = (a.z + b.z) / 2;
        const down =
            t < PIVOT_PREP
                ? Math.sin((Math.PI * t) / PIVOT_PREP)
                : 0;
        const up = Math.sin(Math.PI * spinT);
        hipDrop += down * 0.16 - up * 0.06;
        yaw = th;
        arms = 0.9;
        lean = -0.08 * Math.sin(Math.PI * spinT);
        Object.assign(ctx, {
            pa, pb, la, lb, za, zb, hop, lean, arms, yaw, hipDrop, hipZ,
            ga, gb, fall, alpha, runMix, cyc,
        });
    }

    function poseGhost(ctx) {
        const { A, t, e, B, side, faceFwd, c0, shake } = ctx;
        let {
            pa, pb, la, lb, za, zb, hop, lean, arms, yaw, hipDrop, hipZ,
            ga, gb, fall, alpha, runMix, cyc,
        } = ctx;
        cyc = A.cyc;
        if (A.phase === "off") runMix = e;
        else if (A.phase === "run") runMix = 1;
        else if (A.phase === "jump") {
            runMix = 1 - e;
            hop = Math.sin(Math.PI * t) * 0.3;
        } else if (A.phase === "flip") {
            runMix = 1 - ease(clamp((t - 0.1) / 0.8, 0, 1));
            hop = Math.sin(Math.PI * t) * 0.42;
            B.lx = 0;
            B.ly = 0;
            B.py = 0.09 + 0.33 * bump(t, 0.12, 0.85);
            B.roll = 2 * Math.PI * clamp((t - 0.2) / 0.55, 0, 1);
        }
        const fp = A.phase === "off" ? POS[A.fromPos || 0] : POS[0];
        pa = fp[0];
        pb = fp[1];
        Object.assign(ctx, {
            pa, pb, la, lb, za, zb, hop, lean, arms, yaw, hipDrop, hipZ,
            ga, gb, fall, alpha, runMix, cyc,
        });
    }

    function poseBail(ctx) {
        const { A, t, e, B, side, faceFwd, c0, shake } = ctx;
        let {
            pa, pb, la, lb, za, zb, hop, lean, arms, yaw, hipDrop, hipZ,
            ga, gb, fall, alpha, runMix, cyc,
        } = ctx;
        B.px += ease(Math.min(1, t * 1.4)) * 120 * K;
        fall = ease(Math.min(1, t * 2.2));
        alpha = t < 0.8 ? 1 : 1 - (t - 0.8) / 0.2;
        Object.assign(ctx, {
            pa, pb, la, lb, za, zb, hop, lean, arms, yaw, hipDrop, hipZ,
            ga, gb, fall, alpha, runMix, cyc,
        });
    }

    const ACT_POSE = {
        step: poseStep,
        push: posePush,
        shuv: poseShuv,
        nocomply: poseNocomply,
        pan: posePan,
        bigspin: poseBigspin,
        biggerspin: poseBigspin,
        ncbig: poseNcBig,
        pirouette: posePirouette,
        varial: poseVarial,
        hang5: poseHang5,
        hang10: poseHang10,
        pivot: posePivot,
        ghost: poseGhost,
        bail: poseBail,
    };
    return ACT_POSE;
}
