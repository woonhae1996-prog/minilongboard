export function createTricks(env) {
    const {
        V, POS, HANG, Xw, TAIL, L, TRUCK, Y_ANK, G_ANK, LM, K,
        ease, lerp, clamp, bump, newPoses, stepPositions = POS,
        PIVOT_BACK, PIVOT_FRONT, PIVOT_PREP, PIVOT_AXIS, PIVOT_SHIFT,
    } = env;

    function poseStep(ctx) {
        const { A, t, B, side, faceFwd } = ctx;
        let {
            pa, pb, la, lb, za, zb, hop, lean, arms, yaw, hipDrop, hipZ,
            ga, gb, fall, alpha, runMix, cyc,
        } = ctx;
        const f = A.fromFeet || env.G.startFeet || stepPositions[A.from],
            to = stepPositions[A.to];
        const first = ease(clamp(t / 0.65, 0, 1));
        const second = ease(clamp((t - 0.35) / 0.65, 0, 1));
        const forward = A.to > A.from;
        const moveA = forward ? second : first;
        const moveB = forward ? first : second;
        pa = lerp(f[0], to[0], moveA);
        pb = lerp(f[1], to[1], moveB);
        la = Math.sin(Math.PI * moveA) * 0.13;
        lb = Math.sin(Math.PI * moveB) * 0.13;
        // +X is forward; regular steps left, goofy steps right.
        za = -0.08 * side * Math.sin(Math.PI * moveA);
        zb = -0.08 * side * Math.sin(Math.PI * moveB);
        hop = Math.sin(Math.PI * t) * 0.035;
        hipDrop = bump(t, 0, 0.3) * 0.025 + bump(t, 0.6, 1) * 0.055;
        arms = 0.7;
        lean = 0.06;
        yaw = faceFwd;
        Object.assign(ctx, {
            pa, pb, la, lb, za, zb, hop, lean, arms, yaw, hipDrop, hipZ,
            ga, gb, fall, alpha, runMix, cyc,
        });
    }

    function poseTurnStep(ctx) {
        const { shake } = ctx;
        const hasExtraSteps = ctx.A.type === "step360";
        const t = hasExtraSteps ? Math.min(ctx.t * 2, 1) : ctx.t;
        // Both skills share steps 1–2. Sample their endpoint for steps 3–4.
        const gather = ease(clamp(t / 0.42, 0, 1));
        const turnT = clamp((t - 0.46) / 0.4, 0, 1);
        const turn = ease(turnT);
        // Track the same legs through the turn, even after they trade places.
        const rightIsA = ctx.pa < ctx.pb;
        const leftStartPosition = rightIsA ? ctx.pb : ctx.pa;
        const rightStartPosition = rightIsA ? ctx.pa : ctx.pb;
        // Land on this slot's standing positions after every turn.
        const [rearTarget, frontTarget] = POS[1];
        const plant = rightStartPosition + 0.1;
        const pivot = lerp(plant, rearTarget, turn);
        const gatherRight = LM * 0.065;
        const angle = Math.PI * turn;
        const radius = lerp(plant - rightStartPosition, frontTarget - rearTarget, turn);
        // Step 1: bring the left heel to the right toes, making a T-shaped stance.
        const leftFoot = {
            x: Xw(TAIL + lerp(leftStartPosition, pivot, gather) * L),
            y: Y_ANK + shake + Math.sin(Math.PI * gather) * 0.045,
            z: gatherRight * gather * (1 - turn),
        };
        // Step 2: sweep around the left foot into the deck's rear-middle stance.
        const rightFoot = {
            x: Xw(TAIL + (pivot - radius * Math.cos(angle)) * L),
            y: Y_ANK + shake + Math.sin(Math.PI * turnT) * 0.075,
            z: radius * Math.sin(angle) * LM,
        };
        ctx.ga = rightIsA ? rightFoot : leftFoot;
        ctx.gb = rightIsA ? leftFoot : rightFoot;
        const faceFront = ease(clamp((t - 0.86) / 0.08, 0, 1));
        const frontYaw = Math.PI / 2 * gather + Math.PI / 2 * faceFront;
        const rearYaw = Math.PI * turn;
        ctx.footYawA = rightIsA ? rearYaw : frontYaw;
        ctx.footYawB = rightIsA ? frontYaw : rearYaw;
        ctx.yaw = Math.PI / 2 * gather + Math.PI / 2 * turn;
        // Gather first; only then let the shoulders lead the rear-foot turn.
        const upperTurn = ease(clamp((t - 0.42) / 0.4, 0, 1));
        ctx.shoulderYaw = Math.PI / 2 * gather + Math.PI / 2 * upperTurn;
        ctx.hipZ = (leftFoot.z + rightFoot.z) / 2;
        ctx.hipDrop = 0.045 * Math.sin(Math.PI * t) ** 2;
        ctx.arms = 0.45 + 0.32 * Math.sin(Math.PI * t) ** 2;
        ctx.lean = 0;
        if (!hasExtraSteps || ctx.t <= 0.5) return;
        {
            const secondT = (ctx.t - 0.5) * 2;
            const gather = ease(clamp(secondT / 0.42, 0, 1));
            const turnT = clamp((secondT - 0.46) / 0.4, 0, 1);
            const turn = ease(turnT);
            const upperTurn = ease(clamp((secondT - 0.42) / 0.4, 0, 1));
            const faceFront = ease(clamp((secondT - 0.86) / 0.08, 0, 1));
            // Keep the same support leg from step 2 planted in step 3.
            const rightStart = rightFoot;
            const leftStart = leftFoot;
            const leftX = Xw(TAIL + frontTarget * L);
            const rightX = Xw(TAIL + rearTarget * L);
            const boardLength = Math.abs(Xw(TAIL + L) - Xw(TAIL));
            const leftPlantX = rightStart.x - boardLength * 0.1;
            const left = {
                x: lerp(lerp(leftStart.x, leftPlantX, gather), leftX, turn),
                y: Y_ANK + ctx.shake + Math.sin(Math.PI * gather) * 0.045,
                z: -LM * 0.065 * gather * (1 - turn),
            };
            // The returning right foot sweeps clockwise; the deck keeps its heading.
            const right = turnT === 0 ? { ...rightStart } : {
                x: lerp(rightStart.x, rightX, turn),
                y: Y_ANK + ctx.shake + Math.sin(Math.PI * turnT) * 0.075,
                z: -LM * 0.22 * Math.sin(Math.PI * turn),
            };
            ctx.ga = rightIsA ? right : left;
            ctx.gb = rightIsA ? left : right;
            // Hold the support-foot heading until the clockwise step has landed.
            const leftYaw = Math.PI + Math.PI / 2 * gather + Math.PI / 2 * faceFront;
            const rightYaw = Math.PI - Math.PI * turn;
            ctx.footYawA = rightIsA ? rightYaw : leftYaw;
            ctx.footYawB = rightIsA ? leftYaw : rightYaw;
            ctx.yaw = Math.PI + Math.PI / 2 * gather + Math.PI / 2 * turn;
            ctx.shoulderYaw = Math.PI + Math.PI / 2 * gather + Math.PI / 2 * upperTurn;
            ctx.hipZ = (left.z + right.z) / 2;
            ctx.hipDrop = 0.045 * Math.sin(Math.PI * secondT) ** 2;
            ctx.arms = 0.45 + 0.32 * Math.sin(Math.PI * secondT) ** 2;
            ctx.lean = 0;
        }
    }

    function posePush(ctx) {
        const { A, t, e, B, side, faceFwd, c0, shake } = ctx;
        let {
            pa, pb, la, lb, za, zb, hop, lean, arms, yaw, hipDrop, hipZ,
            ga, gb, fall, alpha, runMix, cyc,
        } = ctx;
        // The foot nearer the nose supports the rider; the rear foot pushes.
        const movingA = pa < pb;
        let pushingFoot;
        const rear = movingA ? pa : pb;
        const front = movingA ? pb : pa;
        const fx = Xw(TAIL + rear * L);
        const supportX = Xw(TAIL + front * L);
        const boardLength = Math.abs(Xw(TAIL + L) - Xw(TAIL));
        const plantX = supportX - boardLength * 0.05;
        const kickX = supportX - boardLength * 0.56;
        const zz = boardLength * 0.22 * side;
        ctx.pushSupportA = !movingA;
        if (t < 0.3) {
            const q = ease(t / 0.3);
            pushingFoot = {
                x: lerp(fx, plantX, q),
                y: lerp(Y_ANK, G_ANK, q),
                z: zz * q,
            };
        } else if (t < 0.65) {
            const q = (t - 0.3) / 0.35;
            pushingFoot = {
                x: lerp(plantX, kickX, q),
                y: G_ANK,
                z: zz,
            };
        } else {
            const q = ease((t - 0.65) / 0.35);
            pushingFoot = {
                x: lerp(kickX, fx, q),
                y:
                    lerp(G_ANK, Y_ANK, q) +
                    Math.sin(Math.PI * q) * boardLength / 12,
                z: zz * (1 - q),
            };
        }
        if (movingA) ga = pushingFoot;
        else gb = pushingFoot;
        const qBack = clamp((t - 0.65) / 0.35, 0, 1);
        // Roll onto the rear toes at push-off, then release on the way back.
        ctx.pushFootPitch = 0.4 * ease(clamp((t - 0.35) / 0.3, 0, 1))
            * (1 - ease(qBack));
        hipDrop =
            t < 0.65
                ? 0.06 + Math.sin((Math.PI * t) / 0.65) * 0.12
                : lerp(0.06, 0, ease(qBack)) -
                  Math.sin(Math.PI * qBack) * 0.08;
        hipDrop += 0.12 * Math.sin(Math.PI * t) ** 2;
        const drive = Math.sin(Math.PI * clamp(t / 0.8, 0, 1)) ** 2;
        lean = 0.24 + 0.16 * drive;
        ctx.leanF = 0.18 * drive;
        ctx.pushArmSwing = 0.9 * Math.sin(Math.PI * t) ** 2;
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

    // Preview-only action: POSE_DEMOS supplies this without a gameplay TRICKS entry.
    function poseFlip(ctx) {
        const { A, t, B, side, c0, shake } = ctx;
        // Kickflip flicks behind the torso; heelflip flicks forward.
        const flipDirection = A.type === "heelflip" ? side : -side;
        const smooth = (q) => q * q * q * (q * (q * 6 - 15) + 10);
        const phase = (start, end) => clamp((t - start) / (end - start), 0, 1);
        const pulse = (q) => 64 * q * q * q * (1 - q) * (1 - q) * (1 - q);
        const setup = smooth(phase(0, 0.20));
        const pop = smooth(phase(0.20, 0.29)) * (1 - smooth(phase(0.31, 0.46)));
        const flight = phase(0.26, 0.80);
        const hop = 0.48 * pulse(flight);
        const landing = smooth(phase(0.63, 0.80));
        const pa = lerp(lerp(ctx.pa, 0.06, setup), ctx.pa, landing);
        const pb = lerp(lerp(ctx.pb, 0.48, setup), ctx.pb, landing);
        // Press the tail down first, then lift and level the deck before its single flip.
        B.pitch = 0.34 * pop;
        const tail = V(-0.5 * LM, -B.ly, 0)
            .applyEuler(new THREE.Euler(0, 0, B.pitch));
        B.px = c0 - 0.5 * LM - tail.x;
        B.py += -B.ly - tail.y + 0.35 * pulse(flight);
        B.roll = flipDirection * 2 * Math.PI * smooth(phase(0.36, 0.67));
        const onDeck = (position) => V((position - 0.5) * LM, Y_ANK - 0.09 - B.ly, 0)
            .applyEuler(new THREE.Euler(0, 0, B.pitch))
            .add(V(B.px, B.py, B.pz));
        const rear = onDeck(pa), front = onDeck(pb);
        const rearRelease = smooth(phase(0.25, 0.34));
        const frontRelease = smooth(phase(0.29, 0.39));
        const flick = pulse(phase(0.29, 0.68));
        const ga = {
            x: lerp(rear.x, Xw(TAIL + pa * L), rearRelease),
            y: lerp(rear.y, Y_ANK + shake + hop + 0.08 * pulse(flight), rearRelease),
            z: -side * 0.06 * pulse(flight) * rearRelease,
        };
        const gb = {
            x: lerp(front.x, Xw(TAIL + pb * L) + 0.07 * flick, frontRelease),
            y: lerp(front.y, Y_ANK + shake + hop + 0.10 * pulse(flight), frontRelease),
            z: flipDirection * 0.23 * flick * frontRelease,
        };
        const settle = clamp((A.el - A.dur * 0.80) / 320, 0, 1);
        Object.assign(ctx, {
            pa, pb, ga, gb, hop,
            yaw: 0,
            hipZ: (ga.z + gb.z) / 2,
            hipDrop: 0.17 * pulse(phase(0, 0.27)) + 0.16 * Math.sin(Math.PI * settle) ** 2,
            arms: 0.45 + 0.50 * pulse(flight),
            lean: 0.035 * pop * (1 - landing),
        });
    }

    function poseNocomply(ctx) {
        const { A, t, e, B, side, faceFwd, c0, shake } = ctx;
        let {
            pa, pb, la, lb, za, zb, hop, lean, arms, yaw, hipDrop, hipZ,
            ga, gb, fall, alpha, runMix, cyc,
        } = ctx;
        if (newPoses) {
            // A/B identify legs, not permanent front/rear roles. A 180-degree
            // landing swaps those roles, so work rear-first and restore leg identity below.
            const swapLegs = pa > pb;
            if (swapLegs) [pa, pb] = [pb, pa];
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
            // Rotate signed offsets instead of a radius that can turn negative
            // when the previous landing has reversed the two feet.
            const frontOffset = (pb - startCenter) * LM + 0.15 * (1 - spin);
            const frontZ = -0.38 * side * (1 - spin);
            gb = A.el <= takeoffAt ? ground : {
                x: centerX + frontOffset * Math.cos(yaw) + frontZ * Math.sin(yaw),
                y: lerp(groundAnkle, Y_ANK, spin) + hop + shake,
                z: -frontOffset * Math.sin(yaw) + frontZ * Math.cos(yaw),
            };
            // Keep the rear foot on the deck through its full transform.
            const rearPosition = lerp(pa, 1 - landingCenter + pa - startCenter, spin);
            ga = V(
                (rearPosition - 0.5) * LM - B.lx,
                Y_ANK - 0.09 - B.ly,
                -B.lz,
            ).applyEuler(new THREE.Euler(B.roll, B.yaw, B.pitch));
            ga.add(V(B.px, B.py, B.pz));
            hipZ = (ga.z + gb.z) / 2;
            hipDrop = 0.2 * plant * (1 - spin);
            arms = 0.9;
            if (swapLegs) {
                [pa, pb] = [pb, pa];
                [ga, gb] = [gb, ga];
            }
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
        const { t, shake, pa, pb } = ctx;
        const phase = Math.min(3, Math.floor(t * 4));
        const u = ease(clamp(t * 4 - phase, 0, 1));
        const bodyTurn = phase === 1 ? Math.PI / 9 * Math.sin(Math.PI * u) : 0;
        // Match the 180-step reference: the rear foot is the right-foot pivot
        // and the forward foot is the left foot that gathers to its toes.
        const rightIsA = pa < pb;
        const rightStart = rightIsA ? pa : pb;
        const leftStart = rightIsA ? pb : pa;
        const rightStartX = Xw(TAIL + rightStart * L);
        const leftStartX = Xw(TAIL + leftStart * L);
        const rightToeX = Xw(TAIL + (rightStart + 0.1) * L);
        const lateral = 0.065 * LM;
        // Place the third-stage pivot so the final heel turn returns the
        // right ankle to its original standing position.
        const rightLandingX = rightStartX + lateral;
        const leftFoot = { x: leftStartX, y: Y_ANK + shake, z: 0 };
        const rightFoot = { x: rightStartX, y: Y_ANK + shake, z: 0 };
        let rightYaw = 0;
        let leftYaw = 0;
        let rightKneeBend = 1;

        if (phase === 0) {
            // Step 1: match the 180-step gather, bringing the left foot to the
            // right toes on the board's right side while the torso faces forward.
            leftFoot.x = lerp(leftStartX, rightToeX, u);
            leftFoot.y += Math.sin(Math.PI * u) * 0.045;
            leftFoot.z = lateral * u;
            leftYaw = Math.PI / 2 * u;
        } else {
            leftFoot.x = rightToeX;
            leftFoot.z = lateral;
            leftYaw = Math.PI / 2;
            if (phase === 1) {
                // Step 2: keep the left foot planted and arc the right foot
                // forward past it before landing on the opposite side.
                const arc = Math.sin(Math.PI * u);
                // A constant-radius outer arc: swing out from the board, pass
                // in front of the planted left foot, then close into the cross.
                const dx = rightLandingX - rightStartX;
                const dz = -lateral;
                const chord = Math.hypot(dx, dz);
                const radius = Math.max(LM * 0.24, chord / 2 + 0.001);
                const offset = Math.sqrt(radius * radius - chord * chord / 4);
                const centerX = (rightStartX + rightLandingX) / 2 - dz / chord * offset;
                const centerZ = dz / 2 + dx / chord * offset;
                const startAngle = Math.atan2(-centerZ, rightStartX - centerX);
                const endAngle = Math.atan2(-lateral - centerZ, rightLandingX - centerX);
                let turn = endAngle - startAngle;
                if (turn >= 0) turn -= 2 * Math.PI;
                const angle = startAngle + turn * u;
                rightFoot.x = centerX + radius * Math.cos(angle);
                rightFoot.z = centerZ + radius * Math.sin(angle);
                // Carry the swing with the torso turn around the planted left foot.
                const footX = rightFoot.x - leftFoot.x;
                const footZ = rightFoot.z - leftFoot.z;
                rightFoot.x = leftFoot.x + footX * Math.cos(bodyTurn) + footZ * Math.sin(bodyTurn);
                rightFoot.z = leftFoot.z - footX * Math.sin(bodyTurn) + footZ * Math.cos(bodyTurn);
                rightFoot.y += arc * 0.24;
                const extend = ease(clamp(u / 0.25, 0, 1)) *
                    (1 - ease(clamp((u - 0.8) / 0.2, 0, 1)));
                rightKneeBend = 1 - 0.75 * extend;
                ctx.supportHipX = lerp((rightFoot.x + leftFoot.x) / 2, leftFoot.x, arc * 0.8);
                // Cross only after the extended leg has cleared the support leg.
                const cross = ease(clamp((u - 0.72) / 0.28, 0, 1));
                ctx.panSocketSign = (rightIsA ? 1 : -1) * (1 - 2 * cross);
                rightYaw = Math.PI / 2 * u + Math.PI / 9 * arc + bodyTurn;
            } else if (phase === 2) {
                // Step 3: rotate the left foot clockwise and place it at
                // middle upper while the right foot stays on the board's left side.
                rightFoot.x = rightLandingX;
                rightFoot.z = -lateral;
                rightYaw = Math.PI / 2;
                // Preserve the crossed landing's leg identity while the left
                // foot circles; do not reattach the planted foot to the other hip.
                ctx.panSocketSign = rightIsA ? -1 : 1;
                const targetX = leftStartX;
                const dx = targetX - rightToeX;
                const dz = -lateral;
                const chord = Math.hypot(dx, dz);
                const radius = Math.max(LM * 0.24, chord / 2 + 0.001);
                const offset = Math.sqrt(radius * radius - chord * chord / 4);
                // Opposite circle direction to step 2: a broad clockwise sweep.
                const centerX = (rightToeX + targetX) / 2 + dz / chord * offset;
                const centerZ = lateral / 2 - dx / chord * offset;
                const startAngle = Math.atan2(lateral - centerZ, rightToeX - centerX);
                const endAngle = Math.atan2(-centerZ, targetX - centerX);
                let turn = endAngle - startAngle;
                if (turn <= 0) turn += 2 * Math.PI;
                const angle = startAngle + turn * u;
                leftFoot.x = centerX + radius * Math.cos(angle);
                leftFoot.z = centerZ + radius * Math.sin(angle);
                leftFoot.y += Math.sin(Math.PI * u) * 0.16;
                // Canonical zero points across the deck to the board's right.
                const faceRight = ease(clamp((u - 0.8) / 0.2, 0, 1));
                leftYaw = Math.PI / 2 * (1 - faceRight);
            } else {
                // Step 4: pivot the right foot back to its starting placement
                // as the shoulders finish at 90 degrees.
                rightYaw = Math.PI / 2 * (1 - u);
                rightFoot.x = rightStartX + lateral * Math.sin(rightYaw);
                rightFoot.z = -lateral + lateral * Math.cos(rightYaw);
                leftFoot.x = leftStartX;
                leftFoot.z = 0;
                leftYaw = 0;
                ctx.panSocketSign = rightIsA ? -1 : 1;
            }
        }
        const { A, B, fall, alpha, runMix, cyc } = ctx;
        const ga = rightIsA ? rightFoot : leftFoot;
        const gb = rightIsA ? leftFoot : rightFoot;
        const hipZ = (ga.z + gb.z) / 2;
        const forwardYaw = Math.PI / 2 * (phase === 0 ? u : 1);
        // Let the pelvis unwind with the final turn instead of keeping the
        // thigh sockets facing forward beneath the sideways torso and shoes.
        const yaw = forwardYaw + bodyTurn - (phase === 3 ? Math.PI / 2 * u : 0);
        const hipDrop = 0.035 * Math.sin(Math.PI * t) ** 2;
        const arms = 0.7;
        const lean = 0;
        ctx.footYawA = rightIsA ? rightYaw : leftYaw;
        ctx.footYawB = rightIsA ? leftYaw : rightYaw;
        ctx.kneeBendA = rightIsA ? rightKneeBend : 1;
        ctx.kneeBendB = rightIsA ? 1 : rightKneeBend;
        const torsoRight = phase === 2 ? Math.PI / 4
            : phase === 3 ? Math.PI / 4 * (1 + u) : 0;
        ctx.shoulderYaw = forwardYaw + bodyTurn - torsoRight;
        Object.assign(ctx, {
            pa, pb, la: 0, lb: 0, za: 0, zb: 0, hop: 0, lean, arms, yaw, hipDrop, hipZ,
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
        // 200ms at dur 920. The previous crouch and spin keep their 720ms after this.
        const windup = 200 / 920;
        const u = clamp((t - windup) / (1 - windup), 0, 1);
        const prep = 0.24;
        const spinT = clamp((u - prep) / (1 - prep), 0, 1);
        const down = u < prep ? Math.sin((Math.PI * u) / prep) : 0;
        const up = Math.sin(Math.PI * spinT);
        hipDrop += down * 0.18 - up * 0.06;
        hop = up * 0.08;
        yaw = 2 * Math.PI * ease(spinT);
        const lift = up * 0.34,
            swing = Math.sin(Math.PI * spinT) * 0.18 * side;
        const frontIsA = pa >= pb;
        if (frontIsA) {
            pb = lerp(pb, pa - 0.05, up);
            lb = lift;
            zb = swing;
        } else {
            pa = lerp(pa, pb - 0.05, up);
            la = lift;
            za = -swing;
        }
        // Turn the front foot to face travel, then let that heading join the spin.
        const wind = clamp(t / windup, 0, 1);
        const turned = ease(clamp(wind / 0.75, 0, 1));
        if (t < windup) {
            const footLift = Math.sin(Math.PI * wind) * 0.05;
            if (frontIsA) la += footLift;
            else lb += footLift;
            hipDrop += footLift * 0.6;
        }
        const bias = t < windup ? turned : 1 - ease(spinT);
        if (bias > 0) {
            const frontYaw = faceFwd * bias + (t < windup ? 0 : yaw);
            if (frontIsA) ctx.footYawA = frontYaw;
            else ctx.footYawB = frontYaw;
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
        if (newPoses) {
            const center = Xw(TAIL + ((pa + pb) / 2) * L);
            const rotateFoot = (position) => {
                const offset = Xw(TAIL + position * L) - center;
                return {
                    x: center + offset * Math.cos(yaw),
                    y: Y_ANK + hop + shake,
                    z: -offset * Math.sin(yaw),
                };
            };
            ga = rotateFoot(pa);
            gb = rotateFoot(pb);
            hipZ = (ga.z + gb.z) / 2;
        }
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
        // Keep the original remount rotation; face travel only off the board.
        if (A.phase === "off" || A.phase === "run") yaw = faceFwd;
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
        const remount = A.phase === "jump" || A.phase === "flip"
            ? ease(clamp((t - 0.65) / 0.35, 0, 1))
            : 0;
        const from = A.phase === "off" ? POS[A.fromPos || 0] : POS[0];
        pa = lerp(from[0], POS[1][0], remount);
        pb = lerp(from[1], POS[1][1], remount);
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
        step180: poseTurnStep,
        step360: poseTurnStep,
        push: posePush,
        shuv: poseShuv,
        kickflip: poseFlip,
        heelflip: poseFlip,
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
