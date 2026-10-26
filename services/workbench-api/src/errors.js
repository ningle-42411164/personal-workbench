export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function publicError(error) {
  if (error instanceof ApiError) return error;
  if (error?.name === 'AuthorizationError') return new ApiError(400, 'INVALID_AUTHORIZATION', '授权请求已过期或无效，请重新连接。');
  if (error?.name === 'ZodError') return new ApiError(400, 'INVALID_INPUT', '输入字段不符合接口要求。');
  // 数据库错误可能包含 SQL 或运行配置，不将原始错误返回给模型或网页。
  return new ApiError(503, 'SAVE_UNAVAILABLE', '服务暂时不可用；请保留草稿并使用原请求标识重试。');
}
