# docs

Engineering records. All three are historical — the work they describe is done.
They are kept because they explain *why* the engine looks the way it does, which
the code cannot say on its own.

| File | What it is |
|---|---|
| `PLAN.md` | The bug-fix plan the branch followed, stage by stage. Its "Revision notes" section records four things the original bug list missed and two it stated wrongly — worth reading before trusting any older bug inventory. **Complete.** |
| `type-tracking-design.md` | Why `7.0 / 2` truncated, and why the fix computes an expression's static type instead of tagging values with their C++ type. The rejected option is the interesting half: tagging values would have put objects into the snapshot format, which is what every UI panel renders. **Implemented.** |
| `return-values-design.md` | How a function's return value reaches the UI without adding a single execution step. Also corrects `PLAN.md`'s account of where the returning frame lives. **Implemented.** |

Both design docs were written and reviewed *before* the code, and were left
unedited except for a status header and, in one case, a note recording where the
implementation deviated from the design. That deviation is the point of keeping
them.
