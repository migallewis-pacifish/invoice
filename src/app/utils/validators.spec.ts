import { FormControl, FormGroup } from '@angular/forms';
import { matchPasswords } from './validators';

describe('matchPasswords', () => {
  it('returns null when both password fields match', () => {
    const group = new FormGroup({ password: new FormControl('secret'), confirm: new FormControl('secret') });

    expect(matchPasswords('password', 'confirm')(group)).toBeNull();
  });

  it('returns a mismatch error when values differ or are missing', () => {
    const group = new FormGroup({ password: new FormControl('secret'), confirm: new FormControl('different') });

    expect(matchPasswords('password', 'confirm')(group)).toEqual({ mismatch: true });
    group.controls.confirm.setValue('');
    expect(matchPasswords('password', 'confirm')(group)).toEqual({ mismatch: true });
  });
});
