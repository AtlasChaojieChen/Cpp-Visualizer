import type { StackFrameInfo, VariableInfo } from './cpp-engine';

/**
 * Fake machine addresses are rendered as lowercase hex everywhere in the UI
 * (VariableInspector pointer values, HeapView block addresses). Anything that
 * prints an address must go through here so the panels agree.
 */
export const formatAddress = (value: unknown): string => `0x${Number(value).toString(16)}`;

/**
 * Formats one evaluated call argument.
 *
 * `frame.args` holds bare evaluated values with no type information attached,
 * so the integer 104 and a pointer holding address 104 are indistinguishable
 * on their own. `param` is the parameter variable the argument was bound to
 * (see formatFrameLabel) and is the only reliable source of pointer-ness.
 * When it is missing we fall back to plain formatting rather than guessing.
 */
const formatArg = (value: unknown, param?: VariableInfo): string => {
  if (param?.isPointer) return Number(value) === 0 ? 'nullptr' : formatAddress(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  // Chars are stored as JS strings by the engine; the param type disambiguates.
  if (typeof value === 'string') return param?.type === 'char' ? `'${value}'` : `"${value}"`;
  if (Array.isArray(value)) return `[${value.map((v) => formatArg(v)).join(', ')}]`;
  // Structs are plain objects — never let them fall through to String().
  if (value !== null && typeof value === 'object') {
    const fields = Object.entries(value).map(([k, v]) => `${k}: ${formatArg(v)}`);
    return `{ ${fields.join(', ')} }`;
  }
  return String(value);
};

/**
 * Renders a call-stack frame as `name(arg, arg, ...)`.
 *
 * Arguments are correlated with parameters positionally: `callFunction` inserts
 * every parameter into the frame's variable map before executing the body, and
 * the map preserves insertion order, so `frame.variables[i]` is the i-th
 * declared parameter of `frame.args[i]`.
 *
 * Limits of that correlation (both require already-invalid C++ or shadowing,
 * and both degrade to today's plain-decimal output rather than a wrong label):
 *  - more arguments than parameters — the surplus has no parameter to consult;
 *  - a local re-declared with a parameter's name overwrites its map entry.
 */
export const formatFrameLabel = (frame: StackFrameInfo): string => {
  const args = frame.args ?? [];
  const rendered = args.map((a, i) => formatArg(a, frame.variables?.[i])).join(', ');
  return `${frame.name}(${rendered})`;
};
