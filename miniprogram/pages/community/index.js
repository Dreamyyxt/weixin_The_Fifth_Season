const app = getApp();
const PAGE_SIZE = 10;

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
    posts: [],
    loading: true,
    hasMore: true,
    page: 0,
  },

  onShow() {
    this.setData({ posts: [], page: 0, hasMore: true }, () => this.fetchPosts());
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 3 });
    }
  },

  async fetchPosts(loadMore = false) {
    if (this.data.loading && loadMore) return;
    this.setData({ loading: true });
    try {
      const db = wx.cloud.database();
      const res = await db.collection('posts')
        .orderBy('createdAt', 'desc')
        .skip(this.data.page * PAGE_SIZE)
        .limit(PAGE_SIZE)
        .get();

      const newPosts = res.data.map(p => ({
        ...p,
        time: this.formatTime(p.createdAt),
        liked: false,
      }));

      const merged = loadMore ? [...this.data.posts, ...newPosts] : newPosts;
      this.setData({
        posts: merged,
        page: this.data.page + 1,
        hasMore: newPosts.length === PAGE_SIZE,
      });
      // 后台刷新作者最新会员等级（不阻塞列表展示）
      this.refreshAuthorLevels(merged);
    } catch (e) {
      wx.showToast({ title: '加载失败，请重试', icon: 'none' });
      console.error('fetchPosts:', e);
    } finally {
      this.setData({ loading: false });
    }
  },

  onReachBottom() {
    if (this.data.hasMore) this.fetchPosts(true);
  },

  formatTime(date) {
    if (!date) return '';
    const d = new Date(date);
    const diff = Date.now() - d;
    if (diff < 60000)     return '刚刚';
    if (diff < 3600000)   return `${Math.floor(diff / 60000)}分钟前`;
    if (diff < 86400000)  return `${Math.floor(diff / 3600000)}小时前`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}天前`;
    return `${d.getMonth() + 1}月${d.getDate()}日`;
  },

  goDetail(e) {
    wx.navigateTo({ url: `/pages/community/detail/index?id=${e.currentTarget.dataset.id}` });
  },

  async toggleLike(e) {
    const id = e.currentTarget.dataset.id;
    // 乐观更新 UI
    const posts = this.data.posts.map(p =>
      p._id === id ? { ...p, liked: !p.liked, likes: p.liked ? p.likes - 1 : p.likes + 1 } : p
    );
    this.setData({ posts });
    try {
      const res = await wx.cloud.callFunction({ name: 'toggleLike', data: { postId: id } });
      if (!res.result.success) {
        throw new Error(res.result.error || '操作失败');
      }
    } catch (e) {
      // 回滚
      const rollback = this.data.posts.map(p =>
        p._id === id ? { ...p, liked: !p.liked, likes: p.liked ? p.likes - 1 : p.likes + 1 } : p
      );
      this.setData({ posts: rollback });
      console.error('toggleLike:', e);
      wx.showToast({ title: e.message || '操作失败', icon: 'none' });
    }
  },

  async refreshAuthorLevels(posts) {
    try {
      const openIds = [...new Set(posts.map(p => p._openid).filter(Boolean))];
      if (!openIds.length) return;
      const res = await wx.cloud.callFunction({ name: 'getUserProfiles', data: { openIds } });
      if (!res.result.success) return;
      const profiles = res.result.profiles;
      const updated = this.data.posts.map(p => {
        const profile = profiles[p._openid];
        if (!profile) return p;
        const display = VIP_DISPLAY[profile.vipLevel] || VIP_DISPLAY['普通会员'];
        return {
          ...p,
          user:       profile.nickname  || p.user,
          avatarUrl:  profile.avatarUrl || p.avatarUrl,
          level:      display.level,
          levelClass: display.levelClass,
        };
      });
      this.setData({ posts: updated });
    } catch (e) {
      // 静默失败，保留存储的展示信息
    }
  },

  goPost() {
    wx.navigateTo({ url: '/pages/post/index' });
  },
});
