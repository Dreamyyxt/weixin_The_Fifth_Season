const app = getApp();

Page({
  data: {
    avatarUrl: '',
    nickname: '',
    phone: '',
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
        phone: u.phone || '',
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

  onPhoneInput(e) {
    this.setData({ phone: e.detail.value });
  },

  async submit() {
    const { avatarUrl, nickname, phone, isEdit } = this.data;
    const phoneTrimmed = phone.trim();

    if (!nickname.trim()) {
      wx.showToast({ title: '请输入昵称', icon: 'none' });
      return;
    }
    if (phoneTrimmed && !/^1[3-9]\d{9}$/.test(phoneTrimmed)) {
      wx.showToast({ title: '请输入正确的手机号', icon: 'none' });
      return;
    }

    wx.showLoading({ title: isEdit ? '保存中...' : '注册中...' });

    try {
      const res = await wx.cloud.callFunction({
        name: 'login',
        data: { nickname: nickname.trim(), avatarUrl, phone: phoneTrimmed },
      });

      const { userInfo } = res.result;
      app.saveUserInfo(userInfo);

      wx.hideLoading();

      if (isEdit) {
        wx.showToast({ title: '保存成功', icon: 'success' });
        setTimeout(() => wx.navigateBack(), 800);
      } else {
        // 新用户提示赠送积分
        if (res.result.isNew) {
          wx.showModal({
            title: '注册成功！',
            content: '欢迎加入第五季 🎉\n已赠送 100 积分，快去探索吧！',
            showCancel: false,
            confirmText: '开始体验',
            success: () => wx.reLaunch({ url: '/pages/index/index' }),
          });
        } else {
          wx.reLaunch({ url: '/pages/index/index' });
        }
      }
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: '网络错误，请重试', icon: 'none' });
      console.error('login failed:', e);
    }
  },
});
