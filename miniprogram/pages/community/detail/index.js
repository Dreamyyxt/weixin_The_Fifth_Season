const app = getApp();

Page({
  data: {
    post: null,
    inputText: '',
    inputFocus: false,
  },

  onLoad(options) {
    const id = parseInt(options.id);
    this.postId = id;
    this.refreshPost();
  },

  onShow() {
    this.refreshPost();
  },

  refreshPost() {
    const post = app.getPostById(this.postId);
    if (post) this.setData({ post });
  },

  togglePostLike() {
    app.togglePostLike(this.postId);
    this.refreshPost();
  },

  toggleCommentLike(e) {
    const commentId = e.currentTarget.dataset.cid;
    const post = app.getPostById(this.postId);
    const comment = post.commentList.find(c => c.id === commentId);
    if (!comment) return;
    comment.liked = !comment.liked;
    comment.likes += comment.liked ? 1 : -1;
    this.refreshPost();
  },

  onInputFocus() {
    this.setData({ inputFocus: true });
  },

  onInputBlur() {
    this.setData({ inputFocus: false });
  },

  onInputChange(e) {
    this.setData({ inputText: e.detail.value });
  },

  submitComment() {
    const text = this.data.inputText.trim();
    if (!text) return;

    const userInfo = app.globalData.userInfo;
    app.addComment(this.postId, {
      user: userInfo.nickname,
      avatar: '🌟',
      text,
      time: '刚刚',
    });
    this.setData({ inputText: '' });
    this.refreshPost();

    // 滚动到评论区底部
    wx.pageScrollTo({ scrollTop: 99999, duration: 300 });
  },

  onShareAppMessage() {
    const post = this.data.post;
    return {
      title: `${post.user} 的美甲分享 - 第五季`,
      path: `/pages/community/detail/index?id=${this.postId}`,
    };
  },
});
