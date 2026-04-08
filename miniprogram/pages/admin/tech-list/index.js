const { statusBarHeight } = wx.getWindowInfo();
const NAV_TOP = statusBarHeight + 12;

Page({
  data: {
    navTopPadding: NAV_TOP,
    technicians: [],
    loading: true,
  },

  onShow() {
    this.loadTechs();
  },

  async loadTechs() {
    this.setData({ loading: true });
    try {
      const db = wx.cloud.database();
      const res = await db.collection('technicians').orderBy('order', 'asc').get();
      this.setData({ technicians: res.data });
    } catch (e) {
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  goEdit(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/admin/tech-edit/index?id=${id}` });
  },

  goSchedule(e) {
    const { id, name } = e.currentTarget.dataset;
    wx.navigateTo({ url: `/pages/admin/tech-schedule/index?techId=${id}&name=${encodeURIComponent(name)}` });
  },

  goAdd() {
    wx.navigateTo({ url: '/pages/admin/tech-edit/index' });
  },

  deleteTech(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '删除技师',
      content: '删除后无法恢复，确认吗？',
      confirmColor: '#C0392B',
      success: async (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '删除中...' });
        try {
          const result = await wx.cloud.callFunction({
            name: 'adminManageTech',
            data: { action: 'delete', tech: { _id: id } },
          });
          wx.hideLoading();
          if (result.result.success) {
            wx.showToast({ title: '已删除', icon: 'success' });
            this.setData({ technicians: this.data.technicians.filter(t => t._id !== id) });
          }
        } catch (err) {
          wx.hideLoading();
          wx.showToast({ title: '删除失败', icon: 'none' });
        }
      },
    });
  },

  goBack() { wx.navigateBack(); },
});
