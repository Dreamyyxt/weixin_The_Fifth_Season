const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

/**
 * 用户登录/注册
 * event: { nickname, avatarUrl, phone }
 * - 首次调用：创建用户文档，赠送 100 积分
 * - 再次调用：若传入资料则更新
 */
exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  const { nickname, avatarUrl, phone } = event;

  // 确保集合存在（首次调用时自动创建）
  try { await db.createCollection('users'); } catch (e) {}
  try { await db.createCollection('pointsLogs'); } catch (e) {}

  const usersRef = db.collection('users');

  let existing = null;
  try {
    const res = await usersRef.doc(OPENID).get();
    existing = res.data;
  } catch (e) {
    // 文档不存在时 doc().get() 会抛错，忽略
  }

  if (existing) {
    // 已注册用户：如果传了新资料则更新
    if (nickname !== undefined || avatarUrl !== undefined || phone !== undefined) {
      const updates = { isRegistered: true };
      if (nickname !== undefined)  updates.nickname  = nickname;
      if (avatarUrl !== undefined) updates.avatarUrl = avatarUrl;
      if (phone !== undefined)     updates.phone     = phone;
      await usersRef.doc(OPENID).update({ data: updates });
      Object.assign(existing, updates);
    }
    return { success: true, userInfo: existing, isNew: false };
  }

  // 新用户：创建文档（用 doc(OPENID).set 确保以 OPENID 为文档 _id）
  const newUser = {
    openId:       OPENID,
    nickname:     nickname || '新用户',
    avatarUrl:    avatarUrl || '',
    phone:        phone || '',
    vipLevel:     '普通会员',
    memberLevel:  0,
    points:       100,
    balance:      0,
    totalSpend:   0,
    totalTopUp:   0,
    isRegistered: true,
    bookingCount: 0,
    createdAt:    db.serverDate(),
  };
  await usersRef.doc(OPENID).set({ data: newUser });

  // 写入欢迎积分日志
  await db.collection('pointsLogs').add({
    data: {
      _openid:   OPENID,
      userId:    OPENID,
      desc:      '注册奖励',
      points:    100,
      type:      'earn',
      createdAt: db.serverDate(),
    },
  });

  return { success: true, userInfo: newUser, isNew: true };
};
