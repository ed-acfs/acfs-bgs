import { BgsRow } from './bgs';
import { FACTION_NAME } from './config';
import {
  computePriorityAssessment,
  costToClose,
  deriveTier,
  factionCountWeight,
  needsRecon,
  populationCostFactor,
  prioritySortKey,
  resolveScope,
} from './priority';

const OWN = FACTION_NAME;

/** A minimal, fully-populated row — tests override only the fields they care about. */
function row(overrides: Partial<BgsRow> = {}): BgsRow {
  return {
    systemName: 'Test System',
    controllingFaction: null,
    factionInfluence: null,
    margin: null,
    architect: null,
    architectAffiliation: null,
    notAColony: false,
    preferredFaction: null,
    preferredFactionRecorded: false,
    factionDetails: [],
    stations: [],
    stationCount: null,
    factions: [],
    warState: null,
    warDetails: null,
    electionState: null,
    electionDetails: null,
    retreatState: null,
    retreatDetails: null,
    stateEntries: [],
    expansionState: null,
    bodyCount: null,
    population: null,
    x: 0,
    y: 0,
    z: 0,
    updatedAt: null,
    watchlist: [],
    ...overrides,
  };
}

describe('resolveScope', () => {
  it('is in-scope when the preferred faction is ours', () => {
    expect(resolveScope(row({ preferredFaction: OWN, factionInfluence: 30 }))).toEqual({ scope: 'in-scope', leadFaction: OWN });
  });

  it('matches the preferred faction case- and whitespace-insensitively', () => {
    expect(resolveScope(row({ preferredFaction: `  ${OWN.toLowerCase()}  ` }))).toEqual({ scope: 'in-scope', leadFaction: OWN });
    expect(resolveScope(row({ preferredFaction: OWN.toUpperCase() }))).toEqual({ scope: 'in-scope', leadFaction: OWN });
  });

  it('is out-of-scope when the preferred faction is a third party', () => {
    expect(resolveScope(row({ preferredFaction: 'Varati Ring' }))).toEqual({ scope: 'out-of-scope', leadFaction: null });
  });

  it('is in-scope by default policy when marked "not a colony" with no preference', () => {
    expect(resolveScope(row({ notAColony: true }))).toEqual({ scope: 'in-scope', leadFaction: OWN });
  });

  it('stays in-scope for "not a colony" even when a stray third-party preference was also recorded', () => {
    // The Assign dialog can default Preferred Faction from the architect's answer in a
    // *different* system, so a third-party value alongside "not a colony" isn't a real
    // hands-off agreement for this system — it must not get the out-of-scope treatment.
    expect(resolveScope(row({ notAColony: true, preferredFaction: 'Varati Ring' }))).toEqual({
      scope: 'in-scope',
      leadFaction: OWN,
    });
  });

  it('is "assumed" when there is no confirmed preference, leading with our faction when present', () => {
    expect(resolveScope(row({ factionInfluence: 10 }), 'assumed')).toEqual({ scope: 'assumed', leadFaction: OWN });
  });

  it('is "assumed" with no lead when our faction is not present', () => {
    expect(resolveScope(row())).toEqual({ scope: 'assumed', leadFaction: null });
  });

  it('is "no-preference" when an architect is confirmed but left the faction preference blank', () => {
    // Distinct from "no registry row at all": someone has already looked at this system and
    // didn't name us.
    expect(resolveScope(row({ architect: 'Some Commander', factionInfluence: 10 }))).toEqual({
      scope: 'no-preference',
      leadFaction: null,
    });
  });
});

describe('resolveScope under the squadron policy (unregistered systems are ours)', () => {
  it('is in-scope when nothing is recorded and our faction is present', () => {
    expect(resolveScope(row({ factionInfluence: 10 }), 'in-scope')).toEqual({ scope: 'in-scope', leadFaction: OWN });
  });

  it('still leaves a third-party preference out of scope', () => {
    expect(resolveScope(row({ factionInfluence: 10, preferredFaction: 'Varati Ring' }), 'in-scope')).toEqual({
      scope: 'out-of-scope',
      leadFaction: null,
    });
  });
});

