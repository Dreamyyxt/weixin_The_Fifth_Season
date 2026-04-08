const app = getApp();

Page({
  data: {
    images: [],
    preferredDate: '',
    minDate: '',
    timeRanges: ['上午 11-13时', '下午 14-17时', '晚上 18-22时'],
    selectedTimeRange: -1,
    needsRemoval: false,
    needsExtension: false,
    name: '',
    phone: '',
    remark: '',
    submitting: false,
  },

  onLoad() {
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const u = app.globalData.userInfo || {};
    this.setData({ minDate: today, name: u.nickname || '', phone: u.phone || '' });
  },

  async chooseImages() {
    if (this.data.images.length >= 4) {
      wx.showToast({ title: '最多上传 4 张图', icon: 'none' }); return;
    }
    try {
      const count = 4 - this.data.images.length;
      const res = await wx.chooseMedia({ count, mediaType: ['image'], sourceType: ['album', 'camera'] });
      wx.showLoading({ title: '上传中...' });
      const uploaded = [];
      for (const file of res.tempFiles) {
        const cloudPath = `quotes/${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;
        const r = await wx.cloud.uploadFile({ cloudPath, filePath: file.tempFilePath });
        uploaded.push(r.fileID);
      }
      wx.hideLoading();
      this.setData({ images: [...this.data.images, ...uploaded] });
    } catch (e) {
      wx.hideLoading();
      if (e.errMsg && !e.errMsg.includes('cancel')) {
        wx.showToast({ title: '上传失败，请重试', icon: 'none' });
      }
    }
  },

  removeImage(e) {
    const idx = e.currentTarget.dataset.idx;
    this.setData({ images: this.data.images.filter((_, i) => i !== idx) });
  },

  onDateChange(e) { this.setData({ preferredDate: e.detail.value }); },

  selectTimeRange(e) {
    const idx = parseInt(e.currentTarget.dataset.idx);
    this.setData({ selectedTimeRange: this.data.selectedTimeRange === idx ? -1 : idx });
  },

  toggleRemoval()   { this.setData({ needsRemoval:   !this.data.needsRemoval }); },
  toggleExtension() { this.setData({ needsExtension: !this.data.needsExtension }); },

  onNameInput(e)   { this.setData({ name:   e.detail.value }); },
  onPhoneInput(e)  { this.setData({ phone:  e.detail.value }); },
  onRemarkInput(e) { this.setData({ remark: e.detail.value }); },

  async submit() {
    const { images, preferredDate, selectedTimeRange, timeRanges, needsRemoval, needsExtension, name, phone, remark } = this.data;
    if (!images.length) { wx.showToast({ title: '请上传参考图', icon: 'none' }); return; }
    if (!name.trim())   { wx.showToast({ title: '请填写姓名', icon: 'none' }); return; }
    if (!/^1[3-9]\d{9}$/.test(phone)) { wx.showToast({ title: '请输入正确手机号', icon: 'none' }); return; }

    this.setData({ submitting: true });
    wx.showLoading({ title: '提交中...' });
    try {
      const res = await wx.cloud.callFunction({
        name: 'createQuoteRequest',
        data: {
          name: name.trim(),
          phone: phone.trim(),
          images,
          preferredDate,
          preferredTimeRange: selectedTimeRange >= 0 ? timeRanges[selectedTimeRange] : '',
          needsRemoval,
          needsExtension,
          remark: remark.trim(),
        },
      });
      wx.hideLoading();
      if (res.result.success) {
        wx.showModal({
          title: '提交成功！',
          content: '我们已收到您的参考图，技师将在 24 小时内为您评估报价。\n\n报价结果可在「我的」页面查看。',
          showCancel: false,
          confirmText: '好的',
          success: () => wx.switchTab({ url: '/pages/profile/index' }),
        });
      } else {
        wx.showToast({ title: res.result.error || '提交失败', icon: 'none' });
      }
    } catch (e) {
      wx.hideLoading();
      console.error('createQuoteRequest error:', e);
      const msg = e && (e.errMsg || e.message) ? (e.errMsg || e.message) : '网络错误，请重试';
      wx.showToast({ title: msg.length > 20 ? '提交失败，请检查网络' : msg, icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  },
});
