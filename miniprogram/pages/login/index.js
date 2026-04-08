const app = getApp();

Page({
  data: {
    avatarUrl: '',
    nickname: '',
    phone: '',
    gender: '',
    birthday: '',
    isEdit: false,
  },

  onLoad(options) {
    const isEdit = options.mode === 'edit';
    if (isEdit) {
      const u = app.globalData.userInfo;
      this.setData({
        isEdit: true,
        avatarUrl:  u.avatarUrl  || '',
        nickname:   u.nickname   || '',
        phone:      u.phone      || '',
        gender:     u.gender     || '',
        birthday:   u.birthday   || '',
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

  onPhoneInput(e)      { this.setData({ phone: e.detail.value }); },
  onGenderTap(e)       { this.setData({ gender: e.currentTarget.dataset.val }); },
  onBirthdayChange(e)  { this.setData({ birthday: e.detail.value }); },

  async submit() {
    const { avatarUrl, nickname, phone, gender, birthday, isEdit } = this.data;
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
        data: { nickname: nickname.trim(), avatarUrl, phone: phoneTrimmed, gender, birthday },
      });

      const { userInfo } = res.result;
      app.saveUserInfo(userInfo);

      wx.hideLoading();

      if (isEdit) {
        wx.showToast({ title: '保存成功', icon: 'success' });
        setTimeout(() => wx.navigateBack(), 800);
      } else {
        wx.reLaunch({ url: '/pages/welcome/index' });
      }
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: '网络错误，请重试', icon: 'none' });
      console.error('login failed:', e);
    }
  },
});
