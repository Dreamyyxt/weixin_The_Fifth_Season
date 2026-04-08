const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const POINTS_REWARD = 10;

/**
 * 发布帖子，并为用户增加积分
 * event: { content, images, tags, user, avatarUrl, level, levelClass }
 * images: 云存储 fileID 数组（由小程序端 wx.cloud.uploadFile 上传后传入）
 */
exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  const { content, images, tags, user, avatarUrl, level, levelClass } = event;

  if (!content || !content.trim()) {
    return { success: false, error: '内容不能为空' };
  }

  const post = {
    _openid:      OPENID,
    userId:       OPENID,
    user:         user || '用户',
    avatarUrl:    avatarUrl || '',
    level:        level || '普通',
    levelClass:   levelClass || 'normal',
    content:      content.trim(),
    images:       images || [],
    likes:        0,
    commentCount: 0,
    points:       POINTS_REWARD,
    tags:         tags || [],
    createdAt:    db.serverDate(),
  };

  const result = await db.collection('posts').add({ data: post });

  // 给用户加积分
  await db.collection('users').doc(OPENID).update({
    data: { points: _.inc(POINTS_REWARD) },
  });

  // 写积分日志
  await db.collection('pointsLogs').add({
    data: {
      _openid:   OPENID,
      userId:    OPENID,
      desc:      '发帖奖励',
      points:    POINTS_REWARD,
      type:      'earn',
      createdAt: db.serverDate(),
    },
  });

  return { success: true, postId: result._id, pointsEarned: POINTS_REWARD };
};
