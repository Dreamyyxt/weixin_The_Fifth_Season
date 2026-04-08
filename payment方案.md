# 支付方案设计文档

## 背景

小程序内收款需要微信支付商户号（营业执照审核），短期内无法直接接入。
以下三种方案从简到复，按业务发展阶段依次升级。

---

## 方案 A — App 管账，线下收款（当前实现）

### 流程
```
用户预约
  └→ 需要定金（120分钟以上服务）→ App 内扣款（mock）/ 微信支付（上线后）
      └→ 技师确认预约 → 用户看到「预约已确认」

到店服务
  └→ 技师标记完成 + 填写实际金额
      └→ 用户 App 内看到最终价格 + 「支付订单」按键变为可用
          └→ 用户现场扫技师/收款码付款（微信/支付宝/现金）
              └→ 技师/管理员手动在后台标记已收款（或 App 内支付 mock）
                  └→ 订单归档完成
```

### 数据字段
- `price`：预约时的参考价格
- `finalPrice`：技师标记完成时填入的实际金额
- `paymentStatus`：`'unpaid'` | `'paid'`
- `depositRequired / depositAmount / depositStatus`：定金相关

### 优缺点
- ✅ 现在就能用，无需商户资质
- ✅ App 有完整预约和金额记录
- ❌ 收款不经过 App，对账靠人工

---

## 方案 B — App 完成后推送付款（推荐上线后升级）

### 前置条件
- 微信支付商户号（营业执照 + 审核）
- 小程序绑定商户号
- 订阅消息推送权限（可选）

### 流程
```
技师标记完成 + 填写最终金额
  └→ 用户 App 内「支付订单」变为可用
      └→ 用户点击 → wx.requestPayment（微信收银台）
          └→ 支付成功 → 订单自动归档
          └→ 同时 paymentNotify 云函数服务端二次确认
```

### 升级步骤
1. 注册微信商户号，完成资质审核
2. 在 `payDeposit/index.js` 和 `payOrder/index.js` 中填写 `MCH_CONFIG`
3. 实现 `createWechatJsapiPrepay` 和 `buildPayParams` 函数（文件内有 TODO + 文档链接）
4. 在云开发控制台为 `paymentNotify` 开启 HTTP 触发，填入 `notifyUrl`
5. 实现 `paymentNotify/index.js` 内的签名验证和资源解密（文件内有 TODO）
6. 将 `payDeposit/index.js` 和 `payOrder/index.js` 中 `PAYMENT_MODE` 改为 `'wechat'`
7. 重新部署两个云函数

### 优缺点
- ✅ 全流程闭环，数据最干净
- ✅ 自动对账，减少人工
- ❌ 需要商户资质（营业执照）+ 审核周期（约 1-3 个工作日）

---

## 方案 C — 到店扫码收款（介于 A / B 之间）

### 前置条件
- 微信支付商户号（同方案 B）
- 商家收款码（已有 PayCode）

### 流程
```
技师标记完成 + 填写最终金额
  └→ App 生成收款二维码（金额 = 总价 - 已付定金）
      └→ 用户扫码 → 微信/支付宝直接付款
          └→ 商户后台可查流水；App 端需手动标记已收款
```

### 说明
- 技术上简单，但 App 无法自动感知是否已付款（需人工确认）
- 不推荐作为最终方案，可作为过渡

---

## 关键文件速查

| 文件 | 作用 |
|------|------|
| `cloudfunctions/payDeposit/index.js` | 定金支付，顶部有 `PAYMENT_MODE` 开关 |
| `cloudfunctions/payOrder/index.js` | 订单尾款支付，同样有 `PAYMENT_MODE` 开关 |
| `cloudfunctions/paymentNotify/index.js` | 微信支付回调，上线后实现 TODO 部分 |
| `cloudfunctions/adminUpdateBooking/index.js` | 标记完成时写入 `finalPrice` + `paymentStatus` |
| `pages/profile/booking-detail/` | 用户订单详情页 + 支付按键 |
| `pages/admin/bookings/index.js` | 完成订单弹窗（填写实际金额） |
