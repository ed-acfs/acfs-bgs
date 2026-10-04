import { computeMargin } from './bgs';

const OWN = 'Flotta Stellare';

describe('computeMargin', () => {
  it('measures a controlled system against the strongest other faction', () => {
    const margin = computeMargin(
      [
        { name: OWN, influencePercent: 45.2 },
        { name: 'Rival A', influencePercent: 30.1 },
        { name: 'Rival B', influencePercent: 24.7 },
      ],
      OWN,
      OWN,
    );

    expect(margin).toEqual({ points: 45.2 - 30.1, versus: 'Rival A', versusInfluence: 30.1, controlled: true });
  });

  it('measures an uncontrolled system against the controlling faction, even when it is not the strongest', () => {
    const margin = computeMargin(
      [
        { name: 'Strongest', influencePercent: 40 },
        { name: 'Controller', influencePercent: 35 },
        { name: OWN, influencePercent: 25 },
      ],
      'Controller',
      OWN,
    );

    expect(margin).toEqual({ points: -10, versus: 'Controller', versusInfluence: 35, controlled: false });
  });

  it('can be positive in a system we do not control yet (influence ahead of control)', () => {
    const margin = computeMargin(
      [
        { name: OWN, influencePercent: 50 },
        { name: 'Controller', influencePercent: 45 },
      ],
      'Controller',
      OWN,
    );

    expect(margin?.points).toBe(5);
    expect(margin?.controlled).toBe(false);
  });

  it('falls back to the strongest other faction when the controller is missing from the presences', () => {
    const margin = computeMargin(
      [
        { name: 'Rival', influencePercent: 60 },
        { name: OWN, influencePercent: 40 },
      ],
      'Not Listed',
      OWN,
    );

    expect(margin?.versus).toBe('Rival');
    expect(margin?.points).toBe(-20);
  });

  it('is null when our faction is absent', () => {
    expect(computeMargin([{ name: 'Rival', influencePercent: 100 }], 'Rival', OWN)).toBeNull();
  });

  it('is null when our faction is alone in the system', () => {
    expect(computeMargin([{ name: OWN, influencePercent: 100 }], OWN, OWN)).toBeNull();
  });
});
