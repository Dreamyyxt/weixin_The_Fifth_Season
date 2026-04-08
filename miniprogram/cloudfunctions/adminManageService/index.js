// CRUD for serviceCategories + services collections
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();

  // Auth: only owner/admin
  try {
    const u = await db.collection('users').doc(OPENID).get();
    if (!['owner', 'admin'].includes(u.data.role)) return { success: false, error: '无权限' };
  } catch (_) {
    return { success: false, error: '无权限' };
  }

  const { action, target, data, id } = event;
  // target: 'category' | 'service'
  const col = target === 'category' ? 'serviceCategories' : 'services';

  try {
    if (action === 'save') {
      const doc = { ...data };
      if (target === 'service') {
        doc.price       = Number(doc.price)       || 0;
        doc.durationMin = Number(doc.durationMin) || 30;
        doc.order       = Number(doc.order)       || 99;
        doc.isQuote     = !!doc.isQuote;
        doc.subgroup    = doc.subgroup || '';
      }
      if (target === 'category') {
        doc.order = Number(doc.order) || 99;
      }
      if (id) {
        delete doc._id;
        await db.collection(col).doc(id).update({ data: doc });
        return { success: true, id };
      } else {
        const res = await db.collection(col).add({ data: doc });
        return { success: true, id: res._id };
      }
    }

    if (action === 'delete') {
      await db.collection(col).doc(id).remove();
      return { success: true };
    }

    return { success: false, error: '未知操作' };
  } catch (e) {
    return { success: false, error: e.message };
  }
};