describe('computePriorityAssessment under the squadron policy', () => {
  const NOW = Date.parse('2026-08-07T12:00:00Z');

  it('pushes for control (gap-to-leader) in an unregistered system', () => {
    const assessment = computePriorityAssessment(
      row({
        factionInfluence: 30,
        controllingFaction: 'Rival',
        factions: [
          { name: 'Rival', influencePercent: 35 },
          { name: OWN, influencePercent: 30 },
        ],
      }),
      NOW,
      'in-scope',
    );
    expect(assessment.scope).toBe('in-scope');
    expect(assessment.reasons.some(r => r.code === 'gap-to-leader')).toBe(true);
  });

  it('fires the last-place trigger in an unregistered system of 4+ factions below 5%', () => {
    const assessment = computePriorityAssessment(
      row({
        factionInfluence: 4.5,
        factions: [
          { name: 'A', influencePercent: 45.5 },
          { name: 'B', influencePercent: 30 },
          { name: 'C', influencePercent: 20 },
          { name: OWN, influencePercent: 4.5 },
        ],
      }),
      NOW,
      'in-scope',
    );
    expect(assessment.reasons[0]).toMatchObject({ code: 'lead-lowest-should-control', score: 90, params: { threshold: 5 } });
    expect(assessment.tier).toBe('P1');
  });

  it('leaves last place among 4+ factions out of P1 at a healthy influence (HR 2251: 13,9%)', () => {
    const assessment = computePriorityAssessment(
      row({
        factionInfluence: 13.9,
        factions: [
          { name: 'A', influencePercent: 40 },
          { name: 'B', influencePercent: 30 },
          { name: 'C', influencePercent: 16.1 },
          { name: OWN, influencePercent: 13.9 },
        ],
      }),
      NOW,
      'in-scope',
    );
    expect(assessment.reasons.some(r => r.code === 'lead-lowest-should-control')).toBe(false);
    expect(assessment.tier).not.toBe('P1');
  });

  it('shows the conflict itself, not "assign an architect", for a war in an unregistered system', () => {
    const assessment = computePriorityAssessment(row({ factionInfluence: 50, warState: 'active' }), NOW, 'in-scope');
    expect(assessment.reasons[0].code).toBe('war-active');
    expect(assessment.reasons.some(r => r.code === 'assumed-needs-architect')).toBe(false);
  });
});

describe('factionCountWeight', () => {
  it('weights small systems least severely', () => {
    expect(factionCountWeight(1)).toBe(0.25);
    expect(factionCountWeight(3)).toBe(0.25);
  });

  it('scales up through the middle bands', () => {
    expect(factionCountWeight(4)).toBe(0.5);
    expect(factionCountWeight(5)).toBe(0.75);
  });

  it('weights crowded systems at full severity', () => {
    expect(factionCountWeight(6)).toBe(1.0);
    expect(factionCountWeight(10)).toBe(1.0);
  });
});

describe('deriveTier', () => {
  it('is P1 at and above 85', () => {
    expect(deriveTier(85)).toBe('P1');
    expect(deriveTier(100)).toBe('P1');
  });

  it('is P2 from 65 up to just under 85', () => {
    expect(deriveTier(84.9)).toBe('P2');
    expect(deriveTier(65)).toBe('P2');
  });

  it('is P3 from 40 up to just under 65', () => {
    expect(deriveTier(64.9)).toBe('P3');
    expect(deriveTier(40)).toBe('P3');
  });

  it('is P4 from 20 up to just under 40', () => {
    expect(deriveTier(39.9)).toBe('P4');
    expect(deriveTier(20)).toBe('P4');
  });

  it('is P5 below 20', () => {
    expect(deriveTier(19.9)).toBe('P5');
    expect(deriveTier(0)).toBe('P5');
  });
});

