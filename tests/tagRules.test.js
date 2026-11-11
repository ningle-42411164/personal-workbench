import test from 'node:test';
import assert from 'node:assert/strict';
import { matchedTags, readTagRules, writeTagRules, TAG_RULES_KEY } from '../src/data/tagRules.js';
test('匹配只使用已有标签，忽略大小写、去重、尊重同草稿移除', () => {
  const rules = [{keyword:'Vue',tag:'代码'}, {keyword:'课程',tag:'代码'}, {keyword:'课程',tag:'未保存标签'}];
  assert.deepEqual(matchedTags('vue课程', rules, ['代码']), ['代码']);
  assert.deepEqual(matchedTags('vue课程再修改', rules, ['代码'], ['代码']), []);
  assert.deepEqual(matchedTags('其他标题', rules, ['代码']), []);
});
test('规则只存本机独立键，坏格式和存储失败显式报错', () => {
  const values = new Map(); const storage = {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
  assert.deepEqual(readTagRules(storage), []);
  writeTagRules([{keyword:' Vue ',tag:'#代码'}], storage);
  assert.deepEqual([...values.keys()], [TAG_RULES_KEY]);
  assert.deepEqual(readTagRules(storage), [{keyword:'Vue',tag:'代码'}]);
  assert.throws(() => writeTagRules([{keyword:'',tag:'代码'}], storage));
  assert.throws(() => writeTagRules([], {setItem(){throw Error('quota');}}), /quota/);
});
