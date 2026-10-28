import test from 'node:test';
import assert from 'node:assert/strict';
import { createTodo, createNote, createImportantDate, createSimpleItem, validateWorkbenchData } from '../src/data/workbenchData.js';
import { normalizeUserTags } from '../src/data/userTags.js';

test('快速记录各类型的多标签保持原格式并兼容完整备份，空标签仍有效', () => {
  const factories = [() => createTodo('标签待办', false), () => createNote('标签随笔'),
    () => createImportantDate('标签重要日', '2027-01-01'),
    ...['project', 'waiting', 'shopping', 'creation'].map(type => () => createSimpleItem(type, '标签事项'))];
  for (const make of factories) {
    const item = make(); item.tags = normalizeUserTags(['#学习', ' 生活 ', '学习']);
    const restored = validateWorkbenchData(JSON.parse(JSON.stringify({ schemaVersion: 2, items: [item] })));
    assert.deepEqual(restored.items[0].tags, ['学习', '生活']);
    item.tags = []; assert.doesNotThrow(() => validateWorkbenchData({ schemaVersion: 2, items: [item] }));
  }
});

