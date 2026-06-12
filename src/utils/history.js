import { useState, useCallback, useRef } from "react";

const MAX_HISTORY = 50;

/**
 * useHistory — undo/redo stack for any serializable state.
 * @param {*} initial - The initial state value.
 * @returns {{ state: *, set: (v: *) => void, undo: () => void, redo: () => void, canUndo: boolean, canRedo: boolean }}
 */
export function useHistory(initial) {
  const [index, setIndex] = useState(0);
  const [state, setState] = useState(initial);
  const [stackLen, setStackLen] = useState(1);
  const stackRef = useRef([initial]);

  const set = useCallback((next) => {
    const stack = stackRef.current;
    // Discard any redo entries beyond current index
    const trimmed = stack.slice(0, index + 1);
    trimmed.push(next);
    // Cap history size
    if (trimmed.length > MAX_HISTORY) trimmed.shift();
    stackRef.current = trimmed;
    const newIndex = trimmed.length - 1;
    setIndex(newIndex);
    setState(trimmed[newIndex]);
    setStackLen(trimmed.length);
  }, [index]);

  const undo = useCallback(() => {
    setIndex((i) => {
      const newIndex = Math.max(0, i - 1);
      setState(stackRef.current[newIndex]);
      return newIndex;
    });
  }, []);

  const redo = useCallback(() => {
    setIndex((i) => {
      const newIndex = Math.min(stackRef.current.length - 1, i + 1);
      setState(stackRef.current[newIndex]);
      return newIndex;
    });
  }, []);

  const canUndo = index > 0;
  const canRedo = index < stackLen - 1;

  return { state, set, undo, redo, canUndo, canRedo };
}
