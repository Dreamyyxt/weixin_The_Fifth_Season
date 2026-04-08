const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

/**
 * 获取帖子详情（帖子 + 评论列表 + 当前用户是否已点赞）
 * event: { postId }
 */
exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  const { postId } = event;

  if (!postId) return { success: false, error: '缺少 postId' };

  const [postRes, commentsRes, likeRecord] = await Promise.all([
    db.collection('posts').doc(postId).get(),
    db.collection('comments')
      .where({ postId })
      .orderBy('createdAt', 'asc')
      .limit(100)
      .get(),
    db.collection('post_likes').doc(`${postId}_${OPENID}`).get().catch(() => null),
  ]);

  const post = postRes.data;
  post.liked = !!likeRecord;

  // 格式化评论时间
  const comments = commentsRes.data.map(c => ({
    ...c,
    time: formatTime(c.createdAt),
  }));

  return { success: true, post, comments };
};

function formatTime(date) {
  if (!date) return '';
  const d = new Date(date);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000)       return '刚刚';
  if (diff < 3600000)     return `${Math.floor(diff / 60000)}分钟前`;
  if (diff < 86400000)    return `${Math.floor(diff / 3600000)}小时前`;
  if (diff < 604800000)   return `${Math.floor(diff / 86400000)}天前`;
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}
