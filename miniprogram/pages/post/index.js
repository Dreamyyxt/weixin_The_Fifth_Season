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
    let content = this.data.content;

    if (selected.includes(tag)) {
      // 取消选中：从正文中移除 #tag
      const newSelected = selected.filter(t => t !== tag);
      content = content.split(` #${tag}`).join('').split(`#${tag}`).join('').trim();
      this.setData({ selectedTags: newSelected, content });
    } else if (selected.length < 3) {
      // 选中：在正文末尾追加 #tag
      const newSelected = [...selected, tag];
      content = content ? `${content} #${tag}` : `#${tag}`;
      this.setData({ selectedTags: newSelected, content });
    } else {
      wx.showToast({ title: '最多选3个标签', icon: 'none' });
    }
  },

  async submitPost() {
    const { content, images, selectedTags } = this.data;
    if (!content.trim()) {
      wx.showToast({ title: '请输入内容', icon: 'none' }); return;
    }

    wx.showLoading({ title: images.length > 0 ? '上传图片中...' : '发布中...' });

    try {
      // 1. 上传图片到云存储
      const uploadedUrls = await Promise.all(
        images.map((tempPath, i) =>
          wx.cloud.uploadFile({
            cloudPath: `posts/${Date.now()}_${i}${tempPath.match(/\.\w+$/)?.[0] || '.jpg'}`,
            filePath: tempPath,
          }).then(r => r.fileID)
        )
      );

      wx.showLoading({ title: '发布中...' });

      // 2. 调用云函数创建帖子
      const userInfo = app.globalData.userInfo;
      const res = await wx.cloud.callFunction({
        name: 'createPost',
        data: {
          content:    content.trim(),
          images:     uploadedUrls,
          tags:       selectedTags,
          user:       userInfo.nickname || '用户',
          avatarUrl:  userInfo.avatarUrl || '',
          level:      (userInfo.vipLevel || '普通会员').replace('会员', ''),
          levelClass: userInfo.vipLevel?.includes('金') ? 'gold'
                    : userInfo.vipLevel?.includes('银') ? 'silver' : 'normal',
        },
      });

      wx.hideLoading();

      if (res.result.success) {
        const earned = res.result.pointsEarned;
        const newPoints = (app.globalData.userInfo.points || 0) + earned;
        app.saveUserInfo({ points: newPoints });

        wx.showModal({
          title: '发布成功！',
          content: `帖子已发布，获得 +${earned} 积分！\n当前积分：${newPoints}`,
          showCancel: false,
          confirmText: '去看看',
          success: () => wx.switchTab({ url: '/pages/community/index' }),
        });
      } else {
        wx.showToast({ title: res.result.error || '发布失败', icon: 'none' });
      }
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: '发布失败，请重试', icon: 'none' });
      console.error('submitPost:', e);
    }
  },
});
