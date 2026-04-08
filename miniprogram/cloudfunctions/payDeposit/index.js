const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

// ═══════════════════════════════════════════════════════════════════════════
// 支付模式开关
//   'mock'   — 测试/上线前：跳过真实支付，直接标记定金已付
//   'wechat' — 生产环境：走微信支付 JSAPI 下单，由客户端调用 wx.requestPayment
// ═══════════════════════════════════════════════════════════════════════════
const PAYMENT_MODE = 'mock'; // ← 上线后改为 'wechat'

// ─── 微信支付商户配置（上线前填写） ──────────────────────────────────────────
const MCH_CONFIG = {
  appId:      'YOUR_APP_ID',           // 小程序 AppID（与小程序一致）
  mchId:      'YOUR_MCH_ID',           // 微信商户号
  apiV3Key:   'YOUR_MCH_API_V3_KEY',   // APIv3 密钥（32位字符串）
  // 私钥文件内容（PEM 格式），上线时从文件读入或注入环境变量
  privateKey: 'YOUR_PRIVATE_KEY_PEM',
  serialNo:   'YOUR_CERT_SERIAL_NO',   // API 证书序列号
  // paymentNotify 云函数 HTTP 触发 URL（在云函数控制台开启 HTTP 触发后填写）
  notifyUrl:  'YOUR_PAYMENT_NOTIFY_HTTP_TRIGGER_URL',
};

/**
 * 发起定金支付
 * event: { bookingId: string, amount: number }
 *
 * 返回:
 *   mock 模式  → { success: true, mode: 'mock' }
 *   wechat 模式 → { success: true, mode: 'wechat', payParams: { timeStamp, nonceStr, package, signType, paySign } }
 *   失败        → { success: false, error: string }
 */
exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  const { bookingId, amount, paymentMethod = 'wechat' } = event;

  if (!bookingId || !amount) {
    return { success: false, error: '缺少必要参数' };
  }

  // 核验预约归属
  let booking;
  try {
    const res = await db.collection('bookings').doc(bookingId).get();
    booking = res.data;
  } catch (e) {
    return { success: false, error: '预约不存在' };
  }

  if (booking._openid !== OPENID) {
    return { success: false, error: '无权操作' };
  }
  if (!booking.depositRequired) {
    return { success: false, error: '此预约无需支付定金' };
  }
  if (booking.depositStatus === 'paid') {
    return { success: true, alreadyPaid: true, mode: paymentMethod };
  }

  // ─── 余额支付 ────────────────────────────────────────────────────────────
  if (paymentMethod === 'balance') {
    let user;
    try {
      const userRes = await db.collection('users').doc(OPENID).get();
      user = userRes.data;
    } catch (e) {
      return { success: false, error: '用户信息读取失败' };
    }

    const currentBalance = user.balance || 0;
    if (currentBalance < amount) {
      return {
        success: false,
        error: `余额不足，当前余额 ¥${currentBalance}，需支付 ¥${amount}`,
        insufficientBalance: true,
        currentBalance,
      };
    }

    await db.collection('users').doc(OPENID).update({
      data: { balance: _.inc(-amount) },
    });
    await db.collection('bookings').doc(bookingId).update({
      data: { depositStatus: 'paid', depositPaidAt: db.serverDate(), depositPaymentMethod: 'balance' },
    });
    return { success: true, mode: 'balance', newBalance: currentBalance - amount };
  }

  // ─── Mock 模式：直接标记已付（微信支付占位） ──────────────────────────────
  if (PAYMENT_MODE === 'mock') {
    await db.collection('bookings').doc(bookingId).update({
      data: { depositStatus: 'paid', depositPaidAt: db.serverDate(), depositPaymentMethod: 'wechat' },
    });
    return { success: true, mode: 'mock' };
  }

  // ─── 微信支付模式：JSAPI 预下单 ──────────────────────────────────────────
  // 参考文档：https://pay.weixin.qq.com/wiki/doc/apiv3/apis/chapter3_5_1.shtml
  //
  // TODO: 接入微信支付时完成以下步骤
  //   1. npm install axios（在 package.json dependencies 里添加）
  //   2. 将商户私钥 .pem 文件上传到云函数目录或通过环境变量注入
  //   3. 实现下方 createWechatJsapiPrepay 函数
  //   4. 在微信支付商户后台配置 API 证书和 APIv3 密钥
  //   5. 在云函数控制台为 paymentNotify 开启 HTTP 触发，将 URL 填入 MCH_CONFIG.notifyUrl

  try {
    const outTradeNo = `${bookingId}_dep_${Date.now()}`;
    const prepayId = await createWechatJsapiPrepay({
      ...MCH_CONFIG,
      description:  '服务定金',
      outTradeNo,
      amountFen:    amount * 100,   // 微信支付单位：分
      openid:       OPENID,
    });

    // 生成客户端调起支付所需的签名参数
    const payParams = buildPayParams(MCH_CONFIG, prepayId);
    return { success: true, mode: 'wechat', payParams };
  } catch (e) {
    console.error('wechat pay prepay error:', e);
    return { success: false, error: '微信支付下单失败，请重试' };
  }
};

// ─── 微信支付 JSAPI 预下单（上线时实现） ─────────────────────────────────────
async function createWechatJsapiPrepay({ appId, mchId, apiV3Key, privateKey, serialNo, notifyUrl,
  description, outTradeNo, amountFen, openid }) {
  // TODO: 实现 WeChat Pay v3 JSAPI prepay
  // 参考：https://pay.weixin.qq.com/wiki/doc/apiv3/apis/chapter3_5_1.shtml
  //
  // 大致步骤：
  // const axios = require('axios');
  // const { createSign, getAuthorization } = require('./wechatPayUtils'); // 自行封装
  //
  // const body = { appid: appId, mchid: mchId, description, out_trade_no: outTradeNo,
  //   notify_url: notifyUrl, amount: { total: amountFen, currency: 'CNY' },
  //   payer: { openid } };
  //
  // const authorization = getAuthorization('POST', '/v3/pay/transactions/jsapi',
  //   body, mchId, serialNo, privateKey);
  //
  // const res = await axios.post('https://api.mch.weixin.qq.com/v3/pay/transactions/jsapi',
  //   body, { headers: { Authorization: authorization, 'Content-Type': 'application/json' } });
  //
  // return res.data.prepay_id;

  throw new Error('微信支付尚未配置');
}

// ─── 生成客户端调起支付参数（上线时实现） ────────────────────────────────────
function buildPayParams({ appId, privateKey }, prepayId) {
  // TODO: 生成 wx.requestPayment 所需的签名参数
  // 参考：https://pay.weixin.qq.com/wiki/doc/apiv3/apis/chapter3_5_4.shtml
  //
  // const timeStamp = String(Math.floor(Date.now() / 1000));
  // const nonceStr  = randomString(32);
  // const pkg       = `prepay_id=${prepayId}`;
  // const message   = `${appId}\n${timeStamp}\n${nonceStr}\n${pkg}\n`;
  // const paySign   = sign(message, privateKey); // RSA-SHA256，base64
  // return { timeStamp, nonceStr, package: pkg, signType: 'RSA', paySign };

  throw new Error('微信支付尚未配置');
}
