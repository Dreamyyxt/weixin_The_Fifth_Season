const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

/**
 * 获取当前用户的最新资料
 * 云函数用 _id=OPENID 直接读取，绕开客户端 where({}) 依赖 _openid 字段的问题
 */
exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  try {
    const res = await db.collection('users').doc(OPENID).get();
    return { success: true, userInfo: res.data };
  } catch (e) {
    return { success: false, error: '用户不存在' };
  }
};