describe('needsRecon', () => {
  it('is false for a reading 0-1 days old', () => {
    expect(needsRecon(0)).toBe(false);
    expect(needsRecon(1)).toBe(false);
  });

  it('is true from 2 days old', () => {
    expect(needsRecon(2)).toBe(true);
    expect(needsRecon(365)).toBe(true);
  });

  it('is true when there is no timestamp at all', () => {
    expect(needsRecon(null)).toBe(true);
  });
});

describe('populationCostFactor', () => {
  it('is 1 (no discount) when population is unknown', () => {
    expect(populationCostFactor(null)).toBe(1);
  });

  it('stays close to 1 for a small population', () => {
    expect(populationCostFactor(1_000)).toBeCloseTo(1 - Math.log10(1_000) / 10.875, 5);
  });

  it('floors at 0.025 for a huge population', () => {
    expect(populationCostFactor(1_000_000_000_000)).toBe(0.025);
  });

  it('is lower (more discounted, i.e. more expensive) for a bigger population', () => {
    expect(populationCostFactor(1_000_000)).toBeLessThan(populationCostFactor(1_000));
  });
});

describe('costToClose', () => {
  it('equals the raw gap when population is unknown', () => {
    expect(costToClose(20, null)).toBe(20);
  });

  it('is higher for the same gap in a bigger population', () => {
    expect(costToClose(20, 1_000_000_000)).toBeGreaterThan(costToClose(20, 1_000));
  });

  it('is 0 for a 0 gap regardless of population', () => {
    expect(costToClose(0, 1_000_000_000)).toBe(0);
  });
});

