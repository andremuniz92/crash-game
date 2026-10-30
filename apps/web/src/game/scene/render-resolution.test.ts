import { describe, expect, it } from 'vitest';
import { renderResolution, antialiasFor } from './render-resolution.js';

describe('resolução do renderer pela escala do palco (D93)', () => {
  it('RS1: é a escala do palco vezes o DPR', () => {
    expect(renderResolution(1, 1)).toBe(1);
    expect(renderResolution(0.3, 2)).toBeCloseTo(0.6, 10);
  });

  it('RS2: o DPR entra limitado a 2, antes do produto', () => {
    expect(renderResolution(0.3, 3)).toBeCloseTo(0.6, 10);
  });

  it('RS3: o produto tem teto 2 (backing de no máximo 2560×1440)', () => {
    expect(renderResolution(1.5, 2)).toBe(2);
  });

  it('RS4: o produto tem piso 0,25', () => {
    expect(renderResolution(0.1, 1)).toBe(0.25);
  });

  it('RS5: escala 0 (contêiner oculto) não redimensiona', () => {
    expect(renderResolution(0, 2)).toBeNull();
  });

  it('RS6: antialias só com min(DPR, 2) < 2', () => {
    expect(antialiasFor(1)).toBe(true);
    expect(antialiasFor(1.5)).toBe(true);
    expect(antialiasFor(2)).toBe(false);
    expect(antialiasFor(3)).toBe(false);
  });
});
