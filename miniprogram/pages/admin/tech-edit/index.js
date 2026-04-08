const app = getApp();

const { statusBarHeight } = wx.getWindowInfo();
const NAV_TOP = statusBarHeight + 12;

Page({
  data: {
    navTopPadding: NAV_TOP,
    isNew: true,
    techId: '',
    role: app.globalData.userInfo.role || '',
    form: {
      name: '', title: '', avatar: '', priceFrom: '',
      badge: '', desc: '', order: 99,
    },
    skillInput: '',
    skills: [],
    saving: false,
  },

  onLoad(options) {
    const id = options.id;
    if (id) {
      this.setData({ isNew: false, techId: id });
      this.loadTech(id);
    }
  },

  async loadTech(id) {
    wx.showLoading({ title: '加载中...' });
    try {
      const db = wx.cloud.database();
      const res = await db.collection('technicians').doc(id).get();
      const t = res.data;
      this.setData({
        form: {
          name:      t.name      || '',
          title:     t.title     || '',
          avatar:    t.avatar    || '',
          priceFrom: String(t.priceFrom || ''),
          badge:     t.badge     || '',
          desc:      t.desc      || '',
          order:     t.order     || 99,
        },
        skills: t.skills || [],
      });
    } catch (e) {
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  async chooseAvatar() {
    try {
      const res = await wx.chooseMedia({ count: 1, mediaType: ['image'], sourceType: ['album', 'camera'] });
      const tempPath = res.tempFiles[0].tempFilePath;
      wx.showLoading({ title: '上传中...' });
      const cloudPath = `techs/avatar_${Date.now()}.jpg`;
      const uploadRes = await wx.cloud.uploadFile({ cloudPath, filePath: tempPath });
      wx.hideLoading();
      this.setData({ 'form.avatar': uploadRes.fileID });
    } catch (e) {
      wx.hideLoading();
      if (e.errMsg && !e.errMsg.includes('cancel')) {
        wx.showToast({ title: '上传失败', icon: 'none' });
      }
    }
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [`form.${field}`]: e.detail.value });
  },

  onSkillInput(e) {
    this.setData({ skillInput: e.detail.value });
  },

  addSkill() {
    const s = this.data.skillInput.trim();
    if (!s) return;
    if (this.data.skills.includes(s)) {
      wx.showToast({ title: '已存在', icon: 'none' }); return;
    }
    this.setData({ skills: [...this.data.skills, s], skillInput: '' });
  },

  removeSkill(e) {
    const idx = e.currentTarget.dataset.idx;
    const skills = this.data.skills.filter((_, i) => i !== idx);
    this.setData({ skills });
  },

  async save() {
    const { form, skills, techId, isNew } = this.data;
    if (!form.name.trim()) {
      wx.showToast({ title: '请输入技师姓名', icon: 'none' }); return;
    }
    this.setData({ saving: true });
    wx.showLoading({ title: '保存中...' });
    try {
      const tech = {
        ...form,
        skills,
        priceFrom: Number(form.priceFrom) || 0,
        order:     Number(form.order)     || 99,
      };
      if (!isNew) tech._id = techId;

      const result = await wx.cloud.callFunction({
        name: 'adminManageTech',
        data: { action: 'save', tech },
      });
      wx.hideLoading();
      if (result.result.success) {
        wx.showToast({ title: '保存成功', icon: 'success' });
        setTimeout(() => wx.navigateBack(), 800);
      } else {
        wx.showToast({ title: result.result.error || '保存失败', icon: 'none' });
      }
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: '网络错误', icon: 'none' });
    } finally {
      this.setData({ saving: false });
    }
  },

  goBack() { wx.navigateBack(); },
});
