import {
  AFFILIATION_SQUADRON_MEMBER,
  AFFILIATION_NOT_MEMBER,
  ArchitectSubmission,
  buildArchitectFormBody,
} from './architect-form';

function submission(partial: Partial<ArchitectSubmission> = {}): ArchitectSubmission {
  return {
    yourName: 'LCU No Fool Like One',
    systemName: 'Varati',
    architect: 'Herix',
    affiliation: AFFILIATION_SQUADRON_MEMBER,
    preferredFaction: 'Flotta Stellare',
    ...partial,
  };
}

describe('buildArchitectFormBody', () => {
  it('maps each answer onto the form entry it belongs to', () => {
    const body = buildArchitectFormBody(submission());
    expect(body.get('entry.1150665299')).toBe('LCU No Fool Like One');
    expect(body.get('entry.2086138170')).toBe('Varati');
    expect(body.get('entry.983657745')).toBe('Herix');
    expect(body.get('entry.1126584006')).toBe(AFFILIATION_SQUADRON_MEMBER);
    expect(body.get('entry.55921704')).toBe('Flotta Stellare');
    expect(body.get('entry.55921704.other_option_response')).toBeNull();
  });

  it('sends a faction the form does not list through the "other" option', () => {
    const body = buildArchitectFormBody(
      submission({ affiliation: AFFILIATION_NOT_MEMBER, preferredFaction: 'Flat Galaxy Society' }),
    );
    expect(body.get('entry.55921704')).toBe('__other_option__');
    expect(body.get('entry.55921704.other_option_response')).toBe('Flat Galaxy Society');
  });

  it('omits the optional faction question entirely for "Don\'t know"', () => {
    const body = buildArchitectFormBody(submission({ preferredFaction: '' }));
    expect(body.has('entry.55921704')).toBe(false);
    expect(body.has('entry.55921704.other_option_response')).toBe(false);
  });
});
