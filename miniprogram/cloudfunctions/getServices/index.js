// 返回所有服务大类 + 小项（供预约页使用）
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async () => {
  try {
    const [catRes, svcRes] = await Promise.all([
      db.collection('serviceCategories').orderBy('order', 'asc').get(),
      db.collection('services').orderBy('order', 'asc').get(),
    ]);
    return { success: true, categories: catRes.data, services: svcRes.data };
  } catch (e) {
    return { success: false, error: e.message };
  }
};
