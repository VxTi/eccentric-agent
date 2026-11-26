// Import the store first: agent-base -> tools -> state/index forms a cycle,
// and the store must be the module that kicks off the agent modules'
// evaluation (as it does in the app, which enters through state/index).
// See src/lib/state/agent-slice.test.ts for the same convention.
import '../state/store';
import { describe, it, expect, vi } from 'vitest';
import { StatusFlag } from '../agent/agent-base';
import { BitSet } from './bitset';

const allFlags = [
  StatusFlag.STREAMING,
  StatusFlag.COMPACTING_CONTEXT,
  StatusFlag.COMPACTING_CONTEXT_FAILED,
  StatusFlag.LOADING_SKILLS,
  StatusFlag.ERROR_LOADING_SKILLS,
  StatusFlag.LOADING_MCPS,
  StatusFlag.ERROR_LOADING_MCPS,
  StatusFlag.ERROR_STREAMING,
];

describe('BitSet', () => {
  it('starts empty and only reports the flags that were actually set', () => {
    const bitset = new BitSet<StatusFlag>(StatusFlag.NONE);

    expect(bitset.flags).toBe(StatusFlag.NONE);
    for (const flag of allFlags) {
      expect(bitset.has(flag)).toBe(false);
    }
  });

  it('does not bitwise-overlap distinct status flags when checking every flag', () => {
    const bitset = new BitSet<StatusFlag>(StatusFlag.NONE);

    for (const flag of allFlags) {
      bitset.clearAll();
      bitset.set(flag);

      expect(bitset.has(flag)).toBe(true);
      for (const other of allFlags) {
        if (other !== flag) {
          expect(
            bitset.has(other),
            `flag ${flag} must not match ${other}`
          ).toBe(false);
        }
      }
    }
  });

  it('preserves an already-set flag when a second independent flag is set', () => {
    const bitset = new BitSet<StatusFlag>(StatusFlag.NONE);

    // Two independent flags are used so that this isolates set() semantics
    // from any bitwise overlap in has().
    bitset.set(StatusFlag.STREAMING);
    expect(bitset.has(StatusFlag.STREAMING)).toBe(true);

    bitset.set(StatusFlag.LOADING_MCPS);
    expect(bitset.has(StatusFlag.LOADING_MCPS)).toBe(true);
    expect(bitset.has(StatusFlag.STREAMING)).toBe(true);
    expect(bitset.flags).toBe(StatusFlag.STREAMING | StatusFlag.LOADING_MCPS);
  });

  it('notifies flag-change subscribers when clearing a flag changes the state', () => {
    const bitset = new BitSet<StatusFlag>(StatusFlag.NONE);
    const listener = vi.fn();
    bitset.on('flag-change', listener);

    bitset.set(StatusFlag.LOADING_SKILLS);
    expect(listener).toHaveBeenCalledTimes(1);

    bitset.clear(StatusFlag.LOADING_SKILLS);
    expect(bitset.has(StatusFlag.LOADING_SKILLS)).toBe(false);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenLastCalledWith(StatusFlag.NONE);
  });

  it('does not notify flag-change subscribers when clearing does not change the state', () => {
    const bitset = new BitSet<StatusFlag>(StatusFlag.NONE);
    const listener = vi.fn();
    bitset.on('flag-change', listener);

    bitset.clear(StatusFlag.LOADING_SKILLS);
    expect(bitset.flags).toBe(StatusFlag.NONE);
    expect(listener).not.toHaveBeenCalled();
  });

  it('update preserves unrelated flags and emits flag-change at most once', () => {
    const bitset = new BitSet<StatusFlag>(StatusFlag.NONE);
    const listener = vi.fn();
    bitset.on('flag-change', listener);

    bitset.set(StatusFlag.STREAMING, StatusFlag.COMPACTING_CONTEXT);
    expect(listener).toHaveBeenCalledTimes(1);

    bitset.update({
      set: [StatusFlag.COMPACTING_CONTEXT_FAILED],
      clear: [StatusFlag.STREAMING],
    });

    // The unrelated COMPACTING_CONTEXT flag must survive the update...
    expect(bitset.has(StatusFlag.COMPACTING_CONTEXT)).toBe(true);
    expect(bitset.has(StatusFlag.COMPACTING_CONTEXT_FAILED)).toBe(true);
    expect(bitset.has(StatusFlag.STREAMING)).toBe(false);
    expect(bitset.flags).toBe(
      StatusFlag.COMPACTING_CONTEXT | StatusFlag.COMPACTING_CONTEXT_FAILED
    );
    // ...and the whole atomic update must emit exactly one flag-change.
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('update does not emit flag-change when the resulting state is unchanged', () => {
    const bitset = new BitSet<StatusFlag>(StatusFlag.NONE);
    const listener = vi.fn();
    bitset.on('flag-change', listener);

    bitset.set(StatusFlag.STREAMING);
    expect(listener).toHaveBeenCalledTimes(1);

    bitset.update({
      set: [StatusFlag.STREAMING],
      clear: [StatusFlag.ERROR_STREAMING],
    });
    expect(bitset.flags).toBe(StatusFlag.STREAMING);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
