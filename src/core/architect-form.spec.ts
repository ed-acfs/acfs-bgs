import {
  AFFILIATION_SQUADRON_MEMBER,
  AFFILIATION_NOT_MEMBER,
  ArchitectSubmission,
  AssignRejectedError,
  buildArchitectFormBody,
  buildAssignScriptBody,
  checkAssignScriptReply,
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

describe('buildAssignScriptBody', () => {
  it('sends the same fields as the form plus the password, as JSON', () => {
    expect(JSON.parse(buildAssignScriptBody(submission({ preferredFaction: '' }), 'segreta'))).toEqual({
      password: 'segreta',
      yourName: 'LCU No Fool Like One',
      systemName: 'Varati',
      architect: 'Herix',
      affiliation: AFFILIATION_SQUADRON_MEMBER,
      preferredFaction: '',
    });
  });
});

describe('checkAssignScriptReply', () => {
  it('accepts only an explicit ok', () => {
    expect(() => checkAssignScriptReply({ ok: true })).not.toThrow();
  });

  it('turns a refusal into an AssignRejectedError carrying the reason and detail', () => {
    try {
      checkAssignScriptReply({ ok: false, error: 'invalid', detail: 'Manca il nome del sistema.' });
      throw new Error('expected a rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(AssignRejectedError);
      expect((error as AssignRejectedError).reason).toBe('invalid');
      expect((error as AssignRejectedError).detail).toBe('Manca il nome del sistema.');
    }
  });

  it('treats an unrecognised reply as a refusal, never as a success', () => {
    for (const reply of [null, {}, { ok: 'yes' }, { ok: false, error: 'teapot' }]) {
      expect(() => checkAssignScriptReply(reply)).toThrow(AssignRejectedError);
    }
  });
});
