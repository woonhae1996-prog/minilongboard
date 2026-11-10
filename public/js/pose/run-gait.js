export const runMotion = {
    stride: 0.36, footLift: 0.29, kneeLift: 0.45, contactFraction: 0.42,
    hipHeight: 0.87, bounce: 0.12, landingCompression: 0.035,
    hipSway: 0.018, bodySway: 0.035, armSwing: 1.1,
};
const smooth = t => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;
export const runPhase = cycle => ((cycle / (2 * Math.PI)) % 1 + 1) % 1;

export function sampleRunFoot(cycle, motion = runMotion) {
    const phase = runPhase(cycle);
    if (phase < motion.contactFraction) {
        const t = phase / motion.contactFraction;
        return {
            x: lerp(motion.stride, -motion.stride, t), y: 0, kneeLift: 0,
            pitch: 0.4 * smooth(Math.max(0, (t - 0.5) * 2)),
        };
    }
    const t = (phase - motion.contactFraction) / (1 - motion.contactFraction);
    // Fold the heel behind the body before bringing the knee/foot forward.
    const recovery = smooth(Math.max(0, (t - 0.25) / 0.75));
    return {
        x: lerp(-motion.stride, motion.stride, recovery)
            - 0.055 * Math.sin(Math.PI * t),
        y: motion.footLift * Math.sin(Math.PI * t) ** 0.85,
        kneeLift: motion.kneeLift * Math.sin(Math.PI * t) ** 2 * smooth(t),
        pitch: t < 0.5 ? lerp(0.4, -0.22, smooth(t * 2))
            : lerp(-0.22, 0, smooth((t - 0.5) * 2)),
    };
}
