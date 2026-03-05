const app = getApp();

Page({
  data: {
    posts: [],
  },

  onShow() {
    // 每次进入页面都刷新，确保详情页的点赞/评论同步回来
    this.setData({ posts: app.globalData.posts });
  },

  goDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/community/detail/index?id=${id}` });
  },

  toggleLike(e) {
    const id = e.currentTarget.dataset.id;
    app.togglePostLike(id);
    this.setData({ posts: app.globalData.posts });
  },

  goPost() {
    wx.navigateTo({ url: '/pages/post/index' });
  },
});
