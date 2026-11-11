// Board-length fractions: tail = 0, nose = 1.
// Front/rear describe board position; A/B preserve each animation's leg identity.
export const standingCenters = {
    tail: 0.125,
    middleLower: 0.375,
    middleUpper: 0.625,
    nose: 0.825,
};
export const standingHalfWidth = 0.175;
const standingFeet = center => ({
    front: center + standingHalfWidth,
    rear: center - standingHalfWidth,
});

export const footPositions = {
    start: { front: 0.625, rear: 0.375 },
    ...Object.fromEntries(Object.entries(standingCenters)
        .map(([name, center]) => [name, standingFeet(center)])),
    pivot: { front: 0.93, rear: 0.5 },
    hang: { front: 0.985, rear: 0.92 },
};

export const footPair = (position, frontLeg = "A") => frontLeg === "A"
    ? [position.front, position.rear]
    : [position.rear, position.front];

// One A/B mapping for standing, walking and tricks on both pages.
export const standingPositions = Object.keys(standingCenters)
    .map(name => footPair(footPositions[name], "B"));
