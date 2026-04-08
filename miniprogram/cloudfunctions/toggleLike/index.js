const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

/**
 * 点赞 / 取消点赞
 * event: { postId }
 * 使用复合 ID `${postId}_${openId}` 保证每人只能点一次
 */
exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  const { postId } = event;

  if (!postId) return { success: false, error: '缺少 postId' };

  // 确保集合存在
  try { await db.createCollection('post_likes'); } catch (e) {}

  const likeId = `${postId}_${OPENID}`;
  const likesRef = db.collection('post_likes');

  let existing = null;
  try {
    const res = await likesRef.doc(likeId).get();
    existing = res.data;
  } catch (e) {
    // 不存在，忽略
  }

  try {
    if (existing) {
      // 已点赞 → 取消
      await likesRef.doc(likeId).remove();
      await db.collection('posts').doc(postId).update({
        data: { likes: _.inc(-1) },
      });
      return { success: true, liked: false };
    } else {
      // 未点赞 → 点赞
      await likesRef.doc(likeId).set({
        data: {
          _openid:   OPENID,
          postId,
          createdAt: db.serverDate(),
        },
      });
      await db.collection('posts').doc(postId).update({
        data: { likes: _.inc(1) },
      });
      return { success: true, liked: true };
    }
  } catch (err) {
    console.error('toggleLike error:', err);
    return { success: false, error: err.message || String(err) };
  }
};
