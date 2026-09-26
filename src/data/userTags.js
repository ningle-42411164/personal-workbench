// 默认选项独立于事项；选择本身不会给项目自动添加标签。
export const DEFAULT_USER_TAGS = [
  '学习', '代码', '生活', '健康', '购物', '娱乐',
  '创作', '六级', '健身', '手工', '软件开发', '奖励',
];

export function normalizeUserTags(tags) {
  return [...new Set(tags.map(tag => tag.trim().replace(/^#+/, '').trim()).filter(Boolean))];
}

export function availableUserTags(items) {
  return normalizeUserTags([...DEFAULT_USER_TAGS, ...items.flatMap(item => item.tags)]);
}
