const { statusBarHeight } = wx.getWindowInfo();
const NAV_TOP = statusBarHeight + 12;

Page({
  data: {
    navTopPadding: NAV_TOP,
    targetOpenId: '',
    role: 'technician',
    linkedTechId: '',
    clearTechLink: false,
    technicians: [],
    roleOptions: ['customer', 'technician', 'admin'],
    roleLabels:  ['普通用户', '技师', '管理员'],
    selectedRoleIdx: 1,
    saving: false,
  },

  async onLoad() {
    try {
      const db = wx.cloud.database();
      const res = await db.collection('technicians').orderBy('order', 'asc').get();
      this.setData({ technicians: res.data });
    } catch (e) {}
  },

  onOpenIdInput(e) {
    this.setData({ targetOpenId: e.detail.value });
  },

  async lookupUser() {
    const { targetOpenId, technicians, roleOptions } = this.data;
    if (!targetOpenId.trim()) {
      wx.showToast({ title: '请先输入用户 openId', icon: 'none' }); return;
    }
    wx.showLoading({ title: '查询中...' });
    try {
      const result = await wx.cloud.callFunction({
        name: 'adminSetRole',
        data: { action: 'get', targetOpenId: targetOpenId.trim() },
      });
      wx.hideLoading();
      if (result.result.success) {
        const { role, linkedTechId } = result.result;
        const selectedRoleIdx = Math.max(0, roleOptions.indexOf(role));
        const techIdx = linkedTechId ? technicians.findIndex(t => t._id === linkedTechId) : -1;
        this.setData({
          role,
          selectedRoleIdx,
          linkedTechId:  techIdx >= 0 ? String(techIdx) : '',
          clearTechLink: false,
        });
        wx.showToast({ title: `当前：${this.data.roleLabels[selectedRoleIdx]}`, icon: 'none' });
      } else {
        wx.showToast({ title: result.result.error || '查询失败', icon: 'none' });
      }
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: '网络错误', icon: 'none' });
    }
  },

  onRoleChange(e) {
    const idx = parseInt(e.detail.value);
    // 切换角色时重置关联状态
    this.setData({ selectedRoleIdx: idx, role: this.data.roleOptions[idx], linkedTechId: '', clearTechLink: false });
  },

  selectTech(e) {
    this.setData({ linkedTechId: e.detail.value, clearTechLink: false });
  },

  // 取消关联：提交时会从数据库移除 linkedTechId
  clearTech() {
    this.setData({ linkedTechId: '', clearTechLink: true });
  },

  // 撤销"取消关联"操作
  undoClearTech() {
    this.setData({ clearTechLink: false });
  },

  async submit() {
    const { targetOpenId, role, linkedTechId, clearTechLink, technicians } = this.data;
    if (!targetOpenId.trim()) {
      wx.showToast({ title: '请输入用户 openId', icon: 'none' }); return;
    }
    // admin 和 technician 都支持关联技师档案
    const canLink = role === 'technician' || role === 'admin';
    const techId = canLink ? (technicians[parseInt(linkedTechId)]?._id || '') : '';

    this.setData({ saving: true });
    wx.showLoading({ title: '设置中...' });
    try {
      const result = await wx.cloud.callFunction({
        name: 'adminSetRole',
        data: {
          targetOpenId:  targetOpenId.trim(),
          role,
          linkedTechId:  techId,
          clearTechLink: clearTechLink && !techId,
        },
      });
      wx.hideLoading();
      if (result.result.success) {
        let msg = `已设置为「${this.data.roleLabels[this.data.selectedRoleIdx]}」`;
        if (techId)        msg += '，并关联技师档案';
        else if (clearTechLink) msg += '，并取消技师关联';
        wx.showModal({ title: '设置成功', content: msg, showCancel: false });
        this.setData({ targetOpenId: '', linkedTechId: '', clearTechLink: false });
      } else {
        wx.showToast({ title: result.result.error || '设置失败', icon: 'none' });
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
