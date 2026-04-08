const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

/**
 * 管理员更新客户标签/备注
 * event: { targetUserId, tags?, crmNotes? }
 */
exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();

  let caller;
  try {
    const res = await db.collection('users').doc(OPENID).get();
    caller = res.data;
  } catch (e) {
    return { success: false, error: '用户不存在' };
  }
  if (caller.role !== 'admin') return { success: false, error: '无权限' };

  const {
    targetUserId, tags, crmNotes,
    stylePrefs, priceSensitivity, likesPosting, hasPet,
    techPreference, timePreference,
  } = event;
  if (!targetUserId) return { success: false, error: '缺少 targetUserId' };

  const update = {};
  if (tags             !== undefined) update.tags             = tags;
  if (crmNotes         !== undefined) update.crmNotes         = crmNotes;
  if (stylePrefs       !== undefined) update.stylePrefs       = stylePrefs;
  if (priceSensitivity !== undefined) update.priceSensitivity = priceSensitivity;
  if (likesPosting     !== undefined) update.likesPosting     = likesPosting;
  if (hasPet           !== undefined) update.hasPet           = hasPet;
  if (techPreference   !== undefined) update.techPreference   = techPreference;
  if (timePreference   !== undefined) update.timePreference   = timePreference;

  await db.collection('users').doc(targetUserId).update({ data: update });
  return { success: true };
};
