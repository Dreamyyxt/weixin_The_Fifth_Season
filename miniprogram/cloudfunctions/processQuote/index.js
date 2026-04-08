const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();

  try {
    const userRes = await db.collection('users').doc(OPENID).get();
    const { role } = userRes.data;
    if (!['owner', 'admin', 'technician'].includes(role)) return { success: false, error: '无权限' };
  } catch (e) {
    return { success: false, error: '无权限' };
  }

  const { quoteId, categoryId, mainService, serviceId, serviceName, addons, durationMin, price, techId, techName, adminNote } = event;
  if (!quoteId || !price || !techId) return { success: false, error: '参数缺失：报价金额和推荐技师不能为空' };

  try {
    await db.collection('quoteRequests').doc(quoteId).update({
      data: {
        status: 'quoted',
        categoryId:  categoryId  || '',
        mainService: mainService || '',
        serviceId:   serviceId   || '',
        serviceName: serviceName || '',
        addons: addons || [],
        durationMin: Number(durationMin) || 90,
        price: Number(price),
        recommendedTechId: techId,
        recommendedTechName: techName,
        adminNote: adminNote || '',
        quotedAt: db.serverDate(),
      },
    });
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
};
