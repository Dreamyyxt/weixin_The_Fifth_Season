const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

// ═══════════════════════════════════════════════════════════════════════════
// 微信支付回调通知处理
//
// 上线步骤：
//   1. 在微信云开发控制台，为此云函数开启"HTTP 触发"
//   2. 将生成的 HTTPS URL 填入 payDeposit/index.js → MCH_CONFIG.notifyUrl
//   3. 在微信商户平台回调配置里填写相同的 URL
//   4. 实现下方的签名验证和资源解密（TODO 部分）
//
// 参考文档：https://pay.weixin.qq.com/wiki/doc/apiv3/wechatpay/wechatpay4_1.shtml
// ═══════════════════════════════════════════════════════════════════════════

// APIv3 密钥（与 payDeposit/index.js 中一致）
const MCH_API_V3_KEY = 'YOUR_MCH_API_V3_KEY';

exports.main = async (event, context) => {
  // HTTP 触发时，请求体在 event.body（string）
  let body;
  try {
    body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
  } catch (e) {
    return httpReply(400, 'FAIL', '请求体解析失败');
  }

  // ─── TODO: 验证微信支付通知签名 ────────────────────────────────────────
  // 参考：https://pay.weixin.qq.com/wiki/doc/apiv3/wechatpay/wechatpay4_1.shtml
  //
  // const wechatPaySerial = event.headers['Wechatpay-Serial'];
  // const wechatPaySign   = event.headers['Wechatpay-Signature'];
  // const wechatPayTs     = event.headers['Wechatpay-Timestamp'];
  // const wechatPayNonce  = event.headers['Wechatpay-Nonce'];
  //
  // const signMessage = `${wechatPayTs}\n${wechatPayNonce}\n${event.body}\n`;
  // const isValid = verifySign(signMessage, wechatPaySign, wechatPayCert); // RSA-SHA256
  // if (!isValid) return httpReply(401, 'FAIL', '签名验证失败');

  // ─── TODO: 解密 resource 对象 ──────────────────────────────────────────
  // 参考：https://pay.weixin.qq.com/wiki/doc/apiv3/wechatpay/wechatpay4_2.shtml
  //
  // const { algorithm, ciphertext, associated_data, nonce } = body.resource;
  // const plaintext = aesGcmDecrypt(MCH_API_V3_KEY, nonce, associated_data, ciphertext);
  // const resource  = JSON.parse(plaintext);
  //
  // const { out_trade_no: outTradeNo, trade_state: tradeState } = resource;
  //
  // ─── 处理支付成功通知 ───────────────────────────────────────────────────
  // if (tradeState === 'SUCCESS') {
  //   // outTradeNo 格式：{bookingId}_dep_{timestamp}（见 payDeposit/index.js）
  //   const bookingId = outTradeNo.split('_dep_')[0];
  //   try {
  //     await db.collection('bookings').doc(bookingId).update({
  //       data: { depositStatus: 'paid', depositPaidAt: db.serverDate() },
  //     });
  //   } catch (e) {
  //     console.error('paymentNotify update failed:', e);
  //     return httpReply(500, 'FAIL', '数据库更新失败');
  //   }
  // }

  // 必须在 5 秒内返回 200 + 以下 JSON，否则微信会重试通知
  return httpReply(200, 'SUCCESS', '成功');
};

function httpReply(statusCode, code, message) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, message }),
  };
}
