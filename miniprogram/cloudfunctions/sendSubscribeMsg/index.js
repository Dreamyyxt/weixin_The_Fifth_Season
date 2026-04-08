const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 发送预约确认订阅消息给客户
 * event: { openId, bookingId, serviceName, date, time, techName, finalPrice }
 */
exports.main = async (event) => {
  const { openId, serviceName, date, time, techName } = event;

  if (!openId) return { success: false, error: 'missing openId' };

  const tmplId = process.env.SUBSCRIBE_TMPL_ID;
  if (!tmplId || tmplId === 'YOUR_TEMPLATE_ID_HERE') {
    return { success: false, error: 'SUBSCRIBE_TMPL_ID not configured' };
  }

  try {
    await cloud.openapi.subscribeMessage.send({
      touser: openId,
      templateId: tmplId,
      page: 'pages/profile/index',
      data: {
        thing1: { value: serviceName },           // 服务项目
        time2:  { value: `${date} ${time}` },     // 预约时间
        thing3: { value: techName },              // 技师
        thing4: { value: '第五季 · 期待您的光临' }, // 备注
      },
    });
    return { success: true };
  } catch (e) {
    console.error('sendSubscribeMsg error:', e);
    return { success: false, error: e.message };
  }
};
