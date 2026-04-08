const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();

  // Resubmit a rejected quote → reset to pending, clear admin fields
  if (event.action === 'resubmit' && event.id) {
    try {
      const q = await db.collection('quoteRequests').doc(event.id).get();
      if (q.data.userId !== OPENID) return { success: false, error: '无权限' };
      await db.collection('quoteRequests').doc(event.id).update({
        data: {
          status: 'pending',
          price: db.command.remove(),
          recommendedTechId: db.command.remove(),
          recommendedTechName: db.command.remove(),
          adminNote: db.command.remove(),
          durationMin: db.command.remove(),
          mainService: db.command.remove(),
          serviceId:   db.command.remove(),
          serviceName: db.command.remove(),
          addons: db.command.remove(),
          quotedAt: db.command.remove(),
        },
      });
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  // Mark quote as confirmed
  if (event.action === 'confirm' && event.id) {
    try {
      const q = await db.collection('quoteRequests').doc(event.id).get();
      if (q.data.userId !== OPENID) return { success: false, error: '无权限' };
      await db.collection('quoteRequests').doc(event.id).update({ data: { status: 'confirmed' } });
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  // Fetch single quote by ID
  if (event.id) {
    try {
      const res = await db.collection('quoteRequests').doc(event.id).get();
      const q = res.data;
      if (q.userId !== OPENID) return { success: false, error: '无权限' };
      return { success: true, quote: q };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  // Fetch all quotes for user
  const res = await db.collection('quoteRequests')
    .where({ userId: OPENID })
    .orderBy('createdAt', 'desc')
    .limit(50)
    .get();

  return { success: true, quotes: res.data };
};
