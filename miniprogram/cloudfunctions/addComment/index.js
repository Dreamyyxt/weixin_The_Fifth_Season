const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

/**
 * 发表评论
 * event: { postId, text, user, avatarUrl }
 */
exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  const { postId, text, user, avatarUrl } = event;

  if (!postId || !text || !text.trim()) {
    return { success: false, error: '参数不完整' };
  }

  const comment = {
    _openid:   OPENID,
    userId:    OPENID,
    postId,
    user:      user || '用户',
    avatarUrl: avatarUrl || '',
    text:      text.trim(),
    likes:     0,
    createdAt: db.serverDate(),
  };

  const result = await db.collection('comments').add({ data: comment });

  // 更新帖子评论数
  await db.collection('posts').doc(postId).update({
    data: { commentCount: _.inc(1) },
  });

  return {
    success: true,
    comment: { ...comment, _id: result._id, time: '刚刚' },
  };
};
