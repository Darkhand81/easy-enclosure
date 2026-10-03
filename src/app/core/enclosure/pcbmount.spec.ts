import { measureBoundingBox } from '@jscad/modeling/src/measurements';

import { DEFAULT_PARAMS, cloneParams, type PCBMount } from '../params';
import {
  calculateMountFilletSize,
  expandPcbMount,
  pcbMount,
  pcbMounts,
  pcbMountsOnBase,
  pcbMountsOnLid,
} from './pcbmount';

describe('pcbmount', () => {
  const baseMountParams: PCBMount = {
    surface: 'bottom',
    x: 0,
    y: 0,
    height: 8,
    outerDiameter: 6,
    screwDiameter: 3,
  };

  describe('calculateMountFilletSize', () => {
    it('returns 0 when style is none', () => {
      expect(calculateMountFilletSize('none', 1.0, 8, 6)).toBe(0);
    });

    it('returns 0 when requested size is 0 or negative', () => {
      expect(calculateMountFilletSize('round', 0, 8, 6)).toBe(0);
      expect(calculateMountFilletSize('chamfer', -0.5, 8, 6)).toBe(0);
    });

    it('returns requested size when within valid limits', () => {
      expect(calculateMountFilletSize('round', 1.0, 8, 6)).toBe(1.0);
      expect(calculateMountFilletSize('chamfer', 0.8, 8, 6)).toBe(0.8);
    });

    it('clamps size to at most 45% of height', () => {
      // height = 2 => maxAllowed = 2 * 0.45 = 0.9
      expect(calculateMountFilletSize('round', 1.5, 2.0, 6)).toBe(0.9);
    });

    it('clamps size to at most 75% of outer diameter and 3.0mm max', () => {
      expect(calculateMountFilletSize('round', 5.0, 20, 6)).toBe(3.0);
    });

    it('returns 0 for microscopic standoffs where maxAllowed < MIN_MOUNT_FILLET', () => {
      expect(calculateMountFilletSize('round', 1.0, 0.3, 2)).toBe(0);
    });
  });

  describe('pcbMount', () => {
    it('creates straight cylindrical standoff when style is none', () => {
      const mount = pcbMount(baseMountParams, {
        pcbMountFilletStyle: 'none',
        pcbMountFilletSize: 0,
      });

      const bbox = measureBoundingBox(mount);
      expect(bbox[0][0]).toBeCloseTo(-3, 1);
      expect(bbox[1][0]).toBeCloseTo(3, 1);
      expect(bbox[0][1]).toBeCloseTo(-3, 1);
      expect(bbox[1][1]).toBeCloseTo(3, 1);
      expect(bbox[0][2]).toBeCloseTo(-4, 1);
      expect(bbox[1][2]).toBeCloseTo(4, 1);
    });

    it('creates flared base footprint when style is chamfer', () => {
      const mount = pcbMount(baseMountParams, {
        pcbMountFilletStyle: 'chamfer',
        pcbMountFilletSize: 1.0,
      });

      const bbox = measureBoundingBox(mount);
      // Outer radius 3 + fillet 1 = 4 => [-4, 4]
      expect(bbox[0][0]).toBeCloseTo(-4, 1);
      expect(bbox[1][0]).toBeCloseTo(4, 1);
      expect(bbox[0][1]).toBeCloseTo(-4, 1);
      expect(bbox[1][1]).toBeCloseTo(4, 1);
      expect(bbox[0][2]).toBeCloseTo(-4, 1);
      expect(bbox[1][2]).toBeCloseTo(4, 1);
    });

    it('creates smooth concave radius when style is round', () => {
      const mount = pcbMount(baseMountParams, {
        pcbMountFilletStyle: 'round',
        pcbMountFilletSize: 1.0,
      });

      const bbox = measureBoundingBox(mount);
      expect(bbox[0][0]).toBeCloseTo(-4, 1);
      expect(bbox[1][0]).toBeCloseTo(4, 1);
      expect(bbox[0][2]).toBeCloseTo(-4, 1);
      expect(bbox[1][2]).toBeCloseTo(4, 1);
    });

    it('supports solid standoffs with screwDiameter = 0', () => {
      const solidMount: PCBMount = {
        ...baseMountParams,
        screwDiameter: 0,
      };

      const mount = pcbMount(solidMount, {
        pcbMountFilletStyle: 'round',
        pcbMountFilletSize: 1.0,
      });

      expect(mount).toBeDefined();
      const bbox = measureBoundingBox(mount);
      expect(bbox[0][0]).toBeCloseTo(-4, 1);
      expect(bbox[1][0]).toBeCloseTo(4, 1);
    });

    it('honors per-mount style override over global params', () => {
      const mountWithOverride: PCBMount = {
        ...baseMountParams,
        filletStyle: 'none',
      };

      const mount = pcbMount(mountWithOverride, {
        pcbMountFilletStyle: 'round',
        pcbMountFilletSize: 1.0,
      });

      const bbox = measureBoundingBox(mount);
      // With 'none' override, radius is 3 (not 4)
      expect(bbox[0][0]).toBeCloseTo(-3, 1);
      expect(bbox[1][0]).toBeCloseTo(3, 1);
    });
  });

  describe('mount placement and unioning', () => {
    it('returns null when no mounts are defined', () => {
      const params = cloneParams(DEFAULT_PARAMS);
      params.pcbMounts = [];

      expect(pcbMountsOnBase(params)).toBeNull();
      expect(pcbMountsOnLid(params)).toBeNull();
      expect(pcbMounts(params)).toBeNull();
    });

    it('places base mounts on the enclosure floor', () => {
      const params = cloneParams(DEFAULT_PARAMS);
      params.lidScrews = true;
      params.floor = 2;
      params.pcbMounts = [
        {
          surface: 'bottom',
          x: 10,
          y: 15,
          height: 8,
          outerDiameter: 6,
          screwDiameter: 3,
        },
      ];

      const baseMount = pcbMountsOnBase(params);
      expect(baseMount).not.toBeNull();
      const bbox = measureBoundingBox(baseMount!);
      // Base floor is at z = 2, standoff height is 8, so z spans [2, 10]
      expect(bbox[0][2]).toBeCloseTo(2, 1);
      expect(bbox[1][2]).toBeCloseTo(10, 1);
    });

    it('places lid mounts on the lid roof', () => {
      const params = cloneParams(DEFAULT_PARAMS);
      params.roof = 2.5;
      params.pcbMounts = [
        {
          surface: 'top',
          x: 0,
          y: 0,
          height: 6,
          outerDiameter: 6,
          screwDiameter: 3,
        },
      ];

      const lidMount = pcbMountsOnLid(params);
      expect(lidMount).not.toBeNull();
      const bbox = measureBoundingBox(lidMount!);
      // Roof is 2.5, height is 6, so z spans [2.5, 8.5]
      expect(bbox[0][2]).toBeCloseTo(2.5, 1);
      expect(bbox[1][2]).toBeCloseTo(8.5, 1);
    });

    it('unions both base and lid mounts in pcbMounts()', () => {
      const params = cloneParams(DEFAULT_PARAMS);
      params.pcbMounts = [
        {
          surface: 'bottom',
          x: 0,
          y: 0,
          height: 8,
          outerDiameter: 6,
          screwDiameter: 3,
        },
        {
          surface: 'top',
          x: 0,
          y: 0,
          height: 6,
          outerDiameter: 6,
          screwDiameter: 3,
        },
      ];

      const combined = pcbMounts(params);
      expect(combined).not.toBeNull();
    });
  });

  describe('expandPcbMount', () => {
    const sortPoints = (mounts: PCBMount[]) =>
      mounts
        .map((m) => [Math.round(m.x * 1000) / 1000 + 0, Math.round(m.y * 1000) / 1000 + 0])
        .sort((a, b) => a[0] - b[0] || a[1] - b[1]);

    it('returns a single mount unchanged when no pattern is set', () => {
      expect(expandPcbMount(baseMountParams)).toEqual([baseMountParams]);
    });

    it('expands a pair into two mounts the hole distance apart', () => {
      const mounts = expandPcbMount({
        ...baseMountParams,
        x: 5,
        y: 2,
        pattern: 'pair',
        spacingX: 40,
      });
      expect(sortPoints(mounts)).toEqual([
        [-15, 2],
        [25, 2],
      ]);
    });

    it('expands a rectangle into four mounts centred on x/y', () => {
      const mounts = expandPcbMount({
        ...baseMountParams,
        x: 10,
        y: -5,
        pattern: 'rectangle',
        spacingX: 40,
        spacingY: 30,
      });
      expect(mounts.length).toBe(4);
      expect(sortPoints(mounts)).toEqual([
        [-10, -20],
        [-10, 10],
        [30, -20],
        [30, 10],
      ]);
      mounts.forEach((m) => {
        expect(m.height).toBe(baseMountParams.height);
        expect(m.pattern).toBe('single');
      });
    });

    it('rotates the pattern about its centre while preserving spacing', () => {
      const mounts = expandPcbMount({
        ...baseMountParams,
        pattern: 'pair',
        spacingX: 40,
        rotation: 90,
      });
      expect(sortPoints(mounts)).toEqual([
        [0, -20],
        [0, 20],
      ]);
    });

    it('builds base geometry spanning the rectangle pattern', () => {
      const params = cloneParams(DEFAULT_PARAMS);
      params.pcbMountFilletStyle = 'none';
      params.pcbMounts = [{ ...baseMountParams, pattern: 'rectangle', spacingX: 40, spacingY: 30 }];
      const bbox = measureBoundingBox(pcbMountsOnBase(params)!);
      // Outer diameter 6 => footprint spans spacing + 6 in each axis
      expect(bbox[1][0] - bbox[0][0]).toBeCloseTo(46, 1);
      expect(bbox[1][1] - bbox[0][1]).toBeCloseTo(36, 1);
    });
  });
});