describe('computePriorityAssessment', () => {
  const NOW = Date.parse('2026-09-09T12:00:00Z');
  const current = '2026-09-09 11:00:00+00'; // keeps needsRecon false, isolating the trigger under test.

  it('is out-of-scope with a null score (sorts last) when the preferred faction is a third party and there is no live conflict', () => {
    const assessment = computePriorityAssessment(row({ preferredFaction: 'Varati Ring' }), NOW);
    expect(assessment.tier).toBe('out-of-scope');
    expect(assessment.score).toBeNull();
    expect(assessment.needsRecon).toBe(false);
  });

  it('is "not-applicable" with a null score when an architect is confirmed, no faction preferred, and there is no live conflict', () => {
    const assessment = computePriorityAssessment(row({ architect: 'Some Commander', factionInfluence: 10 }), NOW);
    expect(assessment.tier).toBe('not-applicable');
    expect(assessment.scope).toBe('no-preference');
    expect(assessment.score).toBeNull();
    expect(assessment.needsRecon).toBe(false);
    expect(assessment.reasons).toHaveLength(1);
  });

  it('does not surface a priority badge for an active conflict when the preferred faction is a third party (out-of-scope)', () => {
    // A standing "hands off" agreement outranks a live war/election — it's someone else's
    // system to work, not ours, so no badge regardless of what's happening there.
    const assessment = computePriorityAssessment(row({ preferredFaction: 'Varati Ring', warState: 'active', updatedAt: current }), NOW);
    expect(assessment.tier).toBe('out-of-scope');
    expect(assessment.score).toBeNull();
  });

  it('does not surface a priority badge for a pending conflict when an architect is confirmed with no faction preference', () => {
    const assessment = computePriorityAssessment(
      row({ architect: 'Some Commander', electionState: 'pending', updatedAt: current }),
      NOW,
    );
    expect(assessment.tier).toBe('not-applicable');
    expect(assessment.score).toBeNull();
  });

  it('surfaces an active conflict when no architect has been assigned yet (assumed scope) — getting one assigned is urgent', () => {
    const assessment = computePriorityAssessment(
      row({ factionInfluence: 50, warState: 'active', updatedAt: current }),
      NOW, 'assumed'
    );
    expect(assessment.scope).toBe('assumed');
    expect(assessment.tier).toBe('P1');
    expect(assessment.reasons.some(r => r.code === 'war-active')).toBe(true);
  });

  it('leads with "assign an architect" — not the conflict itself — when a war/election hits an assumed (architect-less) system', () => {
    const assessment = computePriorityAssessment(
      row({ factionInfluence: 50, warState: 'active', updatedAt: current }),
      NOW, 'assumed'
    );
    expect(assessment.reasons[0]).toMatchObject({ code: 'assumed-needs-architect', score: 101 });
    expect(assessment.score).toBe(101);
    expect(assessment.tier).toBe('P1');
  });

  it('does not add the "assign an architect" trigger for an assumed system with no live conflict', () => {
    const assessment = computePriorityAssessment(row({ factionInfluence: 5, updatedAt: current }), NOW, 'assumed');
    expect(assessment.scope).toBe('assumed');
    expect(assessment.reasons.some(r => r.code === 'assumed-needs-architect')).toBe(false);
  });

  it('never surfaces a priority badge for a conflict once an architect has confirmed no preference (no-preference scope)', () => {
    const assessment = computePriorityAssessment(
      row({ architect: 'Some Commander', factionInfluence: 50, warState: 'active', updatedAt: current }),
      NOW,
    );
    expect(assessment.scope).toBe('no-preference');
    expect(assessment.tier).toBe('not-applicable');
    expect(assessment.score).toBeNull();
  });

  it('scores an active retreat at 100 (P1), unweighted, outranking an active war', () => {
    const retreating = computePriorityAssessment(
      row({
        preferredFaction: OWN,
        retreatState: 'active',
        factions: [{ name: OWN, influencePercent: 2 }],
        updatedAt: current,
      }),
      NOW,
    );
    expect(retreating.tier).toBe('P1');
    expect(retreating.score).toBe(100);
    expect(retreating.reasons[0].code).toBe('retreat');

    const atWar = computePriorityAssessment(row({ preferredFaction: OWN, warState: 'active', updatedAt: current }), NOW);
    expect(retreating.score!).toBeGreaterThan(atWar.score!);
  });

  it('weights a low-influence lead trigger by how many factions share the system', () => {
    const smallSystem = computePriorityAssessment(
      row({
        preferredFaction: OWN,
        factionInfluence: 3,
        factions: [
          { name: 'A', influencePercent: 50 },
          { name: OWN, influencePercent: 3 },
          { name: 'B', influencePercent: 47 },
        ],
        updatedAt: current,
      }),
      NOW,
    );
    const crowdedSystem = computePriorityAssessment(
      row({
        preferredFaction: OWN,
        factionInfluence: 3,
        factions: [
          { name: 'A', influencePercent: 20 },
          { name: 'B', influencePercent: 20 },
          { name: 'C', influencePercent: 20 },
          { name: 'D', influencePercent: 20 },
          { name: 'E', influencePercent: 14 },
          { name: OWN, influencePercent: 3 },
        ],
        updatedAt: current,
      }),
      NOW,
    );
    // 3-faction system: 0.25 weight; 6-faction system: 1.0 weight — same raw trigger, very different severity.
    expect(smallSystem.score!).toBeLessThan(crowdedSystem.score!);
  });

  it('does not treat a healthy-influence assumed lead as at-risk just for being nominally last in a small system', () => {
    const healthyButLast = computePriorityAssessment(
      row({
        factionInfluence: 28,
        factions: [
          { name: 'Rival A', influencePercent: 40 },
          { name: 'Rival B', influencePercent: 32 },
          { name: OWN, influencePercent: 28 },
        ],
        updatedAt: current,
      }),
      NOW, 'assumed'
    );
    expect(healthyButLast.scope).toBe('assumed');
    expect(healthyButLast.reasons.some(r => r.code === 'lead-lowest-ranked')).toBe(false);
    expect(healthyButLast.reasons.some(r => r.code === 'lead-lowest-should-control')).toBe(false);
    expect(healthyButLast.score).toBe(5);

    const quietCrowded = computePriorityAssessment(
      row({
        factionInfluence: 15,
        factions: [
          { name: 'A', influencePercent: 20 },
          { name: 'B', influencePercent: 18 },
          { name: 'C', influencePercent: 17 },
          { name: 'D', influencePercent: 16 },
          { name: OWN, influencePercent: 15 },
          { name: 'E', influencePercent: 14 },
        ],
        updatedAt: current,
      }),
      NOW, 'assumed'
    );
    expect(quietCrowded.score).toBe(5);
    expect(healthyButLast.score).toBe(quietCrowded.score);
  });

  it('sends a system that prefers us to P1 when our faction is weakest of 4+ and below 5% — safety before control', () => {
    const confirmedButLast = computePriorityAssessment(
      row({
        preferredFaction: OWN,
        factionInfluence: 4.8,
        factions: [
          { name: 'Rival A', influencePercent: 40 },
          { name: 'Rival B', influencePercent: 33 },
          { name: 'Rival C', influencePercent: 22.2 },
          { name: OWN, influencePercent: 4.8 },
        ],
        updatedAt: current,
      }),
      NOW,
    );
    expect(confirmedButLast.scope).toBe('in-scope');
    expect(confirmedButLast.reasons[0]).toMatchObject({ code: 'lead-lowest-should-control', score: 90 });
    expect(confirmedButLast.score).toBe(90);
    expect(confirmedButLast.tier).toBe('P1');
  });

  it('also sends a "not a colony" system to P1 when our faction is weakest of 4+ and below 5% — still ours to protect from a forced withdrawal', () => {
    const notAColonyButLast = computePriorityAssessment(
      row({
        notAColony: true,
        factionInfluence: 4.8,
        factions: [
          { name: 'Rival A', influencePercent: 40 },
          { name: 'Rival B', influencePercent: 33 },
          { name: 'Rival C', influencePercent: 22.2 },
          { name: OWN, influencePercent: 4.8 },
        ],
        updatedAt: current,
      }),
      NOW,
    );
    expect(notAColonyButLast.scope).toBe('in-scope');
    expect(notAColonyButLast.reasons[0]).toMatchObject({ code: 'lead-lowest-should-control', score: 90 });
    expect(notAColonyButLast.tier).toBe('P1');
  });

  it('surfaces an active retreat as P1 in a "not a colony" system even with a stray third-party preference attached — not hidden behind the hands-off badge', () => {
    const assessment = computePriorityAssessment(
      row({
        notAColony: true,
        preferredFaction: 'Varati Ring',
        retreatState: 'active',
        updatedAt: current,
      }),
      NOW,
    );
    expect(assessment.scope).toBe('in-scope');
    expect(assessment.tier).not.toBe('out-of-scope');
    expect(assessment.reasons[0]).toMatchObject({ code: 'retreat', score: 100 });
    expect(assessment.tier).toBe('P1');
  });

  it('does not fire the last-place trigger in an assumed (unconfirmed) system of 4+ factions — only an explicit preference counts', () => {
    const assumedButLast = computePriorityAssessment(
      row({
        factionInfluence: 20,
        factions: [
          { name: 'Rival A', influencePercent: 30 },
          { name: 'Rival B', influencePercent: 28 },
          { name: 'Rival C', influencePercent: 22 },
          { name: OWN, influencePercent: 20 },
        ],
        updatedAt: current,
      }),
      NOW, 'assumed'
    );
    expect(assumedButLast.scope).toBe('assumed');
    expect(assumedButLast.reasons.some(r => r.code === 'lead-lowest-should-control')).toBe(false);
    expect(assumedButLast.score).toBe(5);
  });

  it('does not push for control off "lowest of three" even in a system that prefers us — only 4+ factions', () => {
    const confirmedButLastOfThree = computePriorityAssessment(
      row({
        preferredFaction: OWN,
        factionInfluence: 28,
        factions: [
          { name: 'Rival A', influencePercent: 40 },
          { name: 'Rival B', influencePercent: 32 },
          { name: OWN, influencePercent: 28 },
        ],
        updatedAt: current,
      }),
      NOW,
    );
    expect(confirmedButLastOfThree.reasons.some(r => r.code === 'lead-lowest-should-control')).toBe(false);
    expect(confirmedButLastOfThree.score).toBe(5);
  });

  it('never ranks a push for control (gap-to-leader) when the lead faction is only assumed, not confirmed', () => {
    const assumed = computePriorityAssessment(
      row({
        factionInfluence: 5,
        controllingFaction: 'Third Party',
        factions: [
          { name: 'Third Party', influencePercent: 90 },
          { name: OWN, influencePercent: 5 },
        ],
        updatedAt: current,
      }),
      NOW, 'assumed'
    );
    expect(assumed.reasons.some(r => r.code === 'gap-to-leader')).toBe(false);
  });

  it('falls back to the "nothing applicable" floor when no trigger matches', () => {
    const assessment = computePriorityAssessment(
      row({ preferredFaction: OWN, factionInfluence: 95, updatedAt: current }),
      NOW,
    );
    expect(assessment.reasons[0].code).toBe('none');
    expect(assessment.score).toBe(5);
    expect(assessment.tier).toBe('P5');
  });

  describe('gap-to-leader (work priority, population-weighted)', () => {
    it('ranks a system level with the leader above one 20+ points behind, all else equal', () => {
      const levelWithLeader = computePriorityAssessment(
        row({
          preferredFaction: OWN,
          factionInfluence: 30,
          controllingFaction: 'Rival',
          population: 189_000,
          factions: [
            { name: 'Rival', influencePercent: 30 },
            { name: OWN, influencePercent: 30 },
          ],
          updatedAt: current,
        }),
        NOW,
      );
      const farBehindLeader = computePriorityAssessment(
        row({
          preferredFaction: OWN,
          factionInfluence: 30,
          controllingFaction: 'Rival',
          population: 189_000,
          factions: [
            { name: 'Rival', influencePercent: 50.6 },
            { name: OWN, influencePercent: 30 },
          ],
          updatedAt: current,
        }),
        NOW,
      );
      expect(levelWithLeader.score!).toBeGreaterThan(farBehindLeader.score!);
    });

    it('scores the same gap lower (more work) in a much bigger population', () => {
      const smallPop = computePriorityAssessment(
        row({
          preferredFaction: OWN,
          factionInfluence: 10,
          controllingFaction: 'Rival',
          population: 1_000,
          factions: [
            { name: 'Rival', influencePercent: 30 },
            { name: OWN, influencePercent: 10 },
          ],
          updatedAt: current,
        }),
        NOW,
      );
      const hugePop = computePriorityAssessment(
        row({
          preferredFaction: OWN,
          factionInfluence: 10,
          controllingFaction: 'Rival',
          population: 6_600_000_000,
          factions: [
            { name: 'Rival', influencePercent: 30 },
            { name: OWN, influencePercent: 10 },
          ],
          updatedAt: current,
        }),
        NOW,
      );
      expect(hugePop.score!).toBeLessThan(smallPop.score!);
    });

    it('floors an unwinnable gap (huge population, wide gap) at the same baseline as a quiet system, never negative', () => {
      // Our own influence (25%) stays clear of the low-influence risk thresholds below
      // 10%, so the only applicable trigger left is the gap-to-leader one under test.
      const unwinnable = computePriorityAssessment(
        row({
          preferredFaction: OWN,
          factionInfluence: 25,
          controllingFaction: 'Rival',
          population: 6_600_000_000,
          factions: [
            { name: 'Rival', influencePercent: 80 },
            { name: OWN, influencePercent: 25 },
          ],
          updatedAt: current,
        }),
        NOW,
      );
      expect(unwinnable.reasons[0].code).toBe('gap-to-leader');
      expect(unwinnable.score).toBe(5);
    });

    it('two systems with the same gap and population rank equally regardless of when they were last seen', () => {
      const buildRow = (updatedAt: string | null) =>
        row({
          preferredFaction: OWN,
          factionInfluence: 20,
          controllingFaction: 'Rival',
          population: 1_000_000,
          factions: [
            { name: 'Rival', influencePercent: 35 },
            { name: OWN, influencePercent: 20 },
          ],
          updatedAt,
        });
      const fresh = computePriorityAssessment(buildRow(current), NOW);
      const stale = computePriorityAssessment(buildRow('2026-01-01 00:00:00+00'), NOW);
      const unknown = computePriorityAssessment(buildRow(null), NOW);

      expect(fresh.score).toBe(stale.score);
      expect(fresh.score).toBe(unknown.score);
      expect(stale.needsRecon).toBe(true);
      expect(unknown.needsRecon).toBe(true);
      expect(fresh.needsRecon).toBe(false);
    });
  });

  describe('Priority Watchlist', () => {
    it('boosts priority when the watchlisted faction ranks below the required position', () => {
      const assessment = computePriorityAssessment(
        row({
          preferredFaction: OWN,
          factionInfluence: 20,
          factions: [
            { name: 'Rival', influencePercent: 50 },
            { name: OWN, influencePercent: 20 },
          ],
          watchlist: [{ systemName: 'Test System', faction: OWN, position: 1, details: 'Key waypoint.' }],
        }),
        NOW,
      );
      expect(assessment.reasons.some(r => r.code === 'below-watchlist-position')).toBe(true);
      expect(assessment.reasons[0].code).toBe('below-watchlist-position');
    });

    it('does not fire when the watchlisted faction already meets its required position', () => {
      const assessment = computePriorityAssessment(
        row({
          preferredFaction: OWN,
          factionInfluence: 60,
          factions: [{ name: OWN, influencePercent: 60 }],
          watchlist: [{ systemName: 'Test System', faction: OWN, position: 1, details: 'Key waypoint.' }],
        }),
        NOW,
      );
      expect(assessment.reasons.some(r => r.code === 'below-watchlist-position')).toBe(false);
    });

    it('treats a watchlisted faction entirely absent from the system as below any required position', () => {
      const assessment = computePriorityAssessment(
        row({
          preferredFaction: OWN,
          factions: [{ name: 'Rival', influencePercent: 100 }],
          watchlist: [{ systemName: 'Test System', faction: OWN, position: 1, details: 'Key waypoint.' }],
        }),
        NOW,
      );
      expect(assessment.reasons.some(r => r.code === 'below-watchlist-position')).toBe(true);
    });

    describe('overriding an out-of-scope hands-off agreement', () => {
      it('allows BGS work when the watchlist tracks the hands-off third party and it has fallen below its required position', () => {
        const assessment = computePriorityAssessment(
          row({
            preferredFaction: 'Varati Ring',
            factions: [
              { name: 'Rival', influencePercent: 50 },
              { name: 'Varati Ring', influencePercent: 20 },
            ],
            watchlist: [{ systemName: 'Test System', faction: 'Varati Ring', position: 1, details: 'Keep our ally in control.' }],
          }),
          NOW,
        );
        expect(assessment.scope).toBe('out-of-scope');
        expect(assessment.tier).not.toBe('out-of-scope');
        expect(assessment.reasons[0]).toMatchObject({ code: 'below-watchlist-position', score: 90 });
        expect(assessment.tier).toBe('P1');
      });

      it('keeps the hands-off badge while the watched third party still holds its required position', () => {
        const assessment = computePriorityAssessment(
          row({
            preferredFaction: 'Varati Ring',
            factions: [{ name: 'Varati Ring', influencePercent: 50 }],
            watchlist: [{ systemName: 'Test System', faction: 'Varati Ring', position: 1, details: 'Keep our ally in control.' }],
          }),
          NOW,
        );
        expect(assessment.tier).toBe('out-of-scope');
        expect(assessment.score).toBeNull();
      });

      it('keeps the hands-off badge when the watchlist entry names a different faction than the hands-off preference', () => {
        const assessment = computePriorityAssessment(
          row({
            preferredFaction: 'Varati Ring',
            factions: [
              { name: 'Varati Ring', influencePercent: 50 },
              { name: OWN, influencePercent: 5 },
            ],
            factionInfluence: 5,
            // Watches our own faction, not the hands-off faction — irrelevant to the override.
            watchlist: [{ systemName: 'Test System', faction: OWN, position: 1, details: 'Unrelated entry.' }],
          }),
          NOW,
        );
        expect(assessment.tier).toBe('out-of-scope');
        expect(assessment.score).toBeNull();
      });
    });
  });
});

