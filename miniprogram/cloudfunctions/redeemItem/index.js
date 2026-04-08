const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

/**
 * 积分兑换商品
 * event: { productId, productName, points }
 */
exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  const { productId, productName, points } = event;

  // 查询用户当前积分
  const userRes = await db.collection('users').doc(OPENID).get();
  const currentPoints = userRes.data.points;

  if (currentPoints < points) {
    return { success: false, error: '积分不足', currentPoints };
  }

  // 检查库存
  const productRes = await db.collection('products').doc(productId).get();
  if (productRes.data.stock <= 0) {
    return { success: false, error: '库存不足' };
  }

  // 扣除积分
  await db.collection('users').doc(OPENID).update({
    data: { points: _.inc(-points) },
  });

  // 扣减库存
  await db.collection('products').doc(productId).update({
    data: { stock: _.inc(-1) },
  });

  // 写积分日志
  await db.collection('pointsLogs').add({
    data: {
      _openid:   OPENID,
      userId:    OPENID,
      desc:      `兑换 ${productName}`,
      points:    -points,
      type:      'spend',
      createdAt: db.serverDate(),
    },
  });

  // 写兑换记录
  await db.collection('redemptions').add({
    data: {
      _openid:     OPENID,
      userId:      OPENID,
      productId,
      productName,
      points,
      status:      'pending',
      createdAt:   db.serverDate(),
    },
  });

  return { success: true, newPoints: currentPoints - points };
};
