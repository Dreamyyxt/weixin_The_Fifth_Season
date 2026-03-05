const app = getApp();

Page({
  data: {
    avatarUrl: '',
    nickname: '',
    isEdit: false,   // true 时为"编辑资料"模式，false 时为"首次注册"模式
  },

  onLoad(options) {
    const isEdit = options.mode === 'edit';
    if (isEdit) {
      const u = app.globalData.userInfo;
      this.setData({
        isEdit: true,
        avatarUrl: u.avatarUrl || '',
        nickname: u.nickname || '',
      });
    }
  },

  // 微信选择头像（open-type="chooseAvatar"）
  onChooseAvatar(e) {
    this.setData({ avatarUrl: e.detail.avatarUrl });
  },

  // 微信昵称输入（type="nickname"）
  onNicknameInput(e) {
    this.setData({ nickname: e.detail.value });
  },

  submit() {
    const { avatarUrl, nickname, isEdit } = this.data;

    if (!nickname.trim()) {
      wx.showToast({ title: '请输入昵称', icon: 'none' });
      return;
    }

    const updates = {
      nickname: nickname.trim(),
      avatarUrl,
      isRegistered: true,
    };

    // 首次注册时赋初始积分
    if (!isEdit) {
      updates.vipLevel = '普通会员';
      updates.points = 100;
      updates.balance = 0;
    }

    app.saveUserInfo(updates);

    if (isEdit) {
      wx.showToast({ title: '保存成功', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 800);
    } else {
      wx.reLaunch({ url: '/pages/index/index' });
    }
  },
});
