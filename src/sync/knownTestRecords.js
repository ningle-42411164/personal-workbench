// 已有真实联调证据对应的固定 ID。只隔离这些记录，不用名称、标签或模糊匹配判断正式数据。
// 原记录与历史继续保留；同名而不同 ID 的个人事项必须照常纳入和显示。
export const KNOWN_TEST_IDS = Object.freeze([
  '8d6e7252-11fb-4917-aa99-05b21aea46cd',
  'd958647d-9398-4af9-bfd5-6730db5969c7',
  'eb92c9cf-0060-499c-9d30-de772b9b7506',
  'ae21a9bf-4431-4294-a6cd-1ea202f11c16',
]);
const ids = new Set(KNOWN_TEST_IDS);
export const isKnownTestRecord = id => ids.has(id);
