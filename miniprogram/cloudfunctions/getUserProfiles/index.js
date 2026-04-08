const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

/**
 * 批量获取用户最新的展示信息（供社区帖子实时同步会员等级）
 * event: { openIds: string[] }
 * 返回: { profiles: { [openId]: { nickname, avatarUrl, vipLevel, memberLevel } } }
 */
exports.main = async (event, context) => {
  const { openIds } = event;
  if (!openIds || !openIds.length) return { success: true, profiles: {} };

  try {
    const res = await db.collection('users')
      .where({ _id: _.in(openIds) })
      .field({ _id: true, nickname: true, avatarUrl: true, vipLevel: true, memberLevel: true })
      .limit(openIds.length)
      .get();

    const profiles = {};
    for (const u of res.data) {
      profiles[u._id] = {
        nickname:    u.nickname    || '用户',
        avatarUrl:   u.avatarUrl   || '',
        vipLevel:    u.vipLevel    || '普通会员',
        memberLevel: u.memberLevel || 0,
      };
    }
    return { success: true, profiles };
  } catch (e) {
    return { success: false, profiles: {} };
  }
};
