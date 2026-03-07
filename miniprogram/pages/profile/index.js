const app = getApp();

Page({
  data: {
    userInfo: {},
    bookingRecords: [],
    pointsLogs: [
      { id: 1, desc: '消费奖励', points: '+30', time: '2026-02-28', type: 'earn' },
      { id: 2, desc: '发帖奖励', points: '+10', time: '2026-02-26', type: 'earn' },
      { id: 3, desc: '兑换徽章', points: '-800', time: '2026-02-20', type: 'spend' },
      { id: 4, desc: '发帖奖励', points: '+10', time: '2026-02-18', type: 'earn' },
      { id: 5, desc: '消费奖励', points: '+20', time: '2026-02-15', type: 'earn' },
    ],
    activeSection: 'booking',
  },

  onShow() {
    this.setData({ 
      userInfo: app.globalData.userInfo,
      bookingRecords: this.loadBookingRecords()
    });
  },

  // 加载预约记录
  loadBookingRecords() {
    const bookings = app.globalData.bookings || [];
    const today = this.formatDate(new Date());
    
    return bookings.map(item => {
      let status = 'pending';
      let statusLabel = '待使用';
      
      if (item.status === 'cancelled') {
        status = 'cancelled';
        statusLabel = '已取消';
      } else if (item.date < today) {
        status = 'done';
        statusLabel = '已完成';
      } else if (item.date === today) {
        status = 'today';
        statusLabel = '今天';
      }
      
      return {
        id: item.id,
        tech: item.techName,
        service: item.serviceName,
        date: item.date,
        time: item.time,
        status,
        statusLabel,
        price: item.price,
        duration: item.duration,
        remark: item.remark,
      };
    }).sort((a, b) => b.id - a.id); // 按预约 ID 倒序，最新的在前
  },

  formatDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  },

  goEdit() {
    wx.navigateTo({ url: '/pages/login/index?mode=edit' });
  },

  switchSection(e) {
    this.setData({ activeSection: e.currentTarget.dataset.sec });
  },

  showRecharge() {
    wx.showModal({
      title: '充值余额',
      content: '充值功能需要接入支付，请联系店铺管理员配置微信支付。',
      showCancel: false,
      confirmText: '知道了',
    });
  },

  // 取消预约
  cancelBooking(e) {
    const bookingId = e.currentTarget.dataset.id;
    const booking = this.data.bookingRecords.find(b => b.id === bookingId);
    
    if (!booking) return;
    
    wx.showModal({
      title: '取消预约',
      content: `确定要取消预约吗？\n\n服务项目：${booking.service}\n技师：${booking.tech}\n时间：${booking.date} ${booking.time}\n\n取消后该时间段将释放给其他用户预约。`,
      confirmText: '确认取消',
      confirmColor: '#E74C3C',
      success: (res) => {
        if (res.confirm) {
          app.cancelBooking(bookingId);
          wx.showToast({ title: '已取消', icon: 'success' });
          // 重新加载预约记录
          this.setData({ bookingRecords: this.loadBookingRecords() });
        }
      },
    });
  },
});
