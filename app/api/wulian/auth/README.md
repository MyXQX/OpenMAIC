# Wulian Auth API Routes

物联智讲账号与会话 API（需求 7.1 / 7.5 / 7.7 / 12.5）

## 路由列表

### POST /api/wulian/auth/register

注册新账号。

**请求体：**
```json
{
  "username": "string",
  "password": "string"
}
```

**成功响应（201）：**
```json
{
  "success": true,
  "user": {
    "id": "string",
    "username": "string",
    "createdAt": number
  }
}
```

**错误响应：**
- `400 INVALID_REQUEST`：用户名/密码非法（空/超长/含非法字符）
- `409 USERNAME_CONFLICT`：用户名已存在（需求 7.7）
- `500 INTERNAL_ERROR`：服务器内部错误

---

### POST /api/wulian/auth/login

登录并签发会话 cookie。

**请求体：**
```json
{
  "username": "string",
  "password": "string"
}
```

**成功响应（200）：**
```json
{
  "success": true,
  "user": {
    "id": "string",
    "username": "string",
    "createdAt": number
  }
}
```

同时设置 `wulian_session` cookie（httpOnly, sameSite=lax, 7天有效期）。

**错误响应：**
- `400 INVALID_REQUEST`：请求体格式错误
- `401 INVALID_CREDENTIALS`：用户名或密码错误
- `500 INTERNAL_ERROR`：服务器内部错误

---

### POST /api/wulian/auth/logout

登出并清除会话 cookie。

**成功响应（200）：**
```json
{
  "success": true
}
```

同时清除 `wulian_session` cookie（maxAge=0）。

---

### GET /api/wulian/auth/me

获取当前登录用户信息。

**成功响应（200）：**

已登录：
```json
{
  "success": true,
  "user": {
    "id": "string",
    "username": "string",
    "createdAt": number
  }
}
```

未登录：
```json
{
  "success": true,
  "user": null
}
```

**错误响应：**
- `500 INTERNAL_ERROR`：服务器内部错误

---

## 安全特性

1. **密码安全**：使用 scrypt 加盐哈希，绝不存储明文密码（需求 7.2 / 12.4）
2. **会话签名**：HMAC-SHA256 签名的会话 token，定长比较降低时序攻击风险（需求 7.3 / 12.2）
3. **用户名唯一性**：大小写不敏感，冲突返回明确错误码（需求 7.7）
4. **统一错误处理**：使用 apiError 统一错误码格式（需求 12.5）
5. **安全视图**：响应中绝不包含 passwordHash / salt（需求 12.4）

## 依赖模块

- `lib/wulian/auth/accounts.ts`：账号存储与密码哈希
- `lib/wulian/auth/session.ts`：会话签发与校验
- `lib/server/api-response.ts`：统一错误处理

## 测试

底层模块的单元测试：
```bash
pnpm test tests/wulian/accounts.test.ts
pnpm test tests/wulian/session.test.ts
```

API 路由的集成测试需要在实际 Next.js 运行时环境中进行（例如使用 Playwright 或手动测试）。
