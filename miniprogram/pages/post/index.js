const app = getApp();

Page({
  data: {
    content: '',
    images: [],
    tags: ['美甲', '美睫', '高定款', '日常打卡', '宠物同行', '环境打卡', 'VIP Room'],
    selectedTags: [],
    maxImages: 6,
    contentMax: 300,
  },

  onContentInput(e) {
    this.setData({ content: e.detail.value });
  },

  chooseImage() {
    const remaining = this.data.maxImages - this.data.images.length;
    if (remaining <= 0) {
      wx.showToast({ title: '最多上传6张图片', icon: 'none' });
      return;
    }
    wx.chooseMedia({
      count: remaining,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const newImages = res.tempFiles.map(f => f.tempFilePath);
        this.setData({ images: [...this.data.images, ...newImages] });
      },
    });
  },

  removeImage(e) {
    const index = e.currentTarget.dataset.index;
    const images = this.data.images.filter((_, i) => i !== index);
    this.setData({ images });
  },

  toggleTag(e) {
    const tag = e.currentTarget.dataset.tag;
    const selected = this.data.selectedTags;
    let newSelected;
    if (selected.includes(tag)) {
      newSelected = selected.filter(t => t !== tag);
    } else if (selected.length < 3) {
      newSelected = [...selected, tag];
    } else {
      wx.showToast({ title: '最多选3个标签', icon: 'none' });
      return;
    }
    this.setData({ selectedTags: newSelected });
  },

  submitPost() {
    const { content, images, selectedTags } = this.data;
    if (!content.trim()) {
      wx.showToast({ title: '请输入内容', icon: 'none' });
      return;
    }
    if (images.length === 0) {
      wx.showToast({ title: '请至少添加一张图片', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '发布中...' });
    setTimeout(() => {
      wx.hideLoading();

      const userInfo = app.globalData.userInfo;
      // 图片路径映射为颜色 key，用于显示色块（真实场景应上传图片）
      const colorPalette = ['pink', 'coral', 'lavender', 'gold', 'green', 'white'];
      const colors = images.slice(0, 2).map((_, i) => colorPalette[i % colorPalette.length]);

      app.addPost({
        user: userInfo.nickname,
        avatar: '🌟',
        level: userInfo.vipLevel.replace('会员', '').replace('卡', '卡') || '普通',
        levelClass: userInfo.vipLevel.includes('金') ? 'gold' : userInfo.vipLevel.includes('银') ? 'silver' : 'normal',
        content: content.trim(),
        colors: colors.length ? colors : ['pink'],
        likes: 0,
        points: 10,
        liked: false,
        time: '刚刚',
        tags: selectedTags,
      });

      const pointsEarned = 10;
      const currentPoints = app.globalData.userInfo.points;
      app.saveUserInfo({ points: currentPoints + pointsEarned });

      wx.showModal({
        title: '发布成功！',
        content: `您的帖子已发布，获得 +${pointsEarned} 积分！\n当前积分：${currentPoints + pointsEarned}`,
        showCancel: false,
        confirmText: '去看看',
        success: () => {
          wx.switchTab({ url: '/pages/community/index' });
        },
      });
    }, 800);
  },
});