describe('computePriorityAssessment and the traffic lights of a system we control', () => {
  /** A system we control, with the given influence and the runner-up's. */
  function controlled(influence: number, runnerUp: number): BgsRow {
    return row({
      preferredFaction: OWN,
      controllingFaction: OWN,
      factionInfluence: influence,
      factions: [
        { name: OWN, influencePercent: influence },
        { name: 'Runner Up', influencePercent: runnerUp },
        { name: 'Third', influencePercent: 100 - influence - runnerUp },
      ],
    });
  }

  it('ranks no green light and at least one red P3, not "nothing to report" (SPOCS 253: 35,7%, lead 15,7)', () => {
    const assessment = computePriorityAssessment(controlled(35.7, 20));
    expect(assessment.tier).toBe('P3');
    expect(assessment.reasons.map(r => r.code)).toEqual(['control-lights-red']);
    expect(assessment.reasons[0].params).toEqual({ influence: 35.7, margin: 35.7 - 20 });
    expect(computePriorityAssessment(controlled(45, 30)).reasons[0].code).toBe('control-lights-red');
  });

  it('ranks both lights yellow, or one green and one red, P4', () => {
    expect(computePriorityAssessment(controlled(45, 20)).reasons[0].code).toBe('control-lights-yellow');
    expect(computePriorityAssessment(controlled(45, 20)).tier).toBe('P4');
    expect(computePriorityAssessment(controlled(52.5, 36.5)).reasons[0].code).toBe('control-lights-mixed');
    expect(computePriorityAssessment(controlled(52.5, 36.5)).tier).toBe('P4');
  });

  it('adds nothing when at least one light is green and none is red, as the legend says', () => {
    expect(computePriorityAssessment(controlled(60, 25)).reasons[0].code).toBe('none');
    // Iansan: influence green (51,5%), lead yellow (25,3).
    const iansan = computePriorityAssessment(controlled(51.5, 26.2));
    expect(iansan.tier).toBe('P5');
    expect(iansan.reasons[0].code).toBe('none');
  });

  it('lets a sharper trigger win over a red light', () => {
    const assessment = computePriorityAssessment(controlled(30, 25));
    expect(assessment.reasons[0].code).toBe('control-margin-3-7');
    expect(assessment.tier).toBe('P3');
    expect(computePriorityAssessment(controlled(30, 28)).tier).toBe('P2');
  });
});

