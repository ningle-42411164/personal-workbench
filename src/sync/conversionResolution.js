import { canMoveNote, initialMoveSnapshot } from '../data/workbenchData.js';
import { returnTodo } from '../data/itemOrder.js';

// 只为用户明确选择的分类冲突规划下一步。每步都是现有合法接口，不能直接跨分类覆盖。
export function conversionStep(base, target) {
  if (!base || !target || base.id !== target.id || base.createdAt !== target.createdAt) throw new Error('事项 ID 或创建时间不一致，双方保留，不能转换覆盖。');
  if (base.type === target.type) return { item: target };
  if (base.type === 'todo' && !base.done && (target.type === 'note' || canMoveNote({ ...base, type: 'note' }, target.type))) {
    const [note] = returnTodo([base], base.id);
    return { item: note };
  }
  if (canMoveNote(base, target.type)) return { moveFrom: 'note', item: initialMoveSnapshot(base, target) };
  throw new Error('当前分类之间没有受支持的转换路径，双方内容保留；可以采用云端并保留本机副本。');
}
