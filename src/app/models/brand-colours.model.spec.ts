import { brandColorsFrom, isHexColour } from './brand-colours.model';

describe('brand colour helpers', () => {
  it('accepts and preserves a complete hex palette', () => {
    expect(brandColorsFrom({ primary: '#123456', secondary: '#ABCDEF', accent: '#000000' })).toEqual({
      primary: '#123456', secondary: '#ABCDEF', accent: '#000000'
    });
  });

  it('rejects incomplete or invalid palettes', () => {
    expect(brandColorsFrom({ primary: '#123456', secondary: '#abcdef' })).toBeNull();
    expect(brandColorsFrom({ primary: 'blue', secondary: '#abcdef', accent: '#000000' })).toBeNull();
    expect(isHexColour('#fff')).toBeFalse();
  });
});