describe('prioritySortKey', () => {
  const NOW = Date.parse('2026-09-09T12:00:00Z');
  const current = '2026-09-09 11:00:00+00';

  it('ranks an assumed system with a live conflict above a quiet confirmed one — every badge sorts by its score', () => {
    const confirmedQuiet = computePriorityAssessment(row({ preferredFaction: OWN, updatedAt: current }), NOW, 'assumed');
    const assumedRetreating = computePriorityAssessment(
      row({ factionInfluence: 5, retreatState: 'active', updatedAt: current }),
      NOW, 'assumed'
    );
    expect(confirmedQuiet.scope).toBe('in-scope');
    expect(assumedRetreating.scope).toBe('assumed');
    expect(prioritySortKey(assumedRetreating)!).toBeGreaterThan(prioritySortKey(confirmedQuiet)!);
  });

  it('orders by score regardless of scope', () => {
    const worse = computePriorityAssessment(row({ preferredFaction: OWN, warState: 'active', updatedAt: current }), NOW);
    const better = computePriorityAssessment(row({ preferredFaction: OWN, updatedAt: current }), NOW);
    expect(prioritySortKey(worse)!).toBeGreaterThan(prioritySortKey(better)!);
  });

  it('is null for out-of-scope with no live conflict, sorting last regardless of direction', () => {
    const assessment = computePriorityAssessment(row({ preferredFaction: 'Varati Ring' }), NOW);
    expect(prioritySortKey(assessment)).toBeNull();
  });
});
