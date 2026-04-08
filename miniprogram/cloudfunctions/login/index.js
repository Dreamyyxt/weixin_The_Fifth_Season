const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

/**
 * 用户登录/注册
 * event: { nickname, avatarUrl, phone }
 * - 首次调用：创建用户文档，赠送 100 积分，分配顺序会员编号
 * - 再次调用：若传入资料则更新；若无会员编号则补分配
 */

/**
 * 原子获取下一个会员序号
 * 使用事务保证并发安全，格式为 FS + 6位补零数字（FS000001）
 */
async function getNextMemberNo() {
  try { await db.createCollection('counters'); } catch (e) {}

  // 确保计数器文档存在
  try {
    await db.collection('counters').doc('memberNo').set({ data: { seq: 0 } });
  } catch (e) {
    // 已存在则忽略
  }

  const transaction = await db.startTransaction();
  try {
    let seq = 0;
    try {
      const res = await transaction.collection('counters').doc('memberNo').get();
      seq = res.data.seq || 0;
    } catch (e) {}

    seq += 1;
    await transaction.collection('counters').doc('memberNo').set({ data: { seq } });
    await transaction.commit();

    return 'FS' + String(seq).padStart(6, '0');
  } catch (e) {
    await transaction.rollback();
    throw e;
  }
}

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  const { nickname, avatarUrl, phone, gender, birthday } = event;

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
    const updates = { isRegistered: true };

    // 老用户若无会员编号，补分配
    if (!existing.memberNo) {
      updates.memberNo = await getNextMemberNo();
    }

    if (nickname  !== undefined) updates.nickname  = nickname;
    if (avatarUrl !== undefined) updates.avatarUrl = avatarUrl;
    if (phone     !== undefined) updates.phone     = phone;
    if (gender    !== undefined) updates.gender    = gender;
    if (birthday  !== undefined) updates.birthday  = birthday;

    await usersRef.doc(OPENID).update({ data: updates });
    Object.assign(existing, updates);

    return { success: true, userInfo: existing, isNew: false };
  }

  // 新用户：分配会员编号后创建文档
  const memberNo = await getNextMemberNo();

  const newUser = {
    _openid:      OPENID,
    openId:       OPENID,
    nickname:     nickname || '新用户',
    avatarUrl:    avatarUrl || '',
    phone:        phone || '',
    memberNo,
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
