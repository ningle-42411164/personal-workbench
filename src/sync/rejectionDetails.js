// 仅投影本机已保存的诊断字段，不读取凭据、不联网，也不改写原请求。
export function rejectionDetails(snapshot, id) {
  const blocked = snapshot?.blocked?.[id];
  const job = snapshot?.outbox?.[id] ?? Object.values(snapshot?.outbox ?? {}).find(value => value.entries?.some(entry => entry.id === id));
  const entry = job?.entries?.find(value => value.id === id) ?? job;
  const binding = snapshot?.bindings?.[id];
  const local = snapshot?.data?.items?.find(item => item.id === id);
  const rows = [
    ['错误码', blocked?.code || '未保存错误码'],
    ['事项 ID', id],
    ['请求 ID', job?.requestId ?? '无已保存请求'],
    ['原请求预期云端版本', entry?.expectedVersion ?? '未保存'],
    ['本机绑定版本', binding?.version ?? '尚未绑定'],
    ['原请求分类', entry?.item?.type ?? (entry?.item === null ? '删除请求' : '未保存')],
    ['原请求创建时间', entry?.item?.createdAt ?? '未保存'],
    ['转换协议标记', entry?.moveFrom ?? '无'],
    ['绑定时云端分类', binding?.base?.type ?? '未保存'],
    ['绑定时云端创建时间', binding?.base?.createdAt ?? '未保存'],
    ['当前本机分类', local?.type ?? '本机已删除'],
    ['当前本机创建时间', local?.createdAt ?? '未保存'],
  ];
  return rows.map(([label, value]) => ({ label, value: String(value) }));
}
