const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { success: false, error: '未登录' };

  const { name, phone, images, preferredDate, preferredTimeRange, needsExtension, needsRemoval, remark } = event;
  if (!name || !phone) return { success: false, error: '请填写姓名和手机号' };
  if (!images || !images.length) return { success: false, error: '请至少上传一张参考图' };

  // Ensure collection exists (no-op if already exists)
  try { await db.createCollection('quoteRequests'); } catch (_) {}

  try {
    const res = await db.collection('quoteRequests').add({
      data: {
        userId: OPENID,
        _openid: OPENID,
        name: name.trim(),
        phone: phone.trim(),
        images,
        preferredDate: preferredDate || '',
        preferredTimeRange: preferredTimeRange || '',
        needsExtension: !!needsExtension,
        needsRemoval: !!needsRemoval,
        remark: remark || '',
        status: 'pending', // pending → quoted → confirmed | rejected
        createdAt: db.serverDate(),
      },
    });
    return { success: true, quoteId: res._id };
  } catch (e) {
    return { success: false, error: e.message };
  }
};
