import { describe, it, expect } from 'vitest';
import type { ReelModule } from '../module-interface';

// Import from the barrel to trigger built-in registration
import {
  getModule,
  listModules,
  isModuleMode,
  isCoreMode,
  CORE_MODES,
} from '..';

describe('module-registry', () => {
  it('has built-in modules registered', () => {
    const modules = listModules();
    expect(modules.length).toBeGreaterThanOrEqual(3);

    const ids = modules.map(m => m.id);
    expect(ids).toContain('n8n-explainer');
    expect(ids).toContain('ai-tips');
    expect(ids).toContain('presenter-explainer');
  });

  it('getModule returns correct module by id', () => {
    const n8n = getModule('n8n-explainer');
    expect(n8n).toBeDefined();
    expect(n8n!.name).toBe('n8n Workflow Explainer');
    expect(n8n!.compositionId).toBe('ScreenExplainer');
    expect(n8n!.configFields.length).toBeGreaterThan(0);
  });

  it('getModule returns undefined for unknown id', () => {
    expect(getModule('nonexistent')).toBeUndefined();
  });

  it('isModuleMode returns true for registered modules', () => {
    expect(isModuleMode('n8n-explainer')).toBe(true);
    expect(isModuleMode('ai-tips')).toBe(true);
    expect(isModuleMode('presenter-explainer')).toBe(true);
  });

  it('isModuleMode returns false for core and unknown modes', () => {
    expect(isModuleMode('generate')).toBe(false);
    expect(isModuleMode('compose')).toBe(false);
    expect(isModuleMode('unknown')).toBe(false);
  });

  it('isCoreMode identifies core modes', () => {
    expect(isCoreMode('generate')).toBe(true);
    expect(isCoreMode('compose')).toBe(true);
    expect(isCoreMode('captions')).toBe(true);
    expect(isCoreMode('ai-tips')).toBe(false);
    expect(isCoreMode('n8n-explainer')).toBe(false);
  });

  it('CORE_MODES contains exactly 3 modes', () => {
    expect(CORE_MODES).toEqual(['generate', 'compose', 'captions']);
  });

  it('each module has required fields', () => {
    for (const mod of listModules()) {
      expect(mod.id).toBeTruthy();
      expect(mod.name).toBeTruthy();
      expect(mod.compositionId).toBeTruthy();
      expect(mod.configFields).toBeInstanceOf(Array);
      expect(Object.keys(mod.progressSteps).length).toBeGreaterThan(0);
      expect(typeof mod.orchestrate).toBe('function');
    }
  });

  it('module progressSteps have numeric values', () => {
    for (const mod of listModules()) {
      for (const [step, value] of Object.entries(mod.progressSteps)) {
        expect(typeof step).toBe('string');
        expect(typeof value).toBe('number');
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(100);
      }
    }
  });
});
