import { describe, expect, test } from 'vitest';
import { contrastRatio, readableTextOn } from '../../src/domain/color';
import {
  COLOR_PALETTE,
  effectiveColor,
  ENGINE_BADGES,
  ENGINE_LABELS,
  ENVIRONMENTS,
  newConfig,
  normalizeConfig,
  type EngineKind,
} from '../../src/domain/dataSource';

describe('colors', () => {
  test('contrast ratio follows WCAG', () => {
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 0);
    expect(contrastRatio('#777777', '#777777')).toBeCloseTo(1, 5);
  });

  test('readable text picks black or white, whichever stands out more', () => {
    expect(readableTextOn('#000000')).toBe('#ffffff');
    expect(readableTextOn('#ffffff')).toBe('#111111');
  });

  test('every badge text is readable on its badge', () => {
    for (const engine of Object.keys(ENGINE_LABELS) as EngineKind[]) {
      const badge = ENGINE_BADGES[engine];
      expect(badge.text).toMatch(/^[A-Z][a-z]$/);
      expect(contrastRatio(readableTextOn(badge.color), badge.color)).toBeGreaterThanOrEqual(4.5);
    }
  });

  test('palette and environment colors stand out on the dark island background', () => {
    for (const color of [...COLOR_PALETTE.map((c) => c.value), ...ENVIRONMENTS.map((e) => e.color)]) {
      expect(contrastRatio(color, '#1b1c20')).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('environments', () => {
  test('are local, sandbox and dev', () => {
    expect(ENVIRONMENTS.map((e) => e.id)).toEqual(['local', 'sandbox', 'dev']);
    expect(ENVIRONMENTS.map((e) => e.label)).toEqual(['Local', 'Sandbox', 'Dev']);
  });
});

describe('effectiveColor', () => {
  const env = (id: string) => ENVIRONMENTS.find((e) => e.id === id)!.color;
  const palette = (id: string) => COLOR_PALETTE.find((c) => c.id === id)!.value;

  test('the chosen color wins', () => {
    expect(effectiveColor({ color: 'purple', environment: 'local' })).toBe(palette('purple'));
  });

  test('otherwise the environment color', () => {
    expect(effectiveColor({ color: null, environment: 'dev' })).toBe(env('dev'));
  });

  test('an unknown color falls back to the environment, then to none', () => {
    expect(effectiveColor({ color: 'chartreuse', environment: 'sandbox' })).toBe(env('sandbox'));
    expect(effectiveColor({ color: null, environment: null })).toBeNull();
  });
});

describe('config metadata', () => {
  test('new configs have no group, environment or color', () => {
    expect(newConfig('postgres', 'x')).toMatchObject({ groupId: null, environment: null, color: null });
  });

  test('old configs gain the fields, unknown values are dropped', () => {
    const old = { id: 'a1', name: 'Shop', engine: 'sqlite', filePath: 'C:/shop.db', readOnly: false };
    expect(normalizeConfig(old)).toMatchObject({ groupId: null, environment: null, color: null });
    expect(normalizeConfig({ ...old, groupId: 'g1', environment: 'dev', color: 'blue' })).toMatchObject({
      groupId: 'g1',
      environment: 'dev',
      color: 'blue',
    });
    expect(normalizeConfig({ ...old, environment: 'prod', color: 'chartreuse', groupId: 5 })).toMatchObject({
      groupId: null,
      environment: null,
      color: null,
    });
  });
});
