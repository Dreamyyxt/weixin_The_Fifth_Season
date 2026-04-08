const app = getApp();

const VIP_DISPLAY = {
  '普通会员': { level: '普通', levelClass: 'normal'    },
  '银卡会员': { level: '银卡', levelClass: 'silver'    },
  '金卡会员': { level: '金卡', levelClass: 'gold'      },
  '铂金会员': { level: '铂金', levelClass: 'platinum'  },
  '黑金会员': { level: '黑金', levelClass: 'blackgold' },
  '钻石会员': { level: '钻石', levelClass: 'diamond'   },
};

Page({
  data: {
    post: null,
    comments: [],
    inputText: '',
    loading: true,
    inputFocused: false,
  },

  onLoad(options) {
    this.postId = options.id;
    this.loadDetail();
  },

  async loadDetail() {
    this.setData({ loading: true });
    try {
      const res = await wx.cloud.callFunction({
        name: 'getPostDetail',
        data: { postId: this.postId },
      });
      if (res.result.success) {
        const post = res.result.post;
        this.setData({ post, comments: res.result.comments });
        // 后台同步作者最新会员等级
        this.refreshAuthorLevel(post._openid);
      }
    } catch (e) {
      wx.showToast({ title: '加载失败', icon: 'none' });
      console.error('loadDetail:', e);
    } finally {
      this.setData({ loading: false });
    }
  },

  async refreshAuthorLevel(openId) {
    if (!openId) return;
    try {
      const res = await wx.cloud.callFunction({ name: 'getUserProfiles', data: { openIds: [openId] } });
      if (!res.result.success) return;
      const profile = res.result.profiles[openId];
      if (!profile || !this.data.post) return;
      const display = VIP_DISPLAY[profile.vipLevel] || VIP_DISPLAY['普通会员'];
      this.setData({
        post: {
          ...this.data.post,
          user:       profile.nickname  || this.data.post.user,
          avatarUrl:  profile.avatarUrl || this.data.post.avatarUrl,
          level:      display.level,
          levelClass: display.levelClass,
        },
      });
    } catch (e) {
      // 静默失败
    }
  },

  async togglePostLike() {
    const post = this.data.post;
    // 乐观更新
    this.setData({
      post: { ...post, liked: !post.liked, likes: post.liked ? post.likes - 1 : post.likes + 1 },
    });
    try {
      const res = await wx.cloud.callFunction({ name: 'toggleLike', data: { postId: this.postId } });
      if (!res.result.success) {
        throw new Error(res.result.error || '操作失败');
      }
    } catch (e) {
      // 回滚
      this.setData({ post });
      console.error('toggleLike:', e);
      wx.showToast({ title: e.message || '操作失败', icon: 'none' });
    }
  },

  focusInput() {
    this.setData({ inputFocused: true });
  },

  onInputFocus() {
    this.setData({ inputFocused: true });
  },

  onInputBlur() {
    this.setData({ inputFocused: false });
  },

  onInputChange(e) {
    this.setData({ inputText: e.detail.value });
  },

  async submitComment() {
    const text = this.data.inputText.trim();
    if (!text) return;

    const userInfo = app.globalData.userInfo;
    this.setData({ inputText: '' });

    try {
      const res = await wx.cloud.callFunction({
        name: 'addComment',
        data: {
          postId:    this.postId,
          text,
          user:      userInfo.nickname || '用户',
          avatarUrl: userInfo.avatarUrl || '',
        },
      });
      if (res.result.success) {
        const newComment = res.result.comment;
        const post = this.data.post;
        this.setData({
          comments: [...this.data.comments, newComment],
          post: { ...post, commentCount: post.commentCount + 1 },
        });
        wx.pageScrollTo({ scrollTop: 99999, duration: 300 });
      }
    } catch (e) {
      wx.showToast({ title: '评论失败', icon: 'none' });
      console.error('submitComment:', e);
    }
  },

  onShareAppMessage() {
    const post = this.data.post;
    return {
      title: `${post ? post.user : ''}的美甲分享 - 第五季`,
      path: `/pages/community/detail/index?id=${this.postId}`,
    };
  },
});
