import { normalizeUserTags } from './userTags.js';

export const TAG_RULES_KEY = 'personal-workbench.tag-rules.v1';

export function validateTagRules(rules) {
  if (!Array.isArray(rules) || rules.some(rule => !rule || typeof rule.keyword !== 'string' ||
      !rule.keyword.trim() || typeof rule.tag !== 'string' || !rule.tag.trim())) {
    throw new Error('标签规则格式不正确。');
  }
  return rules.map(rule => ({ keyword: rule.keyword.trim(), tag: normalizeUserTags([rule.tag])[0] }))
    .filter(rule => rule.tag);
}

export function readTagRules(storage = localStorage) {
  const raw = storage.getItem(TAG_RULES_KEY);
  return raw === null ? [] : validateTagRules(JSON.parse(raw));
}

export function writeTagRules(rules, storage = localStorage) {
  storage.setItem(TAG_RULES_KEY, JSON.stringify(validateTagRules(rules)));
}

export function matchedTags(title, rules, available, removed = []) {
  const text = title.toLocaleLowerCase();
  return normalizeUserTags(rules.filter(rule => text.includes(rule.keyword.toLocaleLowerCase()) &&
    available.includes(rule.tag) && !removed.includes(rule.tag)).map(rule => rule.tag));
}
