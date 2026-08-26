import { describe, expect, it } from 'vitest';
import { hueShift, mix, parse, rgba, shade, tint, toHex } from '../../ts/generator/color';

// Task 2.1 / GEN-011: direct ports of the 9 baseline assertions in
// tests/test_color.php. These are intentionally written before the module.
describe('colour utilities — PHP parity', () => {
  it('parses six-digit white', () => {
    expect(parse('#ffffff')).toEqual([255, 255, 255]);
  });

  it('parses three-digit black', () => {
    expect(parse('#000')).toEqual([0, 0, 0]);
  });

  it('formats white as lowercase hex', () => {
    expect(toHex(255, 255, 255)).toBe('#ffffff');
  });

  it('clamps and rounds RGB channels when formatting hex', () => {
    expect(toHex(-10, 300, 128)).toBe('#00ff80');
  });

  it('tints black halfway to white', () => {
    expect(tint('#000000', 0.5)).toBe('#808080');
  });

  it('shades white halfway to black', () => {
    expect(shade('#ffffff', 0.5)).toBe('#808080');
  });

  it('mixes black and white at their midpoint', () => {
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080');
  });

  it('formats rgba values identically to PHP', () => {
    expect(rgba('#3366cc', 0.4)).toBe('rgba(51,102,204,0.4)');
  });

  it('returns the source colour after a full hue rotation', () => {
    expect(hueShift('#3366cc', 360)).toBe('#3366cc');
  });
});
